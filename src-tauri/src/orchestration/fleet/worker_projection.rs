//! Port of fleet/orchestration-fleet-worker-projection.ts: liveness verdict and worker projection.
use super::attention::{project_attention, AttentionFacts, Attention};
use super::evidence::AgentStatusEvidence;
use super::host_scope::{read_host_scope, HostScopeRead};
use super::next_action::{project_next_action, SETTLED_WORKER_STATES};
use super::outcome::{is_unsupervised_settled_dispatch, resolve_worker_outcome, WorkerOutcome};
use super::types::{FleetDurableWorker, Liveness, NextAction};

/// Shared with the agent-status freshness contract.
pub const AGENT_STATUS_STALE_AFTER_MS: i64 = 120_000;
const FUTURE_TOLERANCE_MS: i64 = 5_000;

/// Durable facts that prove a supervised process ended.
pub const DURABLE_EXIT_WORKER_STATE: &str = "stopped";
pub const DURABLE_EXIT_WORKER_STAGE: &str = "released";
pub const DURABLE_EXIT_RESOURCE_RELEASE: &str = "released";
pub const DURABLE_EXIT_REASONS: [&str; 3] = ["operator_close", "signaled", "exited"];

/// What the host reports for a chat-mode worker, which has no terminal hook stream.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionObservation {
    Live { activity: Option<AgentStatusEvidence> },
    Exited { can_resume: bool },
    Unverifiable { detail: String },
}

fn has_certified_exit(worker: &FleetDurableWorker) -> bool {
    // unknown means stop without observed exit; a missing reason is pre-v29, when the stage alone recorded exit.
    let reason = worker.termination_reason.as_deref();
    (worker.worker_stage.as_deref() == Some("process_exited") && reason != Some("unknown"))
        || reason.is_some_and(|r| DURABLE_EXIT_REASONS.contains(&r))
}

fn host_kind_is_remote(connection_id: Option<&str>, host_scope: Option<&str>) -> bool {
    if let Some(id) = connection_id {
        let _ = id;
        return true;
    }
    matches!(read_host_scope(host_scope), HostScopeRead::Remote { .. } | HostScopeRead::Unreadable)
}

/// Decides whether a worker is live, exited, or unverifiable; absence alone never certifies exit.
pub fn project_liveness(
    worker: &FleetDurableWorker,
    evidence: Option<&AgentStatusEvidence>,
    now: i64,
    session: Option<&SessionObservation>,
) -> Liveness {
    if worker.worker_stage.as_deref() == Some(DURABLE_EXIT_WORKER_STAGE) {
        return Liveness::Exited { source: "execution_host".into() };
    }
    if worker.resource.as_ref().map(|r| r.release_state.as_str()) == Some(DURABLE_EXIT_RESOURCE_RELEASE)
    {
        return Liveness::Exited { source: "resource_release".into() };
    }
    if worker.worker_state == DURABLE_EXIT_WORKER_STATE {
        return Liveness::Exited { source: "worker_stop".into() };
    }
    if has_certified_exit(worker) {
        return Liveness::Exited { source: "execution_host".into() };
    }
    // A settled Dispatch's handed-on terminal is its follow-up's; only that shared row's release proves exit.
    if worker.handed_on.is_some() && SETTLED_WORKER_STATES.contains(&worker.worker_state.as_str()) {
        let released = worker
            .handed_on
            .as_ref()
            .and_then(|h| h.resource.as_ref())
            .is_some_and(|r| r.release_state == DURABLE_EXIT_RESOURCE_RELEASE);
        return if released {
            Liveness::Exited { source: "resource_release".into() }
        } else {
            Liveness::unverifiable("handed_on")
        };
    }
    if let Some(session) = session {
        return match session {
            SessionObservation::Live { .. } => Liveness::Live { observed_at: now, source: "execution_host".into() },
            SessionObservation::Exited { .. } => Liveness::Exited { source: "execution_host".into() },
            SessionObservation::Unverifiable { detail } => Liveness::Unverifiable {
                reason: "host_unavailable".into(),
                observed_at: None,
                detail: Some(detail.clone()),
            },
        };
    }
    if evidence.is_none()
        && is_unsupervised_settled_dispatch(Some(worker.worker_state.as_str()), Some(worker.dispatch_status.as_str()))
    {
        return Liveness::unverifiable("unsupervised_settled");
    }
    let Some(evidence) = evidence else {
        return Liveness::unverifiable("missing_status");
    };
    let observed_at = evidence.clock.at();
    let activity = &evidence.activity;
    let unverifiable_at = |reason: &str| Liveness::Unverifiable {
        reason: reason.into(),
        observed_at: Some(observed_at),
        detail: None,
    };
    if activity.restored_unconfirmed {
        return unverifiable_at("restored_unconfirmed");
    }
    if activity.provider_session_only {
        return unverifiable_at("missing_status");
    }
    if observed_at - now > FUTURE_TOLERANCE_MS {
        return unverifiable_at("future_status");
    }
    let remote = host_kind_is_remote(
        activity.connection_id.as_deref(),
        worker.resource.as_ref().and_then(|r| r.host_scope.as_deref()),
    );
    if remote && activity.connection_id.is_none() {
        return unverifiable_at("missing_status");
    }
    if now - observed_at > AGENT_STATUS_STALE_AFTER_MS {
        return unverifiable_at("stale_status");
    }
    Liveness::Live { observed_at, source: "agent_status".into() }
}

