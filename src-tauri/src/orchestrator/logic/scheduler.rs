use super::dag::{is_ready, rank_by_priority, DagTask};
use super::state::{AgentState, TaskState};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct RunSettings {
    pub max_concurrent_agents: u32,
    pub max_retries: u32,
}

impl Default for RunSettings {
    fn default() -> Self {
        Self {
            max_concurrent_agents: 2,
            max_retries: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AgentSession {
    pub id: String,
    pub capabilities: Vec<String>,
    pub status: Option<AgentState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Workspace {
    pub id: String,
}

/// Task fields the scheduler needs beyond the DAG view.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SchedTask {
    pub dag: DagTask,
    pub attempt: u32,
    pub workspace_id: Option<String>,
    pub required_capabilities: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerInput {
    pub tasks: Vec<SchedTask>,
    pub agents: Vec<AgentSession>,
    pub workspaces: Vec<Workspace>,
    pub settings: RunSettings,
    pub critical_path: Vec<String>,
    /// session id -> task id currently assigned to it
    pub active_by_session: HashMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DispatchDecision {
    pub task_id: String,
    pub session_id: String,
    pub workspace_id: String,
}

fn is_active(status: TaskState) -> bool {
    matches!(
        status,
        TaskState::Assigned
            | TaskState::Running
            | TaskState::Waiting
            | TaskState::NeedsInput
            | TaskState::Validating
    )
}

fn agent_can_take(agent: &AgentSession, task: &SchedTask, busy: &HashMap<String, String>) -> bool {
    if agent.status != Some(AgentState::Idle) {
        return false;
    }
    if busy.contains_key(&agent.id) {
        return false;
    }
    task.required_capabilities.iter().all(|capability| {
        agent.capabilities.contains(capability) || agent.capabilities.iter().any(|c| c == "*")
    })
}

pub fn select_dispatchable(input: &SchedulerInput) -> Vec<DispatchDecision> {
    let active = input
        .tasks
        .iter()
        .filter(|task| task.dag.status.map_or(false, is_active))
        .count() as u32;
    let capacity = input.settings.max_concurrent_agents.saturating_sub(active) as usize;
    if capacity == 0 {
        return Vec::new();
    }

    let dags: Vec<DagTask> = input.tasks.iter().map(|task| task.dag.clone()).collect();
    let ranked = rank_by_priority(&dags, &input.critical_path);
    let by_id: HashMap<&str, &SchedTask> = input.tasks.iter().map(|t| (t.dag.id.as_str(), t)).collect();
    let mut busy = input.active_by_session.clone();
    let mut used_workspaces: HashSet<String> = HashSet::new();
    let mut decisions = Vec::new();

    for ranked_dag in &ranked {
        if decisions.len() >= capacity {
            break;
        }
        let Some(task) = by_id.get(ranked_dag.id.as_str()) else { continue };
        let status = task.dag.status.unwrap_or(TaskState::Queued);
        if !matches!(status, TaskState::Queued | TaskState::Ready | TaskState::Blocked) {
            continue;
        }
        if task.attempt >= input.settings.max_retries {
            continue;
        }
        if !is_ready(&dags, &task.dag) {
            continue;
        }
        let Some(workspace_id) = task.workspace_id.as_ref() else { continue };
        if !input.workspaces.iter().any(|w| &w.id == workspace_id) {
            continue;
        }
        if used_workspaces.contains(workspace_id) {
            continue;
        }

        let mut candidates: Vec<&AgentSession> = input
            .agents
            .iter()
            .filter(|agent| agent_can_take(agent, task, &busy))
            .collect();
        candidates.sort_by(|a, b| a.id.cmp(&b.id));
        let Some(session) = candidates.first() else { continue };

        busy.insert(session.id.clone(), task.dag.id.clone());
        used_workspaces.insert(workspace_id.clone());
        decisions.push(DispatchDecision {
            task_id: task.dag.id.clone(),
            session_id: session.id.clone(),
            workspace_id: workspace_id.clone(),
        });
    }
    decisions
}

/// Tasks waiting on `completed_id` that are now ready to run.
pub fn should_unblock(tasks: &[DagTask], completed_id: &str) -> Vec<DagTask> {
    tasks
        .iter()
        .filter(|task| {
            matches!(task.status, Some(TaskState::Blocked) | Some(TaskState::Queued))
                && task.dependencies.iter().any(|dep| dep == completed_id)
                && is_ready(tasks, task)
        })
        .cloned()
        .collect()
}

/// Exponential backoff capped at 30 seconds.
pub fn retry_backoff_ms(attempt: u32) -> u64 {
    let exponent = attempt.min(16);
    (500u64 * (1u64 << exponent)).min(30_000)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sched_task(id: &str, deps: &[&str], status: TaskState, workspace: &str) -> SchedTask {
        SchedTask {
            dag: DagTask {
                id: id.into(),
                dependencies: deps.iter().map(|d| d.to_string()).collect(),
                acceptance: vec!["ok".into()],
                status: Some(status),
                ..Default::default()
            },
            attempt: 0,
            workspace_id: Some(workspace.into()),
            required_capabilities: vec![],
        }
    }

    fn agent(id: &str, caps: &[&str]) -> AgentSession {
        AgentSession {
            id: id.into(),
            capabilities: caps.iter().map(|c| c.to_string()).collect(),
            status: Some(AgentState::Idle),
        }
    }

    fn input(tasks: Vec<SchedTask>, agents: Vec<AgentSession>) -> SchedulerInput {
        SchedulerInput {
            tasks,
            agents,
            workspaces: vec![Workspace { id: "w1".into() }, Workspace { id: "w2".into() }],
            settings: RunSettings {
                max_concurrent_agents: 2,
                max_retries: 1,
            },
            critical_path: vec![],
            active_by_session: HashMap::new(),
        }
    }

    #[test]
    fn dispatches_ready_tasks_up_to_capacity() {
        let tasks = vec![
            sched_task("a", &[], TaskState::Ready, "w1"),
            sched_task("b", &[], TaskState::Ready, "w2"),
            sched_task("c", &[], TaskState::Ready, "w2"),
        ];
        let decisions = select_dispatchable(&input(tasks, vec![agent("s1", &["*"]), agent("s2", &["*"])]));
        assert_eq!(decisions.len(), 2);
        assert_eq!(decisions[0].task_id, "a");
        assert_eq!(decisions[1].task_id, "b");
    }

    #[test]
    fn never_dispatches_two_tasks_into_one_workspace() {
        let tasks = vec![
            sched_task("a", &[], TaskState::Ready, "w1"),
            sched_task("b", &[], TaskState::Ready, "w1"),
        ];
        let decisions = select_dispatchable(&input(tasks, vec![agent("s1", &["*"]), agent("s2", &["*"])]));
        assert_eq!(decisions.len(), 1);
    }

    #[test]
    fn respects_capabilities_and_dependencies() {
        let mut needs_cap = sched_task("a", &[], TaskState::Ready, "w1");
        needs_cap.required_capabilities = vec!["browser".into()];
        let blocked_child = sched_task("b", &["a"], TaskState::Queued, "w2");
        let decisions = select_dispatchable(&input(
            vec![needs_cap, blocked_child],
            vec![agent("s1", &["shell"])],
        ));
        assert!(decisions.is_empty());
    }

    #[test]
    fn retry_backoff_is_capped() {
        assert_eq!(retry_backoff_ms(0), 500);
        assert_eq!(retry_backoff_ms(1), 1000);
        assert_eq!(retry_backoff_ms(20), 30_000);
    }
}
