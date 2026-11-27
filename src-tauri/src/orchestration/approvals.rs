//! Port of approvals/worker-approval-payload.ts and approvals/worker-approval-record.ts.
use serde::{Deserialize, Serialize};

pub const APPROVAL_CALLER_PREFIX: &str = "trusted-local:orchestration:approval:";
pub const COORDINATOR_APPROVAL_CALLER_PREFIX: &str = "trusted-local:orchestration:approval:coordinator:";
pub const PERSON_APPROVAL_CALLER_PREFIX: &str = "trusted-local:orchestration:approval:person:";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Decision {
    Allow,
    Deny,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Answerer {
    Person,
    Coordinator,
    WorkerChat,
    WorkerTerminal,
    Auto,
    TerminalOnly,
    WorkerEnded,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApprovalState {
    Open,
    Answered,
    Expired,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalOutcome {
    pub by: Answerer,
    pub decision: Option<Decision>,
    pub reason: Option<String>,
    pub reason_delivered: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalWorker {
    pub handle: String,
    pub dispatch_id: String,
    pub task_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalSummary {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    pub detail: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerApprovalPayload {
    pub v: u8,
    pub approval_id: String,
    pub state: ApprovalState,
    pub worker: ApprovalWorker,
    pub summary: ApprovalSummary,
    pub allowed_actions: Vec<Decision>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_helper: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub person_only: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub outcome: Option<ApprovalOutcome>,
}

/// Same approval once closed: nothing left to answer, and how it closed.
/// Expired only on the agent's own timeout; every other close is answered.
pub fn closed_approval(open: &WorkerApprovalPayload, outcome: ApprovalOutcome) -> WorkerApprovalPayload {
    let state = if outcome.by == Answerer::Auto {
        ApprovalState::Expired
    } else {
        ApprovalState::Answered
    };
    let reason_delivered = outcome.reason.is_some() && outcome.reason_delivered;
    let mut closed = open.clone();
    closed.state = state;
    closed.allowed_actions = Vec::new();
    closed.outcome = Some(ApprovalOutcome {
        reason_delivered,
        ..outcome
    });
    // A countdown means nothing once the prompt is closed.
    closed.expires_at = None;
    closed
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordTone {
    Allowed,
    Denied,
    Open,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecordSentence {
    YouAllowedFor,
    YouDeniedFor,
    CoordinatorAllowed,
    CoordinatorDenied,
    AllowedInTerminal,
    DeniedInTerminal,
    AllowedInChat,
    DeniedInChat,
    AutoDenied,
    WaitsInTerminal,
    WorkerEnded,
    ClosedUnnamed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovalRecordReason {
    pub text: String,
    pub sent_as_message: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkerApprovalRecord {
    pub tone: RecordTone,
    pub sentence: RecordSentence,
    pub tool: String,
    /// The line ends with an Open worker link: only its terminal can answer it.
    pub opens_worker: bool,
    pub reason: Option<ApprovalRecordReason>,
}

/// Same rule as the TypeScript approvalRecordTool: the trimmed tool name, else the title.
fn record_tool(tool: Option<&str>, title: &str) -> String {
    match tool.map(str::trim) {
        Some(name) if !name.is_empty() => name.to_string(),
        _ => title.to_string(),
    }
}

/// Who answered a closed worker prompt and how.
pub fn worker_approval_record(approval: &WorkerApprovalPayload) -> WorkerApprovalRecord {
    let outcome = approval.outcome.as_ref();
    let decision = outcome.and_then(|o| o.decision);
    let by = outcome.map(|o| o.by);
    let allowed = decision == Some(Decision::Allow);
    let tool = record_tool(approval.summary.tool.as_deref(), &approval.summary.title);
    let reason = match outcome {
        Some(o) if o.by == Answerer::Coordinator => o.reason.as_ref().map(|text| ApprovalRecordReason {
            text: text.clone(),
            sent_as_message: o.decision == Some(Decision::Deny) && !o.reason_delivered,
        }),
        _ => None,
    };
    let answered = |yes: RecordSentence, no: RecordSentence| {
        (
            if allowed { RecordTone::Allowed } else { RecordTone::Denied },
            if allowed { yes } else { no },
        )
    };
    // A missing decision with a named answerer other than terminal-only/worker-ended reads as unnamed.
    let effective = if decision.is_none()
        && by != Some(Answerer::TerminalOnly)
        && by != Some(Answerer::WorkerEnded)
    {
        None
    } else {
        by
    };
    let (tone, sentence, opens_worker) = match effective {
        Some(Answerer::Person) => {
            let (t, s) = answered(RecordSentence::YouAllowedFor, RecordSentence::YouDeniedFor);
            (t, s, false)
        }
        Some(Answerer::Coordinator) => {
            let (t, s) = answered(RecordSentence::CoordinatorAllowed, RecordSentence::CoordinatorDenied);
            (t, s, false)
        }
        Some(Answerer::WorkerTerminal) => {
            let (t, s) = answered(RecordSentence::AllowedInTerminal, RecordSentence::DeniedInTerminal);
            (t, s, false)
        }
        Some(Answerer::WorkerChat) => {
            let (t, s) = answered(RecordSentence::AllowedInChat, RecordSentence::DeniedInChat);
            (t, s, false)
        }
        Some(Answerer::Auto) => (RecordTone::Denied, RecordSentence::AutoDenied, false),
        Some(Answerer::TerminalOnly) => (RecordTone::Open, RecordSentence::WaitsInTerminal, true),
        Some(Answerer::WorkerEnded) => (RecordTone::Closed, RecordSentence::WorkerEnded, false),
        Some(Answerer::Unknown) | None => (RecordTone::Closed, RecordSentence::ClosedUnnamed, false),
    };
    WorkerApprovalRecord {
        tone,
        sentence,
        tool,
        opens_worker,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_payload() -> WorkerApprovalPayload {
        WorkerApprovalPayload {
            v: 1,
            approval_id: "a1".into(),
            state: ApprovalState::Open,
            worker: ApprovalWorker {
                handle: "h".into(),
                dispatch_id: "d".into(),
                task_id: "t".into(),
            },
            summary: ApprovalSummary {
                title: "Run command".into(),
                tool: Some("  Bash ".into()),
                detail: None,
                reason: None,
            },
            allowed_actions: vec![Decision::Allow, Decision::Deny],
            from_helper: None,
            person_only: None,
            expires_at: Some("2026-01-01T00:00:00Z".into()),
            outcome: None,
        }
    }

    fn outcome(by: Answerer, decision: Option<Decision>) -> ApprovalOutcome {
        ApprovalOutcome {
            by,
            decision,
            reason: None,
            reason_delivered: false,
        }
    }

    #[test]
    fn auto_timeout_expires_and_other_closes_are_answered() {
        let auto = closed_approval(&open_payload(), outcome(Answerer::Auto, None));
        assert_eq!(auto.state, ApprovalState::Expired);
        let person = closed_approval(&open_payload(), outcome(Answerer::Person, Some(Decision::Allow)));
        assert_eq!(person.state, ApprovalState::Answered);
        assert!(person.allowed_actions.is_empty());
        assert!(person.expires_at.is_none());
    }

    #[test]
    fn reason_delivered_requires_a_reason() {
        let mut o = outcome(Answerer::Coordinator, Some(Decision::Deny));
        o.reason_delivered = true;
        let closed = closed_approval(&open_payload(), o);
        assert!(!closed.outcome.unwrap().reason_delivered);
    }

    #[test]
    fn record_tool_trims_and_falls_back_to_title() {
        let mut payload = open_payload();
        let record = worker_approval_record(&closed_approval(&payload, outcome(Answerer::Person, Some(Decision::Allow))));
        assert_eq!(record.tool, "Bash");
        payload.summary.tool = Some("   ".into());
        let record = worker_approval_record(&closed_approval(&payload, outcome(Answerer::Person, Some(Decision::Allow))));
        assert_eq!(record.tool, "Run command");
    }

    #[test]
    fn record_sentences_follow_the_answerer() {
        let p = open_payload();
        let rec = |by, d| worker_approval_record(&closed_approval(&p, outcome(by, d)));
        assert_eq!(rec(Answerer::Person, Some(Decision::Deny)).sentence, RecordSentence::YouDeniedFor);
        assert_eq!(rec(Answerer::WorkerChat, Some(Decision::Allow)).sentence, RecordSentence::AllowedInChat);
        assert_eq!(rec(Answerer::Auto, Some(Decision::Deny)).sentence, RecordSentence::AutoDenied);
        // Matches the TypeScript switch: no decision with a named answerer reads as unnamed.
        assert_eq!(rec(Answerer::Auto, None).sentence, RecordSentence::ClosedUnnamed);
        let open = rec(Answerer::TerminalOnly, None);
        assert_eq!(open.tone, RecordTone::Open);
        assert!(open.opens_worker);
        assert_eq!(rec(Answerer::Unknown, Some(Decision::Allow)).sentence, RecordSentence::ClosedUnnamed);
    }

    #[test]
    fn coordinator_reason_is_sent_as_message_only_when_denied_and_undelivered() {
        let p = open_payload();
        let mut o = outcome(Answerer::Coordinator, Some(Decision::Deny));
        o.reason = Some("too risky".into());
        let record = worker_approval_record(&closed_approval(&p, o));
        let reason = record.reason.unwrap();
        assert_eq!(reason.text, "too risky");
        assert!(reason.sent_as_message);
    }
}
