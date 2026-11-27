//! Port of workers/orchestration-worker-output.ts.
//! Rich agent types (NativeChatMessage, RuntimeTerminalRead, OrchestrationFleetWorker...) stay
//! `serde_json::Value` placeholders until those systems are ported.

use serde::{Deserialize, Serialize};

pub const ORCHESTRATION_WORKER_READ_SOURCES: [&str; 3] = ["auto", "transcript", "terminal"];
pub type OrchestrationWorkerReadSource = &'static str; // one of ORCHESTRATION_WORKER_READ_SOURCES

pub const ORCHESTRATION_WORKER_READ_FALLBACK_REASONS: [&str; 7] = [
    "provider_unsupported",
    "session_not_reported",
    "transcript_empty",
    "transcript_missing",
    "transcript_unreadable",
    "transcript_parse_failed",
    "remote_capability_unavailable",
];
pub type OrchestrationWorkerReadFallbackReason = String; // one of ORCHESTRATION_WORKER_READ_FALLBACK_REASONS

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExactWorkerProviderSession {
    pub pane_key: String,
    pub process_incarnation: String,
    /// Accepted transport authority for the PTY; null is the local runtime.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<Option<String>>,
    /// Attested distro for a local PTY whose hook session arrived over WSL.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wsl_distro: Option<String>,
    pub agent: String,
    pub provider_session: serde_json::Value, // AgentProviderSessionMetadata
    /// The recipe Orca launched this worker's agent with; a reopen replays it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_config: Option<serde_json::Value>, // SleepingAgentLaunchConfig
    pub observed_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationWorkerTranscriptPage {
    pub messages: Vec<serde_json::Value>, // NativeChatMessage
    pub next_cursor: String,
    pub limited: bool,
    pub returned_message_count: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct WorkerOutputStatus {
    pub worker: String,
    pub terminal: String, // RuntimeTerminalState
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub liveness: Option<String>, // PtyLivenessVerdict['status']
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationWorkerReadTranscriptResult {
    pub dispatch_id: String,
    pub source: String, // "transcript"
    pub source_identity: String,
    pub provider: String, // AgentType
    pub transcript: OrchestrationWorkerTranscriptPage,
    pub cursor: String,
    pub status: WorkerOutputStatus,
    /// Fleet agent verdict for this Dispatch; absent from hosts that predate it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projection: Option<Option<serde_json::Value>>, // OrchestrationFleetWorker
    pub fallback_reason: serde_json::Value, // always null
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_exact: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_complete: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clipping: Option<Vec<String>>,
    pub warnings: Vec<String>,
    /// The worker was released; output is read from its original transcript or chat history.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationWorkerReadTerminalResult {
    pub dispatch_id: String,
    pub source: String, // "terminal"
    pub source_identity: String,
    pub terminal: serde_json::Value, // RuntimeTerminalRead
    pub cursor: Option<String>,
    pub status: WorkerOutputStatus,
    /// Fleet agent verdict for this Dispatch; absent from hosts that predate it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub projection: Option<Option<serde_json::Value>>, // OrchestrationFleetWorker
    pub fallback_reason: Option<OrchestrationWorkerReadFallbackReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_exact: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content_complete: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub clipping: Option<Vec<String>>,
    pub warnings: Vec<String>,
    /// The worker was released; output is read from its original transcript or chat history.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub archived: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum OrchestrationWorkerReadResult {
    Transcript(OrchestrationWorkerReadTranscriptResult),
    Terminal(OrchestrationWorkerReadTerminalResult),
}
