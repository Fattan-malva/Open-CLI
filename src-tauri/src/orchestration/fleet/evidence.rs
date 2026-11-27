//! Port of fleet/orchestration-fleet-agent-status-evidence.ts (the parts the projection reads).

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceBinding {
    Worker { dispatch_id: String, terminal_handle: String, pane_key: String, process_incarnation: String },
    Pane { terminal_handle: String, pane_key: String, process_incarnation: String },
    Unresolved { reason: String },
}

impl EvidenceBinding {
    pub fn terminal_handle(&self) -> Option<&str> {
        match self {
            EvidenceBinding::Worker { terminal_handle, .. } | EvidenceBinding::Pane { terminal_handle, .. } => {
                Some(terminal_handle)
            }
            EvidenceBinding::Unresolved { .. } => None,
        }
    }

    pub fn pane_key(&self) -> Option<&str> {
        match self {
            EvidenceBinding::Worker { pane_key, .. } | EvidenceBinding::Pane { pane_key, .. } => Some(pane_key),
            EvidenceBinding::Unresolved { .. } => None,
        }
    }

    pub fn process_incarnation(&self) -> Option<&str> {
        match self {
            EvidenceBinding::Worker { process_incarnation, .. } | EvidenceBinding::Pane { process_incarnation, .. } => {
                Some(process_incarnation)
            }
            EvidenceBinding::Unresolved { .. } => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvidenceClock {
    Observed { at: i64 },
    Delivery { at: i64 },
}

impl EvidenceClock {
    pub fn at(&self) -> i64 {
        match self {
            EvidenceClock::Observed { at } | EvidenceClock::Delivery { at } => *at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentActivity {
    pub pane_key: String,
    pub connection_id: Option<String>,
    pub state: String,
    pub agent_type: Option<String>,
    pub model: Option<String>,
    pub worktree_id: Option<String>,
    pub restored_unconfirmed: bool,
    pub provider_session_only: bool,
    pub background_wait: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentStatusEvidence {
    pub binding: EvidenceBinding,
    pub clock: EvidenceClock,
    /// Replay restamps delivery past transient-clear watermarks: use it for order, never staleness.
    pub delivered_at: i64,
    pub activity: AgentActivity,
}

/// Explicit unidentifiable workers prevent missing handles from matching every row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkerIdentity {
    PaneAndTerminal { pane_key: String, terminal_handle: String },
    TerminalOnly { terminal_handle: String },
    Unidentifiable,
}

pub fn worker_identity(pane_key: Option<&str>, terminal_handle: Option<&str>) -> WorkerIdentity {
    match terminal_handle {
        None | Some("") => WorkerIdentity::Unidentifiable,
        Some(handle) => match pane_key {
            Some(pane) if !pane.is_empty() => WorkerIdentity::PaneAndTerminal {
                pane_key: pane.to_string(),
                terminal_handle: handle.to_string(),
            },
            _ => WorkerIdentity::TerminalOnly { terminal_handle: handle.to_string() },
        },
    }
}
