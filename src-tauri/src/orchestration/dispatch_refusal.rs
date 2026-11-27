//! Port of orchestration-dispatch-refusal-contract.ts.
//! Share refusal envelopes across runtime/CLI; retain call-site messages because older consumers may match published strings.

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DispatchRefusalCode {
    TaskNotFound,
    TaskNotStartable,
    InjectRejected,
}

impl DispatchRefusalCode {
    pub fn as_str(self) -> &'static str {
        match self {
            DispatchRefusalCode::TaskNotFound => "task_not_found",
            DispatchRefusalCode::TaskNotStartable => "task_not_startable",
            DispatchRefusalCode::InjectRejected => "inject_rejected",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DispatchRefusalReceipt {
    pub code: DispatchRefusalCode,
    pub message: String,
    /// Free-form detail plus `nextSteps`.
    pub data: Value,
}

pub fn task_not_found_refusal(message: &str, task_id: &str, run_id: Option<&str>) -> DispatchRefusalReceipt {
    let mut data = Map::new();
    data.insert("taskId".into(), json!(task_id));
    if let Some(run_id) = run_id {
        data.insert("runId".into(), json!(run_id));
    }
    data.insert(
        "nextSteps".into(),
        json!([
            "Run orca orchestration task-list --json in the bound Run to find the intended Task id.",
            "If the Task does not exist yet, create it with orca orchestration task-create --spec <text> --json."
        ]),
    );
    DispatchRefusalReceipt { code: DispatchRefusalCode::TaskNotFound, message: message.to_string(), data: Value::Object(data) }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskNotStartableDetail {
    pub task_id: String,
    pub status: String,
    pub unmet_dependencies: Vec<String>,
    pub retry_of: Option<String>,
    /// Set when the Task's circuit breaker tripped; an older client ignores it.
    pub failure_count: Option<u64>,
}

pub fn task_not_startable_refusal(message: &str, detail: &TaskNotStartableDetail) -> DispatchRefusalReceipt {
    let mut data = Map::new();
    data.insert("taskId".into(), json!(detail.task_id));
    data.insert("status".into(), json!(detail.status));
    data.insert("unmetDependencies".into(), json!(detail.unmet_dependencies));
    if let Some(retry_of) = &detail.retry_of {
        data.insert("retryOf".into(), json!(retry_of));
    }
    if let Some(failure_count) = detail.failure_count {
        data.insert("failureCount".into(), json!(failure_count));
    }
    data.insert("nextSteps".into(), json!(task_not_startable_next_steps(detail)));
    DispatchRefusalReceipt { code: DispatchRefusalCode::TaskNotStartable, message: message.to_string(), data: Value::Object(data) }
}

fn task_not_startable_next_steps(detail: &TaskNotStartableDetail) -> Vec<String> {
    if let Some(retry_of) = &detail.retry_of {
        if let Some(failure_count) = detail.failure_count {
            return vec![
                format!("Do not retry this Task or start a replacement for it: it failed {failure_count} times. Report the failure to the user."),
                format!("Read what the last attempt showed with orca orchestration worker-read --dispatch {retry_of} --json. If its terminal is still open, it stays for the user until orca orchestration worker-release --dispatch {retry_of} --json."),
            ];
        }
        return vec![format!(
            "--retry-of must name the latest settled Dispatch of a failed or blocked Task; check orca orchestration dispatch-show --task {} --json and orca orchestration worker-show --dispatch {retry_of} --json.",
            detail.task_id
        )];
    }
    if !detail.unmet_dependencies.is_empty() {
        return vec![format!(
            "Dependencies {} are not completed. Wait for running ones with orca orchestration check --wait --json; retry or unblock failed ones before dispatching again.",
            detail.unmet_dependencies.join(", ")
        )];
    }
    if detail.status == "dispatched" {
        return vec![format!("The Task already has an active Dispatch; inspect it with orca orchestration dispatch-show --task {} --json.", detail.task_id)];
    }
    vec![format!("A {} Task cannot be dispatched; create a new Task or use worker-start --retry-of for a failed attempt.", detail.status)]
}

/// Derived from detection's expectedProcess keys: a five-name example was mistaken for an allowlist (#15125).
/// Launcher disablement does not gate detection; hand-started disabled agents still inject.
/// Snapshot of Orca's TUI_AGENT_CONFIG (sorted, deduplicated).
pub const RECOGNIZED_AGENT_PROCESS_NAMES: &[&str] = &[
    "acli", "agy", "aider", "amp", "ante", "auggie", "autohand", "claude", "cline", "cn", "codebuddy", "codebuff", "codex",
    "command-code", "copilot", "crush", "cursor-agent", "devin", "droid", "dsh", "dsh-tui", "freebuff", "goose", "grok",
    "hermes", "jcode", "kilo", "kimi", "kiro-cli", "mimo", "muse", "omp", "openclaude", "openclaw", "opencode", "opencode2",
    "orca", "pi", "prime-agent", "qodercli", "qoderclicn", "qwen", "traecli", "vibe", "zcode", "zcode-cli",
];

pub fn build_inject_rejection_message(terminal: &str, recognized_agent_process_names: &[&str]) -> String {
    format!(
        "Cannot dispatch --inject to terminal {terminal}: no recognized agent detected. \
         Orca detects these agent CLIs ({}). \
         Start one in the terminal, let it finish launching, then retry; \
         or have Orca start one in its workspace: take worktreeId from orca terminal show --terminal {terminal} --json, \
         then run orca orchestration worker-start --task <task_id> --worktree id:<worktreeId> --agent <agent>.",
        recognized_agent_process_names.join(", ")
    )
}

pub const INJECT_REJECTED_REASON_NO_AGENT_DETECTED: &str = "no_agent_detected";

pub fn inject_rejected_refusal(terminal: &str, recognized_agent_process_names: &[&str]) -> DispatchRefusalReceipt {
    DispatchRefusalReceipt {
        code: DispatchRefusalCode::InjectRejected,
        message: build_inject_rejection_message(terminal, recognized_agent_process_names),
        data: json!({
            "terminal": terminal,
            "reason": INJECT_REJECTED_REASON_NO_AGENT_DETECTED,
            "nextSteps": [
                "Start a recognized agent CLI in that terminal and wait for it to finish launching, or pick a terminal that already runs one.",
                format!("Or have Orca start one in that terminal's workspace: take worktreeId from orca terminal show --terminal {terminal} --json, then run orca orchestration worker-start --task <task_id> --worktree id:<worktreeId> --agent <agent> --json. Otherwise tell the user."),
            ],
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_not_found_shape() {
        let r = task_not_found_refusal("nope", "t1", Some("r1"));
        assert_eq!(r.code, DispatchRefusalCode::TaskNotFound);
        assert_eq!(r.data["taskId"], json!("t1"));
        assert_eq!(r.data["runId"], json!("r1"));
        assert_eq!(r.data["nextSteps"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn not_startable_next_steps_precedence() {
        let mut d = TaskNotStartableDetail {
            task_id: "t".into(),
            status: "failed".into(),
            unmet_dependencies: vec!["x".into()],
            retry_of: Some("d9".into()),
            failure_count: Some(3),
        };
        let steps = task_not_startable_next_steps(&d);
        assert!(steps[0].contains("failed 3 times"));
        assert!(steps[1].contains("worker-read --dispatch d9"));
        d.failure_count = None;
        assert!(task_not_startable_next_steps(&d)[0].contains("--retry-of"));
        d.retry_of = None;
        assert!(task_not_startable_next_steps(&d)[0].contains("Dependencies x"));
        d.unmet_dependencies.clear();
        d.status = "dispatched".into();
        assert!(task_not_startable_next_steps(&d)[0].contains("active Dispatch"));
        d.status = "done".into();
        assert!(task_not_startable_next_steps(&d)[0].starts_with("A done Task cannot be dispatched"));
    }

    #[test]
    fn inject_rejected_message_lists_agents() {
        let r = inject_rejected_refusal("term1", &RECOGNIZED_AGENT_PROCESS_NAMES);
        assert!(r.message.contains("Cannot dispatch --inject to terminal term1"));
        assert!(r.message.contains("claude"));
        assert_eq!(r.data["reason"], json!("no_agent_detected"));
    }
}
