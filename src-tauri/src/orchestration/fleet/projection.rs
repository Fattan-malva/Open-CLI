//! Port of fleet/orchestration-fleet-projection.ts: ORCHESTRATION_FLEET_PAGE_MAX, paging,
//! projectOrchestrationFleet, refreshOrchestrationFleetLivenessAttention.
//! OrchestrationFleetWorker here is the Rust-ported projection shape (worker_projection.rs);
//! full TS field parity (provider/stage detail/resource) is a later pass.

use super::attention::{project_attention, AttentionFacts};
use super::evidence::AgentStatusEvidence;
use super::status_index::{create_status_index, status_for_worker};
use super::types::FleetDurableWorker;
use super::worker_projection::{project_fleet_worker, OrchestrationFleetWorker, SessionObservation};

pub const ORCHESTRATION_FLEET_PAGE_MAX: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationFleetPage {
    pub workers: Vec<OrchestrationFleetWorker>,
    pub limit: usize,
    pub total: usize,
    pub has_more: bool,
    pub next_cursor: Option<String>,
}

pub fn project_orchestration_fleet(
    workers: &[FleetDurableWorker],
    statuses: &[AgentStatusEvidence],
    observe_session: Option<&dyn Fn(&FleetDurableWorker) -> Option<SessionObservation>>,
    now: i64,
    cursor: Option<&str>,
    limit: Option<usize>,
) -> OrchestrationFleetPage {
    let limit = ORCHESTRATION_FLEET_PAGE_MAX.min(limit.unwrap_or(ORCHESTRATION_FLEET_PAGE_MAX).max(1));
    let cursor_index = cursor.and_then(|c| workers.iter().position(|w| w.dispatch_id == c));
    let start = cursor_index.map(|i| i + 1).unwrap_or(0);
    let end = (start + limit).min(workers.len());
    let rows = &workers[start.min(workers.len())..end];
    let status_index = create_status_index(statuses, rows);
    let projected: Vec<OrchestrationFleetWorker> = rows
        .iter()
        .map(|worker| {
            project_fleet_worker(
                worker,
                status_for_worker(worker, &status_index),
                now,
                observe_session.and_then(|f| f(worker)).as_ref(),
            )
        })
        .collect();
    let has_more = start + projected.len() < workers.len();
    OrchestrationFleetPage {
        next_cursor: if has_more { rows.last().map(|w| w.dispatch_id.clone()) } else { None },
        has_more,
        total: workers.len(),
        limit,
        workers: projected,
    }
}

/// Recompute attention with newer host verdicts; liveness-only derivation lost unverifiable outcomes.
pub fn refresh_orchestration_fleet_liveness_attention(worker: &mut OrchestrationFleetWorker) {
    let had = |category: super::attention::AttentionCategory| worker.attention.categories.contains(&category);
    worker.attention = project_attention(&AttentionFacts {
        is_root: worker.parent_task_id.is_none(),
        outcome: Some(worker.outcome),
        pending_input: had(super::attention::AttentionCategory::Input),
        pending_guidance: had(super::attention::AttentionCategory::Guidance),
        pending_approval: had(super::attention::AttentionCategory::Approval),
        interrupted: had(super::attention::AttentionCategory::Interruption),
        liveness: Some(worker.liveness.clone()),
    });
}

