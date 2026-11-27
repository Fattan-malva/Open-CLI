//! Port of remote-owned-wire.ts.
//! What a paired server and the Orca that coordinates a Run on it exchange about that Run's workers
//! (contract-b1-b3). The server owns the workers; these carry its facts home, in its order.

use serde::{Deserialize, Serialize};

pub const REMOTE_OWNED_WIRE_VERSION: u32 = 1;

/// The coordinator's Run a call is about, and the conversation its queue items come home under.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedPeerRun {
    pub run_id: String,
    pub conversation_id: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedHeader {
    pub v: u32, // REMOTE_OWNED_WIRE_VERSION
    pub id: String,
    pub home_run_id: String,
    pub peer_run_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteOwnedMessageType {
    Status,
    Dispatch,
    WorkerDone,
    MergeReady,
    Escalation,
    Handoff,
    DecisionGate,
    Question,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessagePriority {
    Normal,
    High,
    Urgent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedMessage {
    pub from: String,
    #[serde(rename = "type")]
    pub kind: RemoteOwnedMessageType,
    pub subject: String,
    pub body: String,
    pub payload: Option<String>,
    pub priority: MessagePriority,
    pub thread_id: Option<String>,
    /// The message a reply answers; an older server omits it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reply_to: Option<String>,
}

/// A final message filed in the peer Run's mailbox, with the Dispatch and Task its sender worked for.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedWorkerMail {
    #[serde(flatten)]
    pub header: RemoteOwnedHeader,
    pub message: RemoteOwnedMessage,
    pub dispatch_id: Option<String>,
    pub task_id: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteOwnedDispatchStatus {
    Pending,
    Dispatched,
    Completed,
    Failed,
    CircuitBroken,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteOwnedTaskStatus {
    Pending,
    Ready,
    Dispatched,
    Completed,
    Failed,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedDispatch {
    pub id: String,
    pub task_id: String,
    pub status: RemoteOwnedDispatchStatus,
    pub worker_state: Option<String>,
    pub last_failure: Option<String>,
    pub agent: Option<String>,
    /// Absent from older servers. The workspace its worker runs in, and the server's Dispatch that
    /// started it (a worker's own helper) or that it continues (a follow-up), so home places it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub worktree_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub creator_dispatch_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_up_of: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteOwnedTask {
    pub status: RemoteOwnedTaskStatus,
    pub result: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RemoteOwnedRemoved {
    pub reason: String,
}

/// A peer-Run Dispatch, its worker or its Task changed state on the server, or the server's reset removed it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteOwnedWorkerState {
    #[serde(flatten)]
    pub header: RemoteOwnedHeader,
    pub dispatch: RemoteOwnedDispatch,
    pub task: RemoteOwnedTask,
    /// The server's report owner settled this change through its unobserved-prompt correction.
    pub corrected_unobserved_prompt: bool,
    pub removed: Option<RemoteOwnedRemoved>,
}

/// Params of orchestration.peerRunCancel; the Run comes from the call's peer-Run envelope.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerRunCancelParams {}

/// Dispatches in the peer Run the server has not proven terminal after running the ordinary stop on each.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PeerRunCancelResult {
    pub remaining: u64,
}
