use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Mirrors `CrewRow` in orchestration-crew.ts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewRow {
    pub party_key: String,
    pub role: CrewRole,
    pub label: String,
    pub agent_kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub host_label: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<CrewTask>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progress: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest: Option<CrewLatest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply: Option<CrewPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending_question: Option<CrewPreviewAt>,
    /// Worker approval payloads stay raw until the approval schema is ported.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approvals: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub send_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_target: Option<OpenTarget>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrewRole {
    Manager,
    Worker,
    Peer,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CrewTask {
    pub title: String,
    pub state: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrewDirection {
    To,
    From,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewLatest {
    pub direction: CrewDirection,
    pub preview: String,
    pub at: String,
    pub sequence: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewPreview {
    pub preview: String,
    pub at: String,
    pub sequence: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CrewPreviewAt {
    pub preview: String,
    pub at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OpenTarget {
    #[serde(rename_all = "camelCase")]
    Chat { session_id: String, worktree_id: String },
    Terminal { handle: String },
    Dispatch { address: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CrewStatusFlag {
    Ok,
    Unknown,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewSections {
    pub managed_by: Vec<CrewRow>,
    pub managing: Vec<CrewRow>,
    pub talking_with: Vec<CrewRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CrewSnapshot {
    pub status: CrewStatusFlag,
    pub sections: CrewSections,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct CrewSummary {
    pub status: CrewStatusFlag,
    pub agents: usize,
    pub needs_you: usize,
}

pub fn empty_crew(status: CrewStatusFlag) -> CrewSnapshot {
    CrewSnapshot {
        status,
        sections: CrewSections::default(),
    }
}

/// A worker of this party waiting on the person's approval or answer. A question to its coordinator is not.
pub fn crew_row_needs_you(row: &CrewRow) -> bool {
    row.role == CrewRole::Worker && (row.status == "waiting" || row.status == "blocked")
}

/// Counts the manager and workers once each, and managed workers waiting on the person.
pub fn crew_summary(snapshot: &CrewSnapshot) -> CrewSummary {
    let mut parties = std::collections::HashSet::new();
    for row in snapshot
        .sections
        .managed_by
        .iter()
        .chain(snapshot.sections.managing.iter())
    {
        parties.insert(row.party_key.as_str());
    }
    CrewSummary {
        status: snapshot.status,
        agents: parties.len(),
        needs_you: snapshot
            .sections
            .managing
            .iter()
            .filter(|row| crew_row_needs_you(row))
            .count(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(party: &str, role: CrewRole, status: &str) -> CrewRow {
        CrewRow {
            party_key: party.into(),
            role,
            label: party.into(),
            agent_kind: "claude".into(),
            host_label: None,
            status: status.into(),
            task: None,
            progress: None,
            latest: None,
            reply: None,
            pending_question: None,
            approvals: None,
            send_address: None,
            open_target: None,
        }
    }

    #[test]
    fn needs_you_only_for_workers_waiting_or_blocked() {
        assert!(crew_row_needs_you(&row("a", CrewRole::Worker, "waiting")));
        assert!(crew_row_needs_you(&row("a", CrewRole::Worker, "blocked")));
        assert!(!crew_row_needs_you(&row("a", CrewRole::Manager, "waiting")));
        assert!(!crew_row_needs_you(&row("a", CrewRole::Worker, "running")));
    }

    #[test]
    fn summary_counts_each_party_once() {
        let snapshot = CrewSnapshot {
            status: CrewStatusFlag::Ok,
            sections: CrewSections {
                managed_by: vec![row("mgr", CrewRole::Manager, "idle")],
                managing: vec![
                    row("w1", CrewRole::Worker, "waiting"),
                    row("w2", CrewRole::Worker, "running"),
                ],
                talking_with: vec![row("p", CrewRole::Peer, "idle")],
            },
        };
        let summary = crew_summary(&snapshot);
        assert_eq!(summary.agents, 3);
        assert_eq!(summary.needs_you, 1);
    }

    #[test]
    fn open_target_uses_tagged_camel_case_wire_format() {
        let target = OpenTarget::Chat {
            session_id: "s".into(),
            worktree_id: "w".into(),
        };
        let json = serde_json::to_value(&target).unwrap();
        assert_eq!(json["kind"], "chat");
        assert_eq!(json["sessionId"], "s");
        assert_eq!(json["worktreeId"], "w");
    }
}