/// A live chat-mode session's own status row, whatever its age; age dates activity, not liveness.
pub fn session_activity_evidence(session: &SessionObservation) -> Option<&AgentStatusEvidence> {
    match session {
        SessionObservation::Live { activity: Some(a) } if !a.activity.restored_unconfirmed => Some(a),
        _ => None,
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerHost {
    pub kind: &'static str,
    pub id: String,
}

/// Host attribution: a connection the evidence rides wins; otherwise the durable host scope.
pub fn project_host(connection_id: Option<&str>, host_scope: Option<&str>) -> WorkerHost {
    if let Some(id) = connection_id {
        return WorkerHost { kind: "remote", id: id.to_string() };
    }
    match read_host_scope(host_scope) {
        HostScopeRead::Absent => WorkerHost { kind: "local", id: "local".into() },
        HostScopeRead::Local { id, .. } => WorkerHost { kind: "local", id },
        HostScopeRead::Remote { id, .. } => WorkerHost { kind: "remote", id },
        HostScopeRead::Unreadable => WorkerHost { kind: "remote", id: "unknown".into() },
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationFleetWorker {
    pub dispatch_id: String,
    pub task_id: String,
    pub run_id: String,
    pub parent_task_id: Option<String>,
    pub host: WorkerHost,
    pub workspace_id: Option<String>,
    pub outcome: WorkerOutcome,
    pub liveness: Liveness,
    pub live_status: &'static str,
    pub last_observed_at: Option<i64>,
    pub next_action: NextAction,
    pub attention: Attention,
    pub auto_release_at: Option<String>,
}

/// Projects one worker: liveness, outcome, host, and what the coordinator owes next.
pub fn project_fleet_worker(
    worker: &FleetDurableWorker,
    hook_evidence: Option<&AgentStatusEvidence>,
    now: i64,
    session: Option<&SessionObservation>,
) -> OrchestrationFleetWorker {
    let liveness = project_liveness(worker, hook_evidence, now, session);
    // A live session's own status row dates its last activity; its age never makes the worker stale.
    let evidence = match session {
        Some(s) => session_activity_evidence(s),
        None => hook_evidence,
    };
    let fresh = matches!(liveness, Liveness::Live { .. }) && evidence.is_some();
    let activity = evidence.map(|e| &e.activity);
    let workspace_id = activity
        .and_then(|a| a.worktree_id.clone())
        .or_else(|| worker.worktree_id.clone())
        .or_else(|| worker.resource.as_ref().and_then(|r| r.worktree_id.clone()));
    let outcome = resolve_worker_outcome(
        worker.outcome,
        Some(worker.worker_state.as_str()),
        Some(worker.dispatch_status.as_str()),
    );
    let can_resume = matches!(session, Some(SessionObservation::Exited { can_resume: true }))
        && worker.worker_state == "ready"
        && worker.dispatch_status == "dispatched"
        && worker.terminal_state != Some(super::types::TerminalState::Released)
        && worker.resource.as_ref().map(|r| r.release_state.as_str()) != Some("released")
        && !has_certified_exit(worker);
    let live_status = match session {
        Some(_) => {
            if matches!(liveness, Liveness::Live { .. }) { "fresh" } else { "unavailable" }
        }
        None => match evidence {
            None => "unavailable",
            Some(e) if e.activity.restored_unconfirmed => "redacted_restore",
            Some(_) if fresh => "fresh",
            Some(_) => "stale",
        },
    };
    let interrupted = can_resume
        || worker.worker_state == "abandoned"
        || worker.termination_reason.as_deref() == Some("operator_close")
        || worker.termination_reason.as_deref() == Some("signaled");
    let attention = project_attention(&AttentionFacts {
        is_root: worker.parent_task_id.is_none(),
        outcome: Some(outcome),
        pending_input: worker.pending_input,
        pending_guidance: false,
        pending_approval: worker.pending_approval,
        interrupted,
        liveness: Some(liveness.clone()),
    });
    OrchestrationFleetWorker {
        dispatch_id: worker.dispatch_id.clone(),
        task_id: worker.task_id.clone(),
        run_id: worker.run_id.clone(),
        parent_task_id: worker.parent_task_id.clone(),
        host: project_host(
            activity.and_then(|a| a.connection_id.as_deref()),
            worker.resource.as_ref().and_then(|r| r.host_scope.as_deref()),
        ),
        workspace_id,
        outcome,
        liveness: liveness.clone(),
        live_status,
        last_observed_at: evidence.map(|e| e.clock.at()),
        next_action: project_next_action(worker, &liveness, can_resume),
        attention,
        auto_release_at: worker.resource.as_ref().and_then(|r| r.auto_release_at.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::fleet::types::FleetDurableWorker;

    fn worker(state: &str) -> FleetDurableWorker {
        FleetDurableWorker {
            dispatch_id: "d1".into(),
            task_id: "t".into(),
            run_id: "r".into(),
            parent_task_id: None,
            worker_state: state.into(),
            dispatch_status: "dispatched".into(),
            worker_stage: None,
            agent_terminal_handle: None,
            pane_key: None,
            worktree_id: None,
            terminal_state: None,
            pending_input: false,
            pending_approval: false,
            resource: None,
            outcome: None,
            termination_reason: None,
            handed_on: None,
        }
    }

    #[test]
    fn stopped_worker_is_proven_exited() {
        let liveness = project_liveness(&worker("stopped"), None, 0, None);
        assert_eq!(liveness, Liveness::Exited { source: "worker_stop".into() });
    }

    #[test]
    fn missing_status_is_unverifiable_not_exit() {
        let liveness = project_liveness(&worker("ready"), None, 0, None);
        assert_eq!(liveness, Liveness::unverifiable("missing_status"));
    }

    #[test]
    fn projected_worker_without_evidence_is_unavailable_and_host_defaults_local() {
        let projected = project_fleet_worker(&worker("ready"), None, 0, None);
        assert_eq!(projected.live_status, "unavailable");
        assert_eq!(projected.host, WorkerHost { kind: "local", id: "local".into() });
        assert_eq!(projected.next_action.kind, super::super::types::NextActionKind::None);
    }

    #[test]
    fn unreadable_host_scope_is_remote_unknown() {
        assert_eq!(project_host(None, Some("not json")), WorkerHost { kind: "remote", id: "unknown".into() });
    }
}
