//! Port of fleet/orchestration-fleet-outcome-resolution.ts.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttemptOutcome {
    InProgress,
    Succeeded,
    Failed,
    OutcomeUnknown,
    FinishedUnverified,
}

/// `Stopped`: someone asked for the stop, so it is no failure even though the stop fails the Dispatch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkerOutcome {
    InProgress,
    Succeeded,
    Failed,
    OutcomeUnknown,
    FinishedUnverified,
    Stopped,
}

impl From<AttemptOutcome> for WorkerOutcome {
    fn from(value: AttemptOutcome) -> Self {
        match value {
            AttemptOutcome::InProgress => WorkerOutcome::InProgress,
            AttemptOutcome::Succeeded => WorkerOutcome::Succeeded,
            AttemptOutcome::Failed => WorkerOutcome::Failed,
            AttemptOutcome::OutcomeUnknown => WorkerOutcome::OutcomeUnknown,
            AttemptOutcome::FinishedUnverified => WorkerOutcome::FinishedUnverified,
        }
    }
}

/// `unsupervised` from the list query's COALESCE; `None` from the attention-fact query.
pub fn is_unsupervised_worker(worker_state: Option<&str>) -> bool {
    matches!(worker_state, None | Some("unsupervised"))
}

const SETTLED_DISPATCH_STATUSES: [&str; 3] = ["completed", "failed", "circuit_broken"];

/// Pre-v3 or task-settled dispatches may lack worker rows; no supervised process means absence adds no news.
pub fn is_unsupervised_settled_dispatch(worker_state: Option<&str>, dispatch_status: Option<&str>) -> bool {
    is_unsupervised_worker(worker_state)
        && SETTLED_DISPATCH_STATUSES.contains(&dispatch_status.unwrap_or(""))
}

/// Anything the attempt observation settled on wins; the durable dispatch and worker rows answer the rest.
pub fn resolve_worker_outcome(
    attempt_outcome: Option<WorkerOutcome>,
    worker_state: Option<&str>,
    dispatch_status: Option<&str>,
) -> WorkerOutcome {
    // Only a worker stop settles Stopped; it fails a still-active Dispatch with last_failure 'stopped'.
    if worker_state == Some("stopped")
        && attempt_outcome != Some(WorkerOutcome::Succeeded)
        && attempt_outcome != Some(WorkerOutcome::Failed)
    {
        return WorkerOutcome::Stopped;
    }
    if let Some(outcome) = attempt_outcome {
        if outcome != WorkerOutcome::OutcomeUnknown {
            return outcome;
        }
    }
    if worker_state == Some("succeeded") {
        return WorkerOutcome::Succeeded;
    }
    if worker_state == Some("failed") || dispatch_status == Some("failed") {
        return WorkerOutcome::Failed;
    }
    // Completed comes from accepted success or Task completion; without a worker row it is the whole settlement.
    if dispatch_status == Some("completed") && is_unsupervised_worker(worker_state) {
        return WorkerOutcome::Succeeded;
    }
    if matches!(dispatch_status, Some("pending") | Some("dispatched")) {
        return WorkerOutcome::InProgress;
    }
    attempt_outcome.unwrap_or(WorkerOutcome::InProgress)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopped_worker_is_not_a_failure_unless_attempt_settled() {
        assert_eq!(resolve_worker_outcome(None, Some("stopped"), Some("failed")), WorkerOutcome::Stopped);
        assert_eq!(
            resolve_worker_outcome(Some(WorkerOutcome::Failed), Some("stopped"), None),
            WorkerOutcome::Failed
        );
    }

    #[test]
    fn completed_dispatch_without_worker_row_succeeds() {
        assert_eq!(resolve_worker_outcome(None, None, Some("completed")), WorkerOutcome::Succeeded);
        assert_eq!(
            resolve_worker_outcome(None, Some("ready"), Some("completed")),
            WorkerOutcome::InProgress
        );
    }

    #[test]
    fn unknown_attempt_falls_through_to_durable_rows() {
        assert_eq!(
            resolve_worker_outcome(Some(WorkerOutcome::OutcomeUnknown), Some("failed"), None),
            WorkerOutcome::Failed
        );
    }

    #[test]
    fn unsupervised_settled_dispatch_detection() {
        assert!(is_unsupervised_settled_dispatch(None, Some("circuit_broken")));
        assert!(!is_unsupervised_settled_dispatch(Some("ready"), Some("completed")));
    }
}
