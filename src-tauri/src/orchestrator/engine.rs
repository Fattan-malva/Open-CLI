//! Native run engine: creates runs, plans, prepares workspaces, executes the
//! dispatch loop, and integrates completed work. Pure decisions come from
//! `logic`; this module owns I/O, persistence and events.

use super::commands::{
    artifact_ready, create_workspace, dispatch_prompt, emit_event, orchestrator_root,
    send_prompt, workspace_by_id,
};
use super::git;
use super::logic::context::{
    build_plan_prompt, build_task_prompt, clamp, BrowserContext, PlanPromptInput, TaskPromptInput,
    TaskPromptTask,
};
use super::logic::dag::{validate_dag, DagTask};
use super::logic::planner::parse_plan;
use super::logic::scheduler::{
    select_dispatchable, should_unblock, AgentSession, RunSettings, SchedTask, SchedulerInput,
    Workspace as SchedWorkspace,
};
use super::logic::state::{is_terminal_task_state, TaskState};
use super::logic::validation::{
    build_report, validate_evidence, Evidence, ReportInput, ReportTask, ReportWorkspace,
};
use super::store::{now, OrchestratorStore};
use crate::PtyState;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const PLAN_TIMEOUT_MS: u64 = 180_000;
const EVIDENCE_TIMEOUT_MS: u64 = 120_000;

fn str_of<'a>(value: &'a Value, key: &str) -> &'a str {
    value.get(key).and_then(Value::as_str).unwrap_or("")
}

fn str_list(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_str).map(str::to_string).collect())
        .unwrap_or_default()
}

fn to_err<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

fn new_id(prefix: &str) -> String {
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    format!("{}-{}", prefix, &suffix[..10])
}

fn run_dir(app: &AppHandle, run_id: &str) -> Result<PathBuf, String> {
    let safe: String = run_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let path = orchestrator_root(app)?.join("runs").join(safe);
    std::fs::create_dir_all(&path).map_err(to_err)?;
    Ok(path)
}

fn write_file(path: &str, contents: &str) -> Result<(), String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(to_err)?;
    }
    std::fs::write(path, contents).map_err(to_err)
}

fn load_run(store: &OrchestratorStore, run_id: &str) -> Result<Value, String> {
    store
        .get("runs", run_id)?
        .ok_or_else(|| format!("Run {} not found", run_id))
}

fn load_task(store: &OrchestratorStore, task_id: &str) -> Result<Value, String> {
    store
        .get("tasks", task_id)?
        .ok_or_else(|| format!("Task {} not found", task_id))
}

fn run_tasks(store: &OrchestratorStore, run_id: &str) -> Result<Vec<Value>, String> {
    let snapshot = store.snapshot()?;
    Ok(snapshot["tasks"]
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|task| str_of(task, "runId") == run_id)
        .collect())
}

fn put_run(store: &OrchestratorStore, run: &Value) -> Result<(), String> {
    let id = str_of(run, "id").to_string();
    let state = str_of(run, "state").to_string();
    store.upsert("runs", &id, &id, &state, run).map(|_| ())
}

fn put_task(store: &OrchestratorStore, task: &Value) -> Result<(), String> {
    let id = str_of(task, "id").to_string();
    let run_id = str_of(task, "runId").to_string();
    let status = str_of(task, "status").to_string();
    store.upsert("tasks", &id, &run_id, &status, task).map(|_| ())
}

fn emit(
    app: &AppHandle,
    store: &OrchestratorStore,
    run_id: &str,
    task_id: Option<&str>,
    event_type: &str,
    payload: Value,
) -> Result<(), String> {
    let sequence = store.next_sequence(run_id)?;
    let event = json!({
        "id": format!("{}:{}:{}", run_id, sequence, event_type),
        "sequence": sequence,
        "runId": run_id,
        "taskId": task_id,
        "type": event_type,
        "timestamp": now(),
        "payload": payload,
    });
    emit_event(app, store, &event).map(|_| ())
}

