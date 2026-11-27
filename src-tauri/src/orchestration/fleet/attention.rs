//! Port of fleet/orchestration-fleet-attention.ts.
use super::outcome::WorkerOutcome;
use super::types::Liveness;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[cfg_attr(not(test), allow(dead_code))]
pub enum AttentionCategory {
    Guidance,
    Input,
    Approval,
    Failure,
    Interruption,
    Stale,
    Unverifiable,
    RootCompletion,
}

impl AttentionCategory {
    pub fn is_actionable(self) -> bool {
        matches!(
            self,
            AttentionCategory::Guidance
                | AttentionCategory::Input
                | AttentionCategory::Approval
                | AttentionCategory::Failure
                | AttentionCategory::Interruption
                | AttentionCategory::Unverifiable
        )
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Attention {
    pub categories: Vec<AttentionCategory>,
    pub requires_action: bool,
}

#[derive(Debug, Clone, Default)]
pub struct AttentionFacts {
    pub is_root: bool,
    pub outcome: Option<WorkerOutcome>,
    pub pending_input: bool,
    pub pending_guidance: bool,
    pub pending_approval: bool,
    pub interrupted: bool,
    pub liveness: Option<Liveness>,
}

pub fn project_attention(facts: &AttentionFacts) -> Attention {
    use AttentionCategory::*;
    let mut categories = Vec::new();
    if facts.pending_guidance {
        categories.push(Guidance);
    }
    if facts.pending_input {
        categories.push(Input);
    }
    if facts.pending_approval {
        categories.push(Approval);
    }
    if facts.outcome == Some(WorkerOutcome::Failed) {
        categories.push(Failure);
    }
    if facts.interrupted {
        categories.push(Interruption);
    }
    let exited = matches!(facts.liveness, Some(Liveness::Exited { .. }));
    // Unsupervised settled and handed-on dispatches have no process of their own to wait on.
    if let Some(Liveness::Unverifiable { reason, .. }) = &facts.liveness {
        if reason != "unsupervised_settled" && reason != "handed_on" {
            categories.push(if reason == "stale_status" { Stale } else { Unverifiable });
        }
    }
    // A proven exit must not also report absence and tell callers to keep waiting.
    if !exited
        && matches!(
            facts.outcome,
            Some(WorkerOutcome::OutcomeUnknown) | Some(WorkerOutcome::FinishedUnverified)
        )
        && !categories.contains(&Unverifiable)
    {
        categories.push(Unverifiable);
    }
    if facts.is_root && facts.outcome == Some(WorkerOutcome::Succeeded) {
        categories.push(RootCompletion);
    }
    let requires_action = categories.iter().any(|c| c.is_actionable());
    Attention { categories, requires_action }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_status_is_stale_not_unverifiable() {
        let facts = AttentionFacts {
            liveness: Some(Liveness::unverifiable("stale_status")),
            ..Default::default()
        };
        let attention = project_attention(&facts);
        assert_eq!(attention.categories, vec![AttentionCategory::Stale]);
        assert!(!attention.requires_action);
    }

    #[test]
    fn exit_suppresses_absence_wording() {
        let facts = AttentionFacts {
            outcome: Some(WorkerOutcome::OutcomeUnknown),
            liveness: Some(Liveness::Exited { source: "worker_stop".into() }),
            ..Default::default()
        };
        assert!(project_attention(&facts).categories.is_empty());
    }

    #[test]
    fn root_success_reports_completion_and_failure_requires_action() {
        let root = AttentionFacts { is_root: true, outcome: Some(WorkerOutcome::Succeeded), ..Default::default() };
        assert_eq!(project_attention(&root).categories, vec![AttentionCategory::RootCompletion]);
        let failed = AttentionFacts { outcome: Some(WorkerOutcome::Failed), ..Default::default() };
        let attention = project_attention(&failed);
        assert!(attention.requires_action);
    }
}
