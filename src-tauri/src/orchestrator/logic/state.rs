use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunState {
    Draft,
    Planning,
    PlanReady,
    NeedsApproval,
    Executing,
    Waiting,
    Validating,
    Integrating,
    Completed,
    Partial,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskState {
    Queued,
    Blocked,
    Ready,
    Assigned,
    Running,
    Waiting,
    NeedsInput,
    Validating,
    Completed,
    Failed,
    Cancelled,
    Conflict,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Busy,
    Waiting,
    NeedsInput,
    Unavailable,
    Failed,
    Stopped,
}

use RunState as R;
use TaskState as T;
use AgentState as A;

fn run_allowed(from: RunState, to: RunState) -> bool {
    match from {
        R::Draft => matches!(to, R::Planning | R::Cancelled),
        R::Planning => matches!(to, R::PlanReady | R::NeedsApproval | R::Failed | R::Cancelled),
        R::PlanReady => matches!(to, R::Executing | R::NeedsApproval | R::Cancelled | R::Planning),
        R::NeedsApproval => matches!(
            to,
            R::Planning | R::PlanReady | R::Executing | R::Cancelled | R::Failed
        ),
        R::Executing => matches!(
            to,
            R::Waiting | R::Validating | R::NeedsApproval | R::Failed | R::Cancelled
        ),
        R::Waiting => matches!(to, R::Executing | R::Validating | R::Failed | R::Cancelled),
        R::Validating => matches!(
            to,
            R::Integrating | R::Executing | R::Partial | R::Failed | R::Cancelled
        ),
        R::Integrating => matches!(
            to,
            R::Completed | R::Partial | R::Failed | R::Cancelled | R::NeedsApproval
        ),
        R::Completed | R::Partial | R::Cancelled => false,
        R::Failed => matches!(to, R::Planning),
    }
}

fn task_allowed(from: TaskState, to: TaskState) -> bool {
    match from {
        T::Queued => matches!(to, T::Blocked | T::Ready | T::Cancelled),
        T::Blocked => matches!(to, T::Ready | T::Queued | T::Cancelled),
        T::Ready => matches!(to, T::Assigned | T::Blocked | T::Cancelled),
        T::Assigned => matches!(to, T::Running | T::Ready | T::Cancelled | T::Failed),
        T::Running => matches!(
            to,
            T::Waiting | T::NeedsInput | T::Validating | T::Completed | T::Failed | T::Cancelled
        ),
        T::Waiting => matches!(to, T::Running | T::NeedsInput | T::Failed | T::Cancelled),
        T::NeedsInput => matches!(to, T::Running | T::Waiting | T::Failed | T::Cancelled),
        T::Validating => matches!(
            to,
            T::Completed | T::Conflict | T::Running | T::Failed | T::Cancelled
        ),
        T::Completed | T::Cancelled => false,
        T::Failed => matches!(to, T::Ready | T::Cancelled),
        T::Conflict => matches!(to, T::Validating | T::Failed | T::Cancelled),
    }
}

fn agent_allowed(from: AgentState, to: AgentState) -> bool {
    match from {
        A::Idle => matches!(to, A::Busy | A::Unavailable | A::Stopped | A::Failed),
        A::Busy => matches!(
            to,
            A::Idle | A::Waiting | A::NeedsInput | A::Unavailable | A::Failed | A::Stopped
        ),
        A::Waiting | A::NeedsInput => matches!(
            to,
            A::Busy | A::Idle | A::Waiting | A::NeedsInput | A::Unavailable | A::Failed | A::Stopped
        ),
        A::Unavailable => matches!(to, A::Idle | A::Busy | A::Failed | A::Stopped),
        A::Failed => matches!(to, A::Idle | A::Unavailable | A::Stopped),
        A::Stopped => matches!(to, A::Idle),
    }
}

/// Same-state moves are always allowed, mirroring the TypeScript `canMove` helper.
pub fn can_transition_run(from: RunState, to: RunState) -> bool {
    from == to || run_allowed(from, to)
}

pub fn can_transition_task(from: TaskState, to: TaskState) -> bool {
    from == to || task_allowed(from, to)
}

pub fn can_transition_agent(from: AgentState, to: AgentState) -> bool {
    from == to || agent_allowed(from, to)
}

pub fn is_terminal_task_state(state: TaskState) -> bool {
    matches!(state, T::Completed | T::Failed | T::Cancelled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_transitions_follow_the_table() {
        assert!(can_transition_run(RunState::Draft, RunState::Planning));
        assert!(!can_transition_run(RunState::Draft, RunState::Completed));
        assert!(can_transition_run(RunState::Failed, RunState::Planning));
        assert!(!can_transition_run(RunState::Completed, RunState::Executing));
        assert!(can_transition_run(RunState::Completed, RunState::Completed));
    }

    #[test]
    fn task_and_agent_transitions_are_enforced() {
        assert!(can_transition_task(TaskState::Ready, TaskState::Assigned));
        assert!(!can_transition_task(TaskState::Completed, TaskState::Running));
        assert!(can_transition_agent(AgentState::Stopped, AgentState::Idle));
        assert!(!can_transition_agent(AgentState::Stopped, AgentState::Busy));
    }

    #[test]
    fn terminal_task_states_are_detected() {
        assert!(is_terminal_task_state(TaskState::Completed));
        assert!(is_terminal_task_state(TaskState::Failed));
        assert!(!is_terminal_task_state(TaskState::Conflict));
    }
}
