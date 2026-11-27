//! Port of orchestration-mutation-request.ts: describes a mutation request's recorded state.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MutationRequestState {
    Completed,
    Pending,
    Absent,
}

/// Replay guidance for a request whose response was lost in transit.
pub fn describe_mutation_request_state(request_id: &str, state: MutationRequestState, method: Option<&str>) -> String {
    let by = method.map(|m| format!(" by {m}")).unwrap_or_default();
    let took = method.map(|m| format!(" ({m})")).unwrap_or_default();
    match state {
        MutationRequestState::Completed => format!(
            "Request {request_id} already took effect{took}. Replaying it with --retry-request {request_id} returns the recorded outcome and starts nothing new."
        ),
        MutationRequestState::Pending => format!(
            "Request {request_id} was accepted{by} but its outcome is not recorded yet. The original mutation may still be running, or Orca may have restarted before recording its outcome. Wait for the original command when it is still running; otherwise replay it with --retry-request {request_id}. Do not issue a fresh mutation."
        ),
        MutationRequestState::Absent => format!(
            "No receipt for request {request_id} under this caller identity. It never reached this Orca runtime, failed before recording anything, or its receipt was pruned. Absent is not proof that nothing happened."
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn completed_mentions_method_and_replay() {
        let text = describe_mutation_request_state("r1", MutationRequestState::Completed, Some("send"));
        assert!(text.contains("(send)"));
        assert!(text.contains("--retry-request r1"));
    }

    #[test]
    fn absent_is_never_proof_of_no_effect() {
        let text = describe_mutation_request_state("r1", MutationRequestState::Absent, None);
        assert!(text.contains("Absent is not proof that nothing happened."));
    }
}