fn set_run_state(
    app: &AppHandle,
    store: &OrchestratorStore,
    run: &mut Value,
    state: &str,
) -> Result<(), String> {
    run["state"] = json!(state);
    run["updatedAt"] = json!(now());
    put_run(store, run)?;
    let run_id = str_of(run, "id").to_string();
    emit(app, store, &run_id, None, &format!("run.{}", state), json!({}))
}

fn dag_tasks(tasks: &[Value]) -> Result<Vec<DagTask>, String> {
    tasks
        .iter()
        .map(|task| serde_json::from_value::<DagTask>(task.clone()).map_err(to_err))
        .collect()
}

/// Creates a run in `draft` state, as `createRun` did in TypeScript.
pub fn create_run(
    app: &AppHandle,
    request: &str,
    project_root: &str,
    context: Value,
    attachments: Value,
) -> Result<Value, String> {
    let store = app.state::<OrchestratorStore>();
    let timestamp = now();
    let run = json!({
        "id": new_id("run"),
        "request": request,
        "projectRoot": project_root,
        "state": "draft",
        "coordinatorId": null,
        "plan": null,
        "settings": {
            "maxConcurrentAgents": 2,
            "maxRetries": 1,
            "isolationMode": "worktree",
            "autoApproveScoped": true,
        },
        "context": context,
        "attachments": attachments,
        "createdAt": timestamp,
        "updatedAt": timestamp,
    });
    put_run(&store, &run)?;
    emit(app, &store, str_of(&run, "id"), None, "run.created", json!({}))?;
    Ok(run)
}

fn plan_instruction(artifact_dir: &str) -> String {
    [
        "Create the orchestration plan for this request.".to_string(),
        format!("Read the full instructions from {}/plan.prompt.txt.", artifact_dir),
        format!("Write ONLY the validated JSON plan to {}/plan.json.", artifact_dir),
        "Then reply with a single short line: PLAN_WRITTEN".to_string(),
    ]
    .join("\n")
}

/// Asks the coordinator to write a plan, validates it, and stores the planned tasks.
pub async fn plan_run(app: AppHandle, run_id: String, session_id: String) -> Result<Value, String> {
    let store = app.state::<OrchestratorStore>();
    let pty = app.state::<PtyState>();
    let mut run = load_run(&store, &run_id)?;
    run["coordinatorId"] = json!(session_id);
    set_run_state(&app, &store, &mut run, "planning")?;

    let dir = run_dir(&app, &run_id)?;
    let dir_text = dir.to_string_lossy().to_string();
    let prompt = build_plan_prompt(&PlanPromptInput {
        request: str_of(&run, "request").to_string(),
        project_root: str_of(&run, "projectRoot").to_string(),
        existing_plan: run.get("plan").filter(|plan| !plan.is_null()).map(Value::to_string),
        context: serde_json::from_value::<BrowserContext>(run["context"].clone()).unwrap_or_default(),
    });
    write_file(&format!("{}/plan.prompt.txt", dir_text), &prompt)?;
    send_prompt(&app, &pty, &store, &session_id, &plan_instruction(&dir_text))?;

    let plan_path = format!("{}/plan.json", dir_text);
    let wait_app = app.clone();
    let wait_path = plan_path.clone();
    let ready = tauri::async_runtime::spawn_blocking(move || {
        artifact_ready(&wait_app, &wait_path, PLAN_TIMEOUT_MS)
    })
    .await
    .map_err(to_err)??;
    if !ready {
        return Err("Planner agent did not write plan.json before the timeout".into());
    }
    let raw = std::fs::read_to_string(&plan_path).map_err(to_err)?;
    let parsed = parse_plan(&raw)?;

    let timestamp = now();
    let run_id_value = str_of(&run, "id").to_string();
    for task in &parsed.plan.tasks {
        let mut value = serde_json::to_value(task).map_err(to_err)?;
        value["runId"] = json!(run_id_value);
        value["status"] = json!("queued");
        value["ownerSessionId"] = Value::Null;
        value["attempt"] = json!(0);
        value["workspaceId"] = Value::Null;
        value["inputRefs"] = json!([]);
        value["outputRefs"] = json!([]);
        value["evidence"] = Value::Null;
        value["blocker"] = Value::Null;
        value["createdAt"] = json!(timestamp);
        value["updatedAt"] = json!(timestamp);
        put_task(&store, &value)?;
    }
    run["plan"] = serde_json::to_value(&parsed.plan).map_err(to_err)?;
    set_run_state(&app, &store, &mut run, "plan_ready")?;
    emit(
        &app,
        &store,
        &run_id_value,
        None,
        "run.plan_ready",
        json!({ "taskCount": parsed.plan.tasks.len() }),
    )?;
    Ok(run)
}

