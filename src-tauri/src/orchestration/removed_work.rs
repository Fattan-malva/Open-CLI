//! Port of orchestration-removed-work.ts.
//! Tolerant fields: a missing or mistyped value reads as null instead of failing the entry.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const REMOVED_WORK_PAGE_SIZE: u32 = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemovedWorkKind {
    Task,
    Dispatch,
    Worker,
    Terminal,
    RemoteWorker,
    FederatedWorker,
}

impl RemovedWorkKind {
    pub fn as_str(self) -> &'static str {
        match self {
            RemovedWorkKind::Task => "task",
            RemovedWorkKind::Dispatch => "dispatch",
            RemovedWorkKind::Worker => "worker",
            RemovedWorkKind::Terminal => "terminal",
            RemovedWorkKind::RemoteWorker => "remote_worker",
            RemovedWorkKind::FederatedWorker => "federated_worker",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum RemovedWorkLineage {
    #[serde(rename = "task")]
    Task {
        parent_task_id: Option<String>,
        title: Option<String>,
        created_by_handle: Option<String>,
        created_by_pane_key: Option<String>,
        /// Drops non-string elements and keeps the rest; text that isn't JSON reads as null.
        deps: Option<Vec<String>>,
        status: Option<String>,
        created_at: Option<String>,
    },
    #[serde(rename = "dispatch")]
    Dispatch {
        task_id: Option<String>,
        retry_of_dispatch_id: Option<String>,
        creator_dispatch_id: Option<String>,
        creator_handle: Option<String>,
        creator_pane_key: Option<String>,
        creator_orca_session_id: Option<String>,
        assignee_handle: Option<String>,
        assignee_pane_key: Option<String>,
        assignee_orca_session_id: Option<String>,
        host_scope: Option<String>,
        depth: Option<i64>,
        status: Option<String>,
        /// Null when no exit was ever recorded; an exit Orca could not certify is saved as 'unknown'.
        termination_reason: Option<String>,
        created_at: Option<String>,
    },
    #[serde(rename = "worker")]
    Worker { state: Option<String>, stage: Option<String>, worktree_id: Option<String>, terminal_handle: Option<String>, created_at: Option<String> },
    #[serde(rename = "terminal")]
    Terminal {
        origin_dispatch_id: Option<String>,
        owner_dispatch_id: Option<String>,
        prior_owner_dispatch_ids: Option<Vec<String>>,
        terminal_handle: Option<String>,
        pane_key: Option<String>,
        worktree_id: Option<String>,
        host_scope: Option<String>,
        ownership_state: Option<String>,
        release_state: Option<String>,
        created_at: Option<String>,
    },
    #[serde(rename = "remote_worker")]
    RemoteWorker {
        task_id: Option<String>,
        home_peer_fingerprint: Option<String>,
        state: Option<String>,
        stage: Option<String>,
        worktree_id: Option<String>,
        terminal_handle: Option<String>,
        pane_key: Option<String>,
        depth: Option<i64>,
        created_at: Option<String>,
    },
    #[serde(rename = "federated_worker")]
    FederatedWorker {
        environment_id: Option<String>,
        environment_name: Option<String>,
        remote_worktree_id: Option<String>,
        remote_terminal_handle: Option<String>,
        dispatch_status: Option<String>,
        created_at: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedWorkEntryBase {
    pub seq: i64,
    pub id: String,
    pub removed_at: String,
}

/// One listed entry: the stored record checked against its kind's fields.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RemovedWorkEntry {
    Known {
        #[serde(flatten)]
        base: RemovedWorkEntryBase,
        /// Workers carry `activeAtRemoval`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        active_at_removal: Option<bool>,
        #[serde(flatten)]
        lineage: RemovedWorkLineage,
    },
    Unreadable {
        #[serde(flatten)]
        base: RemovedWorkEntryBase,
        kind: String,
        unreadable: bool, // true
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovedWorkPage {
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RemovedWorkCoverage {
    Complete,
    Partial,
}

/// `orchestration.runShow` result `removedWork`: constant size unless entries were requested.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRemovedWork {
    /// 'partial': the Run predates recordedSince, so earlier removals were not recorded.
    pub coverage: RemovedWorkCoverage,
    pub recorded_since: String,
    pub tasks: u64,
    pub dispatches: u64,
    pub workers: u64,
    pub terminals: u64,
    pub active_workers_at_removal: u64,
    pub last_removed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entries: Option<Vec<RemovedWorkEntry>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<RemovedWorkPage>,
}

/// `orchestration.reset --tasks` result `removed`: what this reset removed, across every Run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetRemovedWork {
    pub runs: u64,
    /// Absent from hosts that predate it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_ids: Option<Vec<String>>,
    pub tasks: u64,
    pub dispatches: u64,
    pub workers: u64,
    pub possibly_running: u64,
}

/// Drops non-string elements and keeps the rest; text that isn't JSON reads as null.
pub fn parse_id_list(text: Option<&str>) -> Option<Vec<String>> {
    let value: Value = serde_json::from_str(text?).ok()?;
    let items = value.as_array()?;
    Some(items.iter().filter_map(|i| i.as_str().map(|s| s.to_string())).collect())
}


