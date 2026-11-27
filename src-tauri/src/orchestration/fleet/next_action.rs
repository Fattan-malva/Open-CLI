//! Port of fleet/orchestration-fleet-next-action.ts.
use super::outcome::is_unsupervised_settled_dispatch;
use super::types::{FleetDurableWorker, Liveness, NextAction, NextActionKind, TerminalState};

/// Worker states that carry an outcome; anything else is still supposed to be running.
pub const SETTLED_WORKER_STATES: [&str; 4] = ["succeeded", "failed", "stopped", "abandoned"];

fn is_settled(state: &str) -> bool {
    SETTLED_WORKER_STATES.contains(&state)
}

fn release_action(dispatch_id: &str) -> NextAction {
    NextAction {
        kind: NextActionKind::Release,
        argv: vec![
            "orchestration".into(),
            "worker-release".into(),
            "--dispatch".into(),
            dispatch_id.into(),
        ],
    }
}

fn inspect_action(dispatch_id: &str) -> NextAction {
    NextAction {
        kind: NextActionKind::Inspect,
        argv: vec![
            "orchestration".into(),
            "worker-show".into(),
            "--dispatch".into(),
            dispatch_id.into(),
        ],
    }
}

/// Recomputed after host verdicts; stale local inspect must not outrank recover for proven remote exit.
pub fn project_next_action(worker: &FleetDurableWorker, liveness: &Liveness, can_resume: bool) -> NextAction {
    if worker.worker_stage.as_deref() == Some("released") {
        return NextAction::none();
    }
    if worker.resource.as_ref().and_then(|r| r.auto_release_at.as_ref()).is_some() {
        return NextAction::none();
    }
    if worker.terminal_state == Some(TerminalState::Reclaimable) {
        return release_action(&worker.dispatch_id);
    }
    // Legacy settled dispatches with no resource/worker have nothing to release; inspect would loop.
    let unsupervised_settled = is_unsupervised_settled_dispatch(
        Some(worker.worker_state.as_str()),
        Some(worker.dispatch_status.as_str()),
    );
    if worker.terminal_state == Some(TerminalState::Released)
        || (worker.dispatch_status == "completed"
            && (worker.agent_terminal_handle.is_none()
                || (unsupervised_settled && worker.resource.is_none())))
    {
        return NextAction::none();
    }
    // Settled workers owe only the release of a terminal they still own and nobody kept open.
    if is_settled(&worker.worker_state) {
        let owed = worker.resource.as_ref().is_some_and(|r| {
            r.ownership_state == "owned" && r.release_state != "released" && r.release_state != "retained"
        });
        return if owed { release_action(&worker.dispatch_id) } else { NextAction::none() };
    }
    let pending = worker.pending_input || worker.pending_approval;
    // An unverified absence cannot authorize recovery.
    if matches!(liveness, Liveness::Exited { .. }) && !pending {
        let argv = if can_resume {
            vec![
                "orchestration".into(),
                "send".into(),
                "--to".into(),
                format!("dispatch:{}", worker.dispatch_id),
                "--subject".into(),
                "Continue".into(),
                "--body".into(),
                "Continue the interrupted task.".into(),
            ]
        } else {
            vec![
                "orchestration".into(),
                "worker-read".into(),
                "--dispatch".into(),
                worker.dispatch_id.clone(),
            ]
        };
        return NextAction { kind: NextActionKind::Recover, argv };
    }
    // Live workers with no pending input owe no action.
    if matches!(liveness, Liveness::Live { .. }) && worker.worker_state == "ready" && !pending {
        return NextAction::none();
    }
    // worker-show repeats this projection; absence alone cannot earn another command.
    if matches!(liveness, Liveness::Unverifiable { .. }) && !pending {
        return NextAction::none();
    }
    inspect_action(&worker.dispatch_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::orchestration::fleet::types::FleetResource;

    fn worker(state: &str) -> FleetDurableWorker {
        FleetDurableWorker {
            dispatch_id: "d1".into(),
            task_id: "t".into(),
            run_id: "r".into(),
            parent_task_id: None,
            worker_state: state.into(),
            dispatch_status: "dispatched".into(),
            worker_stage: None,
            agent_terminal_handle: Some("term".into()),
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

    fn live() -> Liveness {
        Liveness::Live { observed_at: 1, source: "agent_status".into() }
    }

    #[test]
    fn released_stage_owes_nothing() {
        let mut w = worker("ready");
        w.worker_stage = Some("released".into());
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::None);
    }

    #[test]
    fn reclaimable_terminal_gets_release() {
        let mut w = worker("ready");
        w.terminal_state = Some(TerminalState::Reclaimable);
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::Release);
    }

    #[test]
    fn settled_worker_releases_only_owned_unretained_terminal() {
        let mut w = worker("succeeded");
        w.resource = Some(FleetResource {
            id: "r".into(),
            owner_dispatch_id: "d1".into(),
            worktree_id: None,
            pane_key: None,
            process_incarnation: None,
            host_scope: None,
            ownership_state: "owned".into(),
            release_state: "pending".into(),
            auto_release_at: None,
            updated_at: "now".into(),
        });
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::Release);
        w.resource.as_mut().unwrap().release_state = "retained".into();
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::None);
    }

    #[test]
    fn proven_exit_recovers_and_unverifiable_does_not() {
        let w = worker("ready");
        let exited = Liveness::Exited { source: "execution_host".into() };
        assert_eq!(project_next_action(&w, &exited, true).kind, NextActionKind::Recover);
        let unknown = Liveness::unverifiable("missing_status");
        assert_eq!(project_next_action(&w, &unknown, false).kind, NextActionKind::None);
    }

    #[test]
    fn live_ready_worker_owes_nothing_but_pending_input_inspects() {
        let mut w = worker("ready");
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::None);
        w.pending_input = true;
        assert_eq!(project_next_action(&w, &live(), false).kind, NextActionKind::Inspect);
    }
}