/// Creates one isolated workspace per task and marks the tasks ready.
pub fn prepare_workspaces(app: &AppHandle, run_id: &str) -> Result<Vec<Value>, String> {
    let store = app.state::<OrchestratorStore>();
    let run = load_run(&store, run_id)?;
    let root = str_of(&run, "projectRoot").to_string();
    let mode = run["settings"]["isolationMode"].as_str().unwrap_or("worktree").to_string();
    let mut prepared = Vec::new();
    for mut task in run_tasks(&store, run_id)? {
        let task_id = str_of(&task, "id").to_string();
        let workspace = create_workspace(app, &store, run_id, &task_id, &root, &mode)?;
        task["workspaceId"] = json!(str_of(&workspace, "id"));
        task["status"] = json!("ready");
        task["updatedAt"] = json!(now());
        put_task(&store, &task)?;
        prepared.push(task);
    }
    Ok(prepared)
}

fn fail_task(
    app: &AppHandle,
    store: &OrchestratorStore,
    task_id: &str,
    blocker: &str,
) -> Result<(), String> {
    let mut task = load_task(store, task_id)?;
    task["status"] = json!("failed");
    task["blocker"] = json!(blocker);
    task["updatedAt"] = json!(now());
    put_task(store, &task)?;
    let run_id = str_of(&task, "runId").to_string();
    emit(app, store, &run_id, Some(task_id), "task.failed", json!({ "blocker": blocker }))
}

fn terminal(task: &Value) -> bool {
    serde_json::from_value::<TaskState>(task["status"].clone())
        .map(is_terminal_task_state)
        .unwrap_or(false)
}

