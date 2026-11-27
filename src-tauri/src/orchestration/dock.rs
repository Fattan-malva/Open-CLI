//! Port of dock/worker-dock.ts.

use serde::{Deserialize, Serialize};



#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerDockSource {
    pub party: String, // CrewParty: a public orchestration address
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockSubscribe {
    pub party: String,
    /// Only current work: live workers and recent, unresolved failures.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_rows: Option<bool>,
    /// Only current work: live workers and recent, unresolved failures (see workerDockCurrentRowsSql).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_only: Option<bool>,
}

/// How long a ready worker whose agent status is not fresh stays in the strip after its last
/// change: longer than nearly every worker runs, so only a stale record ages out.
pub const WORKER_DOCK_UNVERIFIED_READY_MS: u64 = 24 * 60 * 60_000;
/// A launch or stop whose outcome was never seen is fenced off after an hour.
pub const WORKER_DOCK_UNKNOWN_MS: u64 = 60 * 60_000;
/// A failure stays a current attention item for four hours; after that it lives in history.
pub const WORKER_DOCK_FAILURE_MS: u64 = 4 * 60 * 60_000;
/// At most this many failures show at once, newest first.
pub const WORKER_DOCK_FAILURE_LIMIT: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkerDockState {
    Starting,
    Running,
    Waiting,
    Saving,
    Failed,
    Unexpected,
    Stopping,
    Unavailable,
    NeedsYou,
    Idle,
    Coordinator,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkerDockEntryKind {
    Worker,
    Agent,
    Command,
    Workflow,
    Monitor,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockEntry {
    #[serde(default = "default_kind")]
    pub kind: WorkerDockEntryKind,
    pub id: String,
    pub dispatch_id: String,
    pub source: String,
    pub name: String,
    pub title: String,
    pub model: Option<String>,
    pub state: WorkerDockState,
    pub changed_at: Option<i64>,
    pub started_at: Option<i64>,
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub progress_note: Option<String>,
    pub settlement: Option<String>,
    pub result_id: Option<String>,
    pub stoppable: bool,
    #[serde(default = "default_true")]
    pub owner_actions_available: bool,
}

fn default_kind() -> WorkerDockEntryKind {
    WorkerDockEntryKind::Worker
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockIdentity {
    pub id: String,
    pub dispatch_id: String,
    pub state: WorkerDockState,
    pub changed_at: Option<i64>,
    pub owner_actions_available: bool,
    pub settlement: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<WorkerDockEntryKind>,
    #[serde(default)]
    pub has_model: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkerDockReadDirection {
    Before,
    After,
    Around,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockSnapshot {
    pub revision: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next_expiry: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub has_unverified_workers: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<bool>,
    pub expired: bool,
    pub identities: Vec<WorkerDockIdentity>,
    pub rows: Vec<WorkerDockEntry>,
    pub anchor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockRead {
    #[serde(flatten)]
    pub subscribe: WorkerDockSubscribe,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub seed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<String>,
    #[serde(default = "default_direction")]
    pub direction: WorkerDockReadDirection,
}

fn default_direction() -> WorkerDockReadDirection {
    WorkerDockReadDirection::Around
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockSettlement {
    pub dispatch_id: String,
    pub settlement: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerDockAcknowledge {
    pub party: String,
    pub settlements: Vec<WorkerDockSettlement>, // max 1000
    pub acknowledged: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkerDockOutcome {
    Succeeded,
    Failed,
    Stopped,
    Unexpected,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerDockResult {
    pub id: String,
    pub dispatch_id: String,
    pub name: String,
    pub title: String,
    pub outcome: WorkerDockOutcome,
    pub body: String,
    /// True when the body is the worker's own report (Markdown); false for a raw error or a stop
    /// note. Optional: older hosts omit it, and their bodies keep rendering as Markdown.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub report: Option<bool>,
    pub at: Option<i64>,
    pub settlement: String,
    pub acknowledged: bool,
    #[serde(default = "default_true")]
    pub owner_actions_available: bool,
    /// The worker's workspace on its host, so the card can say when it was removed. Older hosts omit it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerDockResultRead {
    pub party: String,
    pub dispatch: String,
}

/// `requestId` is unread here; clients keep sending it because older hosts still require it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerDockStop {
    #[serde(flatten)]
    pub read: WorkerDockResultRead,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
}

/// A failed row this owner can acknowledge; Clear all sends exactly these.
pub fn worker_dock_clearable(state: WorkerDockState, settlement: Option<&str>, owner_actions_available: Option<bool>) -> bool {
    matches!(state, WorkerDockState::Failed | WorkerDockState::Unexpected)
        && settlement.is_some_and(|s| !s.is_empty())
        && owner_actions_available != Some(false)
}

pub fn worker_dock_needs_attention(state: WorkerDockState) -> bool {
    matches!(state, WorkerDockState::Failed | WorkerDockState::Unexpected | WorkerDockState::NeedsYou)
}

pub fn compare_worker_dock_entries(a: &WorkerDockIdentity, b: &WorkerDockIdentity) -> std::cmp::Ordering {
    worker_dock_needs_attention(b.state)
        .cmp(&worker_dock_needs_attention(a.state))
        .then_with(|| (a.changed_at.is_none()).cmp(&(b.changed_at.is_none())))
        .then_with(|| b.changed_at.unwrap_or(0).cmp(&a.changed_at.unwrap_or(0)))
        .then_with(|| a.id.cmp(&b.id))
}



