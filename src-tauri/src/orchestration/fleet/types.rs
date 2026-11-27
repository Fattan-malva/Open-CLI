//! Port of the durable and projected fleet types in fleet/orchestration-fleet-projection.ts (the parts
//! the next-action projection needs).
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TerminalState {
    Active,
    Reclaimable,
    Retained,
    ReleasePending,
    ReleaseUnknown,
    Released,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FleetResource {
    pub id: String,
    pub owner_dispatch_id: String,
    pub worktree_id: Option<String>,
    pub pane_key: Option<String>,
    #[serde(default)]
    pub process_incarnation: Option<String>,
    pub host_scope: Option<String>,
    pub ownership_state: String,
    pub release_state: String,
    /// A scheduled automatic release; the coordinator owes no release of its own.
    pub auto_release_at: Option<String>,
    pub updated_at: String,
}

/// Mirrors `FleetDurableWorker`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FleetDurableWorker {
    pub dispatch_id: String,
    pub task_id: String,
    pub run_id: String,
    pub parent_task_id: Option<String>,
    pub worker_state: String,
    pub dispatch_status: String,
    pub worker_stage: Option<String>,
    pub agent_terminal_handle: Option<String>,
    pub pane_key: Option<String>,
    pub worktree_id: Option<String>,
    pub terminal_state: Option<TerminalState>,
    #[serde(default)]
    pub pending_input: bool,
    #[serde(default)]
    pub pending_approval: bool,
    pub resource: Option<FleetResource>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "verdict", rename_all = "snake_case")]
pub enum Liveness {
    Live { observed_at: i64, source: String },
    Unverifiable {
        reason: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        observed_at: Option<i64>,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
    Exited { source: String },
}

impl Liveness {
    pub fn unverifiable(reason: &str) -> Self {
        Liveness::Unverifiable { reason: reason.into(), observed_at: None, detail: None }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NextActionKind {
    Inspect,
    Release,
    Recover,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NextAction {
    pub kind: NextActionKind,
    pub argv: Vec<String>,
}

impl NextAction {
    pub fn none() -> Self {
        Self { kind: NextActionKind::None, argv: vec![] }
    }
}
