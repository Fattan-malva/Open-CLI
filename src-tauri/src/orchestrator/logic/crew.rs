//! Orchestration crew read model, mirroring Orca's crew sections and status groups.
//!
//! OpenCLI has no mailbox or agent addresses yet, so the mapping is:
//! - `managing`: worker rows (tasks) of runs this party coordinates.
//! - `managedBy`: the coordinator of the run this party's task belongs to.
//! - `talkingWith`: always empty until OpenCLI has peer agents.

use super::state::TaskState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewRun {
    pub id: String,
    pub coordinator_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewTask {
    pub id: String,
    pub run_id: String,
    pub title: String,
    pub status: Option<TaskState>,
    pub owner_session_id: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewEvent {
    pub task_id: Option<String>,
    pub sequence: u64,
    pub timestamp: String,
    pub preview: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewAgent {
    pub id: String,
    pub label: String,
    pub agent_id: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CrewSource {
    pub runs: Vec<CrewRun>,
    pub tasks: Vec<CrewTask>,
    pub events: Vec<CrewEvent>,
    pub agents: Vec<CrewAgent>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CrewStatusGroup {
    NeedsYou,
    Working,
    Idle,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CrewRole {
    Manager,
    Worker,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewLatest {
    pub preview: String,
    pub at: String,
    pub sequence: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewRow {
    pub party_key: String,
    pub role: CrewRole,
    pub label: String,
    pub status: String,
    pub group: CrewStatusGroup,
    pub task_title: Option<String>,
    pub latest: Option<CrewLatest>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewSections {
    pub managed_by: Vec<CrewRow>,
    pub managing: Vec<CrewRow>,
    pub talking_with: Vec<CrewRow>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewSummary {
    pub agents: usize,
    pub needs_you: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrewSnapshot {
    pub status: &'static str,
    pub sections: CrewSections,
    pub summary: CrewSummary,
}

pub fn status_group(status: Option<TaskState>) -> CrewStatusGroup {
    match status {
        Some(TaskState::NeedsInput) => CrewStatusGroup::NeedsYou,
        Some(TaskState::Assigned)
        | Some(TaskState::Running)
        | Some(TaskState::Waiting)
        | Some(TaskState::Validating) => CrewStatusGroup::Working,
        Some(TaskState::Failed) | Some(TaskState::Conflict) => CrewStatusGroup::Failed,
        _ => CrewStatusGroup::Idle,
    }
}

fn status_label(status: Option<TaskState>) -> String {
    match status {
        Some(state) => serde_json::to_value(state)
            .ok()
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_else(|| "queued".into()),
        None => "queued".into(),
    }
}

/// Latest event per task, so each row shows its most recent activity.
fn latest_by_task(events: &[CrewEvent]) -> HashMap<&str, &CrewEvent> {
    let mut latest: HashMap<&str, &CrewEvent> = HashMap::new();
    for event in events {
        let Some(task_id) = event.task_id.as_deref() else { continue };
        let replace = latest
            .get(task_id)
            .map_or(true, |current| event.sequence > current.sequence);
        if replace {
            latest.insert(task_id, event);
        }
    }
    latest
}

/// Newest traffic first; the original order breaks ties, as in Orca's `sortCrewRows`.
fn sort_rows(rows: &mut Vec<CrewRow>) {
    let mut indexed: Vec<(usize, CrewRow)> = rows.drain(..).enumerate().collect();
    indexed.sort_by(|(ai, a), (bi, b)| {
        let a_seq = a.latest.as_ref().map(|l| l.sequence).unwrap_or(0);
        let b_seq = b.latest.as_ref().map(|l| l.sequence).unwrap_or(0);
        b_seq.cmp(&a_seq).then(ai.cmp(bi))
    });
    rows.extend(indexed.into_iter().map(|(_, row)| row));
}

/// Builds the crew read model for one party (an agent session id).
pub fn build_crew(source: &CrewSource, party: &str) -> CrewSnapshot {
    let latest = latest_by_task(&source.events);
    let label_for = |session: &str| {
        source
            .agents
            .iter()
            .find(|agent| agent.id == session)
            .map(|agent| agent.label.clone())
            .unwrap_or_else(|| session.to_string())
    };

    let mut managing: Vec<CrewRow> = Vec::new();
    for task in &source.tasks {
        let coordinates = source
            .runs
            .iter()
            .any(|run| run.id == task.run_id && run.coordinator_id.as_deref() == Some(party));
        if !coordinates {
            continue;
        }
        let worker = task.owner_session_id.clone().unwrap_or_else(|| task.id.clone());
        managing.push(CrewRow {
            party_key: worker.clone(),
            role: CrewRole::Worker,
            label: label_for(&worker),
            status: status_label(task.status),
            group: status_group(task.status),
            task_title: Some(task.title.clone()),
            latest: latest.get(task.id.as_str()).map(|event| CrewLatest {
                preview: event.preview.clone(),
                at: event.timestamp.clone(),
                sequence: event.sequence,
            }),
        });
    }
    sort_rows(&mut managing);

    let mut managed_by: Vec<CrewRow> = Vec::new();
    for task in &source.tasks {
        if task.owner_session_id.as_deref() != Some(party) {
            continue;
        }
        let Some(run) = source.runs.iter().find(|run| run.id == task.run_id) else { continue };
        let Some(coordinator) = run.coordinator_id.as_deref() else { continue };
        managed_by.push(CrewRow {
            party_key: coordinator.to_string(),
            role: CrewRole::Manager,
            label: label_for(coordinator),
            status: "idle".into(),
            group: CrewStatusGroup::Idle,
            task_title: Some(task.title.clone()),
            latest: latest.get(task.id.as_str()).map(|event| CrewLatest {
                preview: event.preview.clone(),
                at: event.timestamp.clone(),
                sequence: event.sequence,
            }),
        });
    }
    sort_rows(&mut managed_by);

    let needs_you = managing
        .iter()
        .filter(|row| row.group == CrewStatusGroup::NeedsYou)
        .count();
    CrewSnapshot {
        status: "ok",
        summary: CrewSummary {
            agents: managing.len(),
            needs_you,
        },
        sections: CrewSections {
            managed_by,
            managing,
            talking_with: Vec::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source() -> CrewSource {
        CrewSource {
            runs: vec![CrewRun {
                id: "run-1".into(),
                coordinator_id: Some("coord".into()),
            }],
            tasks: vec![
                CrewTask {
                    id: "t1".into(),
                    run_id: "run-1".into(),
                    title: "Landing".into(),
                    status: Some(TaskState::Running),
                    owner_session_id: Some("w1".into()),
                },
                CrewTask {
                    id: "t2".into(),
                    run_id: "run-1".into(),
                    title: "Tests".into(),
                    status: Some(TaskState::NeedsInput),
                    owner_session_id: Some("w2".into()),
                },
            ],
            events: vec![
                CrewEvent {
                    task_id: Some("t1".into()),
                    sequence: 5,
                    timestamp: "2026-01-01T00:00:05Z".into(),
                    preview: "compiling".into(),
                },
                CrewEvent {
                    task_id: Some("t2".into()),
                    sequence: 9,
                    timestamp: "2026-01-01T00:00:09Z".into(),
                    preview: "need approval".into(),
                },
            ],
            agents: vec![CrewAgent {
                id: "w1".into(),
                label: "Worker One".into(),
                agent_id: "claude".into(),
            }],
        }
    }

    #[test]
    fn coordinator_sees_workers_sorted_by_latest_activity() {
        let snapshot = build_crew(&source(), "coord");
        let keys: Vec<&str> = snapshot.sections.managing.iter().map(|r| r.party_key.as_str()).collect();
        assert_eq!(keys, vec!["w2", "w1"]);
        assert_eq!(snapshot.summary.agents, 2);
        assert_eq!(snapshot.summary.needs_you, 1);
        assert_eq!(snapshot.sections.managing[1].label, "Worker One");
    }

    #[test]
    fn worker_sees_its_coordinator() {
        let snapshot = build_crew(&source(), "w1");
        assert_eq!(snapshot.sections.managed_by.len(), 1);
        assert_eq!(snapshot.sections.managed_by[0].party_key, "coord");
        assert!(snapshot.sections.managing.is_empty());
    }

    #[test]
    fn status_groups_follow_task_states() {
        assert_eq!(status_group(Some(TaskState::NeedsInput)), CrewStatusGroup::NeedsYou);
        assert_eq!(status_group(Some(TaskState::Running)), CrewStatusGroup::Working);
        assert_eq!(status_group(Some(TaskState::Conflict)), CrewStatusGroup::Failed);
        assert_eq!(status_group(Some(TaskState::Queued)), CrewStatusGroup::Idle);
    }
}
