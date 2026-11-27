//! Port of orchestration-caller-status.ts (host-resolved caller identity contracts).

use serde::{Deserialize, Serialize};

/// Host-resolved Orca session identity comes from the injected environment, never flags. Terminal agents lack it;
/// `orca status --json` publishes it as caller.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationCallerSession {
    pub orca_session_id: String,
    pub live: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallerRefusal {
    pub code: String,
    pub message: String,
}

/// The host refused the session this process names, so it cannot act as it right now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestrationCallerRefusal {
    pub live: bool, // always false
    pub refusal: CallerRefusal,
}

/// Absent for non-session callers, unreachable runtimes or hosts predating orchestration.callerShow.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CliStatusCaller {
    Session(OrchestrationCallerSession),
    Refusal(OrchestrationCallerRefusal),
}

/// `orchestration.callerShow`: `caller` is null when the caller is not an Orca session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestrationCallerShowResult {
    pub caller: Option<OrchestrationCallerSession>,
    /// True when this Orca verified the calling terminal agent's launch. Absent from older Orcas.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal: Option<bool>,
}

/// `orchestration.sessionAddress`: a session's Orca session ID, its `/clear` root's.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationSessionAddressResult {
    pub orca_session_id: String,
}

/// Where a party is now: a chat at its `/clear` lineage's live session, or a terminal.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum OrchestrationPartyLocation {
    #[serde(rename = "chat")]
    Chat { session_id: String, worktree_id: String },
    #[serde(rename = "terminal")]
    Terminal {
        handle: String,
        /// The paired server whose handle it is, as the answering host names that server.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        environment_id: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PartyLostKind {
    Chat,
    Terminal,
}

/// `orchestration.partyLocation`: a null location is a party this host does not find. `lost` says
/// it proved that party gone, and what it was; absent, the host cannot tell (one it does not run).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestrationPartyLocationResult {
    pub location: Option<OrchestrationPartyLocation>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lost: Option<PartyLostKind>,
}
