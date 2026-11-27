//! Port of workers/dispatched-worker-attention.ts.
//! `detectAgentStatusFromTitle` (agent-status/title/agent-title-status.ts) is a large separate
//! port; `with_approval_title` takes its `permission` verdict as `title_needs_permission`.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentStatusState {
    Working,
    Done,
    Permission,
    Blocked,
    Idle,
    Unknown,
    Other,
}

/// Minimal attention edge; `leaves_prompt` = TS `edge.type === 'completion' && edge.completion.awaitingUser === true`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AttentionEdge {
    pub is_completion: bool,
    pub awaiting_user: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AgentStatusOrchestrationContext {
    /// `parentPaneKey || parentTerminalHandle` in TS; either proves a dispatched (non-root) worker.
    pub has_parent: bool,
}

/// A dispatched worker's finished turn is news for the agent it reports to; only a stop that needs the person (a prompt) reaches them. A context with no parent (a coordinator's self-dispatch) is the person's own agent.
pub fn is_coordinator_only_news(agent_state: Option<AgentStatusState>, orchestration: Option<&AgentStatusOrchestrationContext>) -> bool {
    if agent_state != Some(AgentStatusState::Done) {
        return false;
    }
    orchestration.is_some_and(|o| o.has_parent)
}

/// The same rule for a chat edge: a failed turn that leaves a prompt waiting still needs the person.
pub fn is_coordinator_only_chat_news(edge: &AttentionEdge, agent_state: AgentStatusState, orchestration: Option<&AgentStatusOrchestrationContext>) -> bool {
    let leaves_prompt = edge.is_completion && edge.awaiting_user;
    !leaves_prompt && is_coordinator_only_news(Some(agent_state), orchestration)
}

/// A title waiting for approval outranks the hook row's state, whatever the hooks last said.
pub fn with_approval_title<S>(agent_state: S, title_is_permission: bool) -> ApprovalTitle<S> {
    if title_is_permission {
        ApprovalTitle::Blocked
    } else {
        ApprovalTitle::State(agent_state)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApprovalTitle<S> {
    Blocked,
    State(S),
}
