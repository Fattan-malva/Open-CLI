//! Port of workers/orchestration-worker-stop-receipt.ts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HelperStopOutcomeKind {
    Stopped,
    AlreadyFinished,
    KeptOpen,
    Starting,
    Unconfirmed,
}

/// One helper under a stopped worker, and what its stop did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HelperStopOutcome {
    pub dispatch_id: String,
    pub creator_dispatch_id: String,
    pub outcome: HelperStopOutcomeKind,
    /// Set on a helper left running because the user kept this ancestor open.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kept_open_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<Option<String>>,
}

/// A helper whose stop is done: it stopped, had already finished, or the user kept it open.
pub fn is_helper_stop_done(helper: &HelperStopOutcome) -> bool {
    matches!(helper.outcome, HelperStopOutcomeKind::Stopped | HelperStopOutcomeKind::AlreadyFinished | HelperStopOutcomeKind::KeptOpen)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerStopReceipt {
    pub dispatch_id: String,
    pub state: String,
    pub already_settled: bool,
    pub process_action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub close: Option<serde_json::Value>,
    /// How a stop settled without a proven exit, such as a start it cancelled.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub helpers: Option<Vec<HelperStopOutcome>>,
    /// Why helpers on the worker's host could not be stopped or listed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub helper_stop_error: Option<String>,
}
