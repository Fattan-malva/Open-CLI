use crate::orchestrator::browser_bridge::{self, BrowserBridgeState};
use crate::orchestrator::git;
use crate::orchestrator::store::{now, OrchestratorStore};
use crate::pty_write_session;
use crate::PtyState;
use serde_json::{json, Value};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value, String> {
    value
        .get(key)
        .ok_or_else(|| format!("missing field {}", key))
}

fn string_field(value: &Value, key: &str) -> Result<String, String> {
    field(value, key)?
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| format!("field {} must be a string", key))
}

fn normalize_path(path: PathBuf) -> PathBuf {
    let mut result = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                result.pop();
            }
            other => result.push(other.as_os_str()),
        }
    }
    result
}

fn orchestrator_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("orchestrator");
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

fn safe_artifact_path(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let root = orchestrator_root(app)?;
    let candidate = Path::new(path);
    let candidate = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        root.join(candidate)
    };
    let normalized = normalize_path(candidate);
    if !normalized.starts_with(&root) {
        return Err("artifact path is outside the orchestrator directory".to_string());
    }
    Ok(normalized)
}

fn emit_event(app: &AppHandle, store: &OrchestratorStore, event: &Value) -> Result<Value, String> {
    let sequence = event
        .get("sequence")
        .and_then(Value::as_i64)
        .ok_or_else(|| "event missing sequence".to_string())?;
    let run_id = string_field(event, "runId")?;
    let task_id = event
        .get("taskId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let event_type = string_field(event, "type")?;
    let stored = store.upsert(
        "events",
        &sequence.to_string(),
        &run_id,
        &event_type,
        event,
    )?;
    app.emit("orchestrator:event", stored.clone())
        .map_err(|error| error.to_string())?;
    let _ = task_id;
    Ok(stored)
}

#[tauri::command]
pub fn orchestrator_snapshot(store: State<'_, OrchestratorStore>) -> Result<Value, String> {
    store.snapshot()
}

#[tauri::command]
pub fn orchestrator_upsert_run(
    store: State<'_, OrchestratorStore>,
    run: Value,
) -> Result<Value, String> {
    let id = string_field(&run, "id")?;
    let run_id = id.clone();
    let state = string_field(&run, "state")?;
    store.upsert("runs", &id, &run_id, &state, &run)
}

#[tauri::command]
pub fn orchestrator_upsert_task(
    store: State<'_, OrchestratorStore>,
    task: Value,
) -> Result<Value, String> {
    let id = string_field(&task, "id")?;
    let run_id = string_field(&task, "runId")?;
    let state = string_field(&task, "status")?;
    store.upsert("tasks", &id, &run_id, &state, &task)
}

#[tauri::command]
pub fn orchestrator_upsert_approval(
    store: State<'_, OrchestratorStore>,
    approval: Value,
) -> Result<Value, String> {
    let id = string_field(&approval, "id")?;
    let run_id = string_field(&approval, "runId")?;
    let state = string_field(&approval, "status")?;
    store.upsert("approvals", &id, &run_id, &state, &approval)
}

#[tauri::command]
pub fn orchestrator_emit_event(
    app: AppHandle,
    store: State<'_, OrchestratorStore>,
    event: Value,
) -> Result<Value, String> {
    emit_event(&app, &store, &event)
}

#[tauri::command]
pub fn orchestrator_next_event_id(
    store: State<'_, OrchestratorStore>,
    run_id: String,
) -> Result<i64, String> {
    store.next_sequence(&run_id)
}

#[tauri::command]
pub fn orchestrator_register_agent(
    store: State<'_, OrchestratorStore>,
    agent: Value,
) -> Result<(), String> {
    let id = string_field(&agent, "id")?;
    let run_id = agent
        .get("runId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let state = string_field(&agent, "status")?;
    store.upsert("agents", &id, &run_id, &state, &agent)?;
    Ok(())
}

#[tauri::command]
pub fn orchestrator_unregister_agent(
    store: State<'_, OrchestratorStore>,
    id: String,
) -> Result<(), String> {
    store.remove("agents", &id)
}

#[tauri::command]
pub fn orchestrator_run_dir(app: AppHandle, run_id: String) -> Result<String, String> {
    let path = orchestrator_root(&app)?
        .join("runs")
        .join(run_id.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect::<String>());
    std::fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn orchestrator_artifact_write(app: AppHandle, path: String, contents: String) -> Result<(), String> {
    let path = safe_artifact_path(&app, &path)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn orchestrator_artifact_read(app: AppHandle, path: String) -> Result<String, String> {
    let path = safe_artifact_path(&app, &path)?;
    std::fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn orchestrator_artifact_wait(
    app: AppHandle,
    path: String,
    timeout_ms: u64,
) -> Result<bool, String> {
    let path = safe_artifact_path(&app, &path)?;
    let deadline = Instant::now() + Duration::from_millis(timeout_ms.min(600_000));
    while Instant::now() < deadline {
        if path.is_file() {
            return Ok(true);
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Ok(path.is_file())
}

fn workspace_by_id(store: &OrchestratorStore, id: &str) -> Result<Value, String> {
    store
        .get("workspaces", id)?
        .ok_or_else(|| format!("workspace {} not found", id))
}

#[tauri::command]
pub fn orchestrator_workspace_create(
    app: AppHandle,
    store: State<'_, OrchestratorStore>,
    run_id: String,
    task_id: String,
    root: String,
    isolation_mode: String,
) -> Result<Value, String> {
    let worktrees = orchestrator_root(&app)?.join("worktrees");
    let workspace = git::create_worktree(&root, &run_id, &task_id, &isolation_mode, &worktrees)?;
    let id = string_field(&workspace, "id")?;
    store.upsert("workspaces", &id, &run_id, &isolation_mode, &workspace)
}

#[tauri::command]
pub fn orchestrator_workspace_status(
    store: State<'_, OrchestratorStore>,
    workspace_id: String,
) -> Result<Value, String> {
    let workspace = workspace_by_id(&store, &workspace_id)?;
    git::status(&workspace)
}

#[tauri::command]
pub fn orchestrator_workspace_diff(
    store: State<'_, OrchestratorStore>,
    workspace_id: String,
) -> Result<String, String> {
    let workspace = workspace_by_id(&store, &workspace_id)?;
    git::diff(&workspace)
}

#[tauri::command]
pub fn orchestrator_run_command(
    store: State<'_, OrchestratorStore>,
    workspace_id: String,
    command: String,
) -> Result<Value, String> {
    let workspace = workspace_by_id(&store, &workspace_id)?;
    git::run_command(&workspace, &command)
}

#[tauri::command]
pub fn orchestrator_integrate(
    store: State<'_, OrchestratorStore>,
    workspace_id: String,
    target: String,
) -> Result<Value, String> {
    let workspace = workspace_by_id(&store, &workspace_id)?;
    git::integrate(&workspace, &target)
}

#[tauri::command]
pub fn orchestrator_send_prompt(
    pty: State<'_, PtyState>,
    session_id: String,
    prompt: String,
) -> Result<(), String> {
    pty_write_session(&pty, &session_id, &format!("{}\r", prompt))
}

#[tauri::command]
pub fn orchestrator_dispatch(
    pty: State<'_, PtyState>,
    store: State<'_, OrchestratorStore>,
    task_id: String,
    session_id: String,
    workspace_id: String,
    prompt: String,
) -> Result<(), String> {
    let workspace = workspace_by_id(&store, &workspace_id)?;
    let path = string_field(&workspace, "path")?;
    let cd = if cfg!(windows) {
        format!("cd /d \"{}\"\r", path)
    } else {
        format!("cd \"{}\"\r", path)
    };
    pty_write_session(&pty, &session_id, &cd)?;
    pty_write_session(&pty, &session_id, &format!("{}\r", prompt))?;
    let timestamp = now();
    let run_id = string_field(&workspace, "runId")?;
    let assignment = json!({
        "taskId": task_id,
        "sessionId": session_id,
        "workspaceId": workspace_id,
        "state": "dispatched",
        "dispatchedAt": timestamp,
    });
    let id = format!("assign-{}-{}", task_id, session_id);
    store.upsert("assignments", &id, &run_id, "dispatched", &assignment)?;
    let event = json!({
        "id": format!("evt-dispatch-{}-{}", task_id, timestamp),
        "sequence": store.next_sequence(&run_id)?,
        "runId": run_id,
        "taskId": task_id,
        "type": "task.dispatched",
        "timestamp": timestamp,
        "payload": { "sessionId": session_id, "workspaceId": workspace_id },
    });
    store.upsert("events", &task_id, &run_id, "task.dispatched", &event)?;
    Ok(())
}

#[tauri::command]
pub fn orchestrator_recover(
    app: AppHandle,
    store: State<'_, OrchestratorStore>,
    pty: State<'_, PtyState>,
    browser: State<'_, BrowserBridgeState>,
) -> Result<Value, String> {
    let live: Vec<String> = pty
        .sessions
        .lock()
        .map_err(|error| error.to_string())?
        .keys()
        .cloned()
        .collect();
    let live_set: std::collections::HashSet<String> = live.into_iter().collect();
    let recovered = store.reconcile(&live_set)?;
    let snapshot = store.snapshot()?;
    if let Some(runs) = snapshot.get("runs").and_then(Value::as_array) {
        for run in runs {
            let state = run.get("state").and_then(Value::as_str).unwrap_or("");
            if !["planning", "executing", "waiting", "validating"].contains(&state) {
                continue;
            }
            let mut updated = run.clone();
            updated["state"] = json!("needs_input");
            updated["blocker"] = json!("Recovered after process or app restart");
            updated["updatedAt"] = json!(now());
            let id = string_field(&updated, "id")?;
            let run_id = id.clone();
            store.upsert("runs", &id, &run_id, "needs_input", &updated)?;
        }
    }
    {
        let mut grants = browser
            .grants
            .lock()
            .map_err(|error| error.to_string())?;
        let expired: Vec<String> = grants
            .iter()
            .filter(|(_, grant)| grant.expires_at <= current_millis())
            .map(|(token, _)| token.clone())
            .collect();
        for token in expired {
            grants.remove(&token);
        }
    }
    let event = json!({
        "id": format!("evt-recover-{}", current_millis()),
        "sequence": 0,
        "runId": "",
        "taskId": null,
        "type": "orchestrator.recovered",
        "timestamp": now(),
        "payload": { "recoveredTasks": recovered },
    });
    app.emit("orchestrator:event", event)
        .map_err(|error| error.to_string())?;
    store.snapshot()
}

fn current_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn orchestrator_browser_bridge_start(
    app: AppHandle,
    browser: State<'_, BrowserBridgeState>,
    tab_label: String,
    agent_id: String,
) -> Result<Value, String> {
    let grant = browser_bridge::start(&app, &browser, &tab_label, &agent_id)?;
    Ok(json!({
        "token": grant.token,
        "port": grant.port,
        "tabLabel": grant.tab_label,
        "agentId": grant.agent_id,
        "expiresAt": grant.expires_at,
    }))
}

#[tauri::command]
pub fn orchestrator_browser_bridge_stop(
    browser: State<'_, BrowserBridgeState>,
    token: String,
) -> Result<(), String> {
    browser_bridge::stop(&browser, &token)
}

#[tauri::command]
pub fn orchestrator_browser_call(
    app: AppHandle,
    browser: State<'_, BrowserBridgeState>,
    tab_label: String,
    token: String,
    op: String,
    args_json: String,
) -> Result<String, String> {
    let args: Value = serde_json::from_str(&args_json).unwrap_or_else(|_| json!({}));
    browser_bridge::call(&app, &browser, &tab_label, &token, &op, &args)
}

#[tauri::command]
pub fn orchestrator_browser_inspect(
    app: AppHandle,
    browser: State<'_, BrowserBridgeState>,
    tab_label: String,
    token: String,
    enabled: bool,
) -> Result<(), String> {
    browser_bridge::inspect(&app, &browser, &tab_label, &token, enabled)
}

#[tauri::command]
pub fn orchestrator_browser_snapshot(
    app: AppHandle,
    tab_label: String,
) -> Result<Value, String> {
    browser_bridge::snapshot(&app, &tab_label)
}