/// Runs the dispatch loop until every task is terminal or no progress is possible.
pub async fn execute_run(app: AppHandle, run_id: String) -> Result<Value, String> {
    let store = app.state::<OrchestratorStore>();
    let pty = app.state::<PtyState>();
    let mut run = load_run(&store, &run_id)?;
    if str_of(&run, "state") == "executing" {
        return Ok(json!({ "state": "executing" }));
    }
    set_run_state(&app, &store, &mut run, "executing")?;
    let dir = run_dir(&app, &run_id)?;
    let dir_text = dir.to_string_lossy().to_string();
    let settings: RunSettings = serde_json::from_value(run["settings"].clone()).unwrap_or_default();
    // session id -> (task id, evidence path)
    let mut active: HashMap<String, (String, String)> = HashMap::new();

    loop {
        let snapshot = store.snapshot()?;
        let tasks_now = run_tasks(&store, &run_id)?;
        if tasks_now.iter().all(terminal) {
            break;
        }
        let current_run = snapshot["runs"]
            .as_array()
            .and_then(|runs| runs.iter().find(|item| str_of(item, "id") == run_id).cloned())
            .unwrap_or_else(|| run.clone());
        if str_of(&current_run, "state") == "cancelled" {
            for (_, (task_id, _)) in active.drain() {
                let mut task = load_task(&store, &task_id)?;
                task["status"] = json!("cancelled");
                task["blocker"] = json!("Run cancelled by user");
                task["updatedAt"] = json!(now());
                put_task(&store, &task)?;
                emit(&app, &store, &run_id, Some(&task_id), "task.cancelled", json!({}))?;
            }
            break;
        }

        let dags = dag_tasks(&tasks_now)?;
        let critical_path = validate_dag(&dags).critical_path;
        let sched_tasks: Vec<SchedTask> = tasks_now
            .iter()
            .zip(dags.iter())
            .map(|(task, dag)| SchedTask {
                dag: dag.clone(),
                attempt: task["attempt"].as_u64().unwrap_or(0) as u32,
                workspace_id: task["workspaceId"].as_str().map(str::to_string),
                required_capabilities: str_list(task, "requiredCapabilities"),
            })
            .collect();
        let agents: Vec<AgentSession> = snapshot["agents"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|agent| serde_json::from_value(agent).map_err(to_err))
            .collect::<Result<_, _>>()?;
        let workspaces: Vec<SchedWorkspace> = snapshot["workspaces"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .map(|ws| SchedWorkspace {
                id: str_of(ws, "id").to_string(),
            })
            .collect();
        let active_by_session = active
            .iter()
            .map(|(session, (task, _))| (session.clone(), task.clone()))
            .collect();
        let decisions = select_dispatchable(&SchedulerInput {
            tasks: sched_tasks,
            agents,
            workspaces,
            settings: settings.clone(),
            critical_path,
            active_by_session,
        });

        for decision in decisions {
            let mut task = load_task(&store, &decision.task_id)?;
            let attempt = task["attempt"].as_u64().unwrap_or(0) + 1;
            task["status"] = json!("running");
            task["ownerSessionId"] = json!(decision.session_id);
            task["workspaceId"] = json!(decision.workspace_id);
            task["attempt"] = json!(attempt);
            task["updatedAt"] = json!(now());
            put_task(&store, &task)?;

            let attempt_dir = format!("{}/{}/attempt-{}", dir_text, decision.task_id, attempt);
            let workspace = workspace_by_id(&store, &decision.workspace_id)?;
            let prompt = build_task_prompt(&TaskPromptInput {
                request: str_of(&run, "request").to_string(),
                task: TaskPromptTask {
                    id: str_of(&task, "id").to_string(),
                    title: str_of(&task, "title").to_string(),
                    objective: str_of(&task, "objective").to_string(),
                    description: str_of(&task, "description").to_string(),
                    acceptance: str_list(&task, "acceptance"),
                    allowed_paths: str_list(&task["scope"], "allowedPaths"),
                    forbidden_paths: str_list(&task["scope"], "forbiddenPaths"),
                    interfaces: str_list(&task["scope"], "interfaces"),
                    dependencies: str_list(&task, "dependencies"),
                },
                context: serde_json::from_value::<BrowserContext>(run["context"].clone())
                    .unwrap_or_default(),
                artifact_path: attempt_dir.clone(),
                workspace_path: str_of(&workspace, "path").to_string(),
            });
            write_file(&format!("{}/task.prompt.txt", attempt_dir), &prompt)?;
            dispatch_prompt(
                &app,
                &pty,
                &store,
                &decision.task_id,
                &decision.session_id,
                &decision.workspace_id,
                &prompt,
            )?;
            active.insert(
                decision.session_id.clone(),
                (decision.task_id.clone(), format!("{}/evidence.json", attempt_dir)),
            );
            emit(
                &app,
                &store,
                &run_id,
                Some(&decision.task_id),
                "task.started",
                json!({
                    "agentId": decision.session_id,
                    "workspaceId": decision.workspace_id,
                    "attempt": attempt,
                }),
            )?;
        }

        if active.is_empty() {
            let mut changed = false;
            for task in &tasks_now {
                if terminal(task) {
                    continue;
                }
                let parents: Vec<Option<&Value>> = str_list(task, "dependencies")
                    .iter()
                    .map(|dep| tasks_now.iter().find(|item| str_of(item, "id") == dep))
                    .collect();
                let unresolved = parents
                    .iter()
                    .any(|parent| parent.map_or(true, |p| !terminal(p)));
                if unresolved {
                    continue;
                }
                let failed_parent = parents
                    .iter()
                    .flatten()
                    .find(|parent| str_of(parent, "status") != "completed");
                if let Some(parent) = failed_parent {
                    let dependency = str_of(parent, "id").to_string();
                    fail_task(
                        &app,
                        &store,
                        str_of(task, "id"),
                        &format!("Dependency {} did not complete", dependency),
                    )?;
                    changed = true;
                }
            }
            if !changed {
                break;
            }
            continue;
        }

        let mut sessions: Vec<String> = active.keys().cloned().collect();
        sessions.sort();
        for session in sessions {
            let Some((task_id, evidence_path)) = active.get(&session).cloned() else { continue };
            let wait_app = app.clone();
            let wait_path = evidence_path.clone();
            let ready = tauri::async_runtime::spawn_blocking(move || {
                artifact_ready(&wait_app, &wait_path, EVIDENCE_TIMEOUT_MS)
            })
            .await
            .map_err(to_err)??;
            if !ready {
                fail_task(&app, &store, &task_id, "Evidence timeout")?;
                active.remove(&session);
                continue;
            }
            let raw = std::fs::read_to_string(&evidence_path).map_err(to_err)?;
            let evidence: Evidence = match serde_json::from_str(&raw) {
                Ok(evidence) => evidence,
                Err(error) => {
                    fail_task(&app, &store, &task_id, &format!("Invalid evidence: {}", error))?;
                    active.remove(&session);
                    continue;
                }
            };
            let mut task = load_task(&store, &task_id)?;
            let validation = validate_evidence(&str_list(&task, "acceptance"), Some(&evidence));
            let mut outputs = str_list(&task, "outputRefs");
            outputs.push(evidence_path.clone());
            task["evidence"] = serde_json::to_value(&evidence).map_err(to_err)?;
            task["status"] = json!(if validation.ok { "validating" } else { "failed" });
            task["blocker"] = if validation.ok {
                Value::Null
            } else {
                json!(validation.reasons.join("; "))
            };
            task["outputRefs"] = json!(outputs);
            task["updatedAt"] = json!(now());
            put_task(&store, &task)?;
            let event_type = if validation.ok { "task.validating" } else { "task.failed" };
            emit(&app, &store, &run_id, Some(&task_id), event_type, json!({ "reasons": validation.reasons }))?;

            if validation.ok {
                let workspace_id = str_of(&task, "workspaceId").to_string();
                let workspace = workspace_by_id(&store, &workspace_id)?;
                let status = git::status(&workspace)?;
                let diff = git::diff(&workspace)?;
                emit(
                    &app,
                    &store,
                    &run_id,
                    Some(&task_id),
                    "validation.result",
                    json!({
                        "ok": true,
                        "dirty": status["dirty"],
                        "changedFiles": status["changedFiles"],
                        "diffLength": diff.len(),
                    }),
                )?;
                let mut done = load_task(&store, &task_id)?;
                let mut final_evidence = evidence.clone();
                final_evidence.changed_files = str_list(&status, "changedFiles");
                done["evidence"] = serde_json::to_value(&final_evidence).map_err(to_err)?;
                done["status"] = json!("completed");
                done["updatedAt"] = json!(now());
                put_task(&store, &done)?;
                emit(&app, &store, &run_id, Some(&task_id), "task.completed", json!({}))?;

                let fresh = dag_tasks(&run_tasks(&store, &run_id)?)?;
                for candidate in should_unblock(&fresh, &task_id) {
                    let mut unblocked = load_task(&store, &candidate.id)?;
                    unblocked["status"] = json!("ready");
                    unblocked["blocker"] = Value::Null;
                    unblocked["updatedAt"] = json!(now());
                    put_task(&store, &unblocked)?;
                    emit(
                        &app,
                        &store,
                        &run_id,
                        Some(&candidate.id),
                        "dependency.satisfied",
                        json!({ "dependency": task_id }),
                    )?;
                }
            }
            active.remove(&session);
        }
    }

    let final_run = load_run(&store, &run_id)?;
    let final_tasks = run_tasks(&store, &run_id)?;
    let snapshot = store.snapshot()?;
    let events = snapshot["events"].as_array().cloned().unwrap_or_default();
    let validation_event_count = events
        .iter()
        .filter(|event| str_of(event, "type") == "validation.result")
        .count();
    let report_input = ReportInput {
        run_id: run_id.clone(),
        state: str_of(&final_run, "state").to_string(),
        plan_risks: final_run["plan"]["risks"]
            .as_array()
            .map(|items| items.iter().filter_map(Value::as_str).map(str::to_string).collect())
            .unwrap_or_default(),
        tasks: final_tasks
            .iter()
            .map(|task| serde_json::from_value::<ReportTask>(task.clone()).map_err(to_err))
            .collect::<Result<_, _>>()?,
        workspaces: snapshot["workspaces"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter(|ws| str_of(ws, "runId") == run_id)
            .map(|ws| serde_json::from_value::<ReportWorkspace>(ws).map_err(to_err))
            .collect::<Result<_, _>>()?,
        validation_event_count,
    };
    let report = build_report(&report_input);
    let any_failed = final_tasks.iter().any(|task| {
        matches!(str_of(task, "status"), "failed" | "conflict" | "cancelled")
    });
    let any_completed = final_tasks.iter().any(|task| str_of(task, "status") == "completed");
    let state = if str_of(&final_run, "state") == "cancelled" {
        "cancelled"
    } else if any_failed && any_completed {
        "partial"
    } else if any_failed {
        "failed"
    } else {
        "completed"
    };
    let mut report_json = serde_json::to_value(&report).map_err(to_err)?;
    report_json["state"] = json!(state);
    if str_of(&final_run, "state") != "cancelled" {
        let mut finished = final_run.clone();
        set_run_state(&app, &store, &mut finished, state)?;
        write_file(
            &format!("{}/report.json", dir_text),
            &serde_json::to_string_pretty(&report_json).map_err(to_err)?,
        )?;
        emit(&app, &store, &run_id, None, &format!("run.{}", state), json!({ "report": report_json }))?;
    }
    Ok(report_json)
}

/// Integrates one completed task's worktree into the project through the controlled queue.
pub fn integrate_task(app: &AppHandle, task_id: &str) -> Result<(), String> {
    let store = app.state::<OrchestratorStore>();
    let mut task = load_task(&store, task_id)?;
    if str_of(&task, "status") != "completed" {
        return Err("Only completed tasks can be integrated".into());
    }
    let run_id = str_of(&task, "runId").to_string();
    let workspace = workspace_by_id(&store, str_of(&task, "workspaceId"))?;
    let result = git::integrate(&workspace, "worktree")?;
    let output = clamp(str_of(&result, "output"), 2000);
    if result["conflict"].as_bool().unwrap_or(false) {
        task["status"] = json!("conflict");
        task["blocker"] = json!(output);
        task["updatedAt"] = json!(now());
        put_task(&store, &task)?;
        return emit(app, &store, &run_id, Some(task_id), "workspace.conflict", json!({ "output": result["output"] }));
    }
    if !result["ok"].as_bool().unwrap_or(false) {
        task["status"] = json!("failed");
        task["blocker"] = json!(output);
        task["updatedAt"] = json!(now());
        put_task(&store, &task)?;
        return emit(app, &store, &run_id, Some(task_id), "validation.result", json!({ "ok": false, "output": result["output"] }));
    }
    let mut outputs = str_list(&task, "outputRefs");
    outputs.push("integrated".into());
    task["status"] = json!("completed");
    task["outputRefs"] = json!(outputs);
    task["updatedAt"] = json!(now());
    put_task(&store, &task)?;
    emit(app, &store, &run_id, Some(task_id), "validation.result", json!({ "ok": true, "integrated": true }))
}

#[tauri::command(async)]
pub async fn orchestrator_create_run(
    app: AppHandle,
    request: String,
    project_root: String,
    context: Value,
    attachments: Value,
) -> Result<Value, String> {
    create_run(&app, &request, &project_root, context, attachments)
}

#[tauri::command(async)]
pub async fn orchestrator_plan_run(
    app: AppHandle,
    run_id: String,
    session_id: String,
) -> Result<Value, String> {
    plan_run(app, run_id, session_id).await
}

#[tauri::command(async)]
pub async fn orchestrator_prepare_workspaces(app: AppHandle, run_id: String) -> Result<Vec<Value>, String> {
    prepare_workspaces(&app, &run_id)
}

#[tauri::command(async)]
pub async fn orchestrator_execute_run(app: AppHandle, run_id: String) -> Result<Value, String> {
    execute_run(app, run_id).await
}

#[tauri::command(async)]
pub async fn orchestrator_integrate_task(app: AppHandle, task_id: String) -> Result<(), String> {
    integrate_task(&app, &task_id)
}
