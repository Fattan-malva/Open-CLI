use super::state::TaskState;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct EvidenceCommand {
    pub command: String,
    pub exit_code: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Evidence {
    pub summary: String,
    pub changed_files: Vec<String>,
    pub commands: Vec<EvidenceCommand>,
    pub acceptance_met: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub ok: bool,
    pub reasons: Vec<String>,
}

/// Checks evidence against the task's acceptance criteria and command exit codes.
/// Missing evidence fails; an exit code of `None` means the command was not run.
pub fn validate_evidence(acceptance: &[String], evidence: Option<&Evidence>) -> ValidationResult {
    let Some(evidence) = evidence else {
        return ValidationResult {
            ok: false,
            reasons: vec!["No completion evidence was written".into()],
        };
    };
    let mut reasons = Vec::new();
    if evidence.summary.trim().is_empty() {
        reasons.push("Evidence has no summary".into());
    }
    for criterion in acceptance {
        if !evidence.acceptance_met.contains(criterion) {
            reasons.push(format!("Acceptance criterion not confirmed: {}", criterion));
        }
    }
    for command in &evidence.commands {
        if let Some(code) = command.exit_code {
            if code != 0 {
                reasons.push(format!("Command failed ({}): {}", code, command.command));
            }
        }
    }
    ValidationResult {
        ok: reasons.is_empty(),
        reasons,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportTask {
    pub id: String,
    pub status: Option<TaskState>,
    pub output_refs: Vec<String>,
    pub blocker: Option<String>,
    pub evidence: Option<Evidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportWorkspace {
    pub id: String,
    pub dirty_at_create: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ReportInput {
    pub run_id: String,
    pub state: String,
    pub plan_risks: Vec<String>,
    pub tasks: Vec<ReportTask>,
    pub workspaces: Vec<ReportWorkspace>,
    pub validation_event_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SectionStatus {
    Completed,
    Partial,
    Failed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSection {
    pub status: SectionStatus,
    pub tasks: Vec<String>,
    pub note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestSummary {
    pub passed: usize,
    pub failed: usize,
    pub not_run: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalReport {
    pub run_id: String,
    pub state: String,
    pub integrated: ReportSection,
    pub completed_not_integrated: ReportSection,
    pub blocked_or_failed: ReportSection,
    pub tests: TestSummary,
    pub files_changed: Vec<String>,
    pub conflicts: Vec<String>,
    pub risks: Vec<String>,
}

pub fn build_report(input: &ReportInput) -> FinalReport {
    let is_integrated = |task: &ReportTask| task.output_refs.iter().any(|r| r == "integrated");
    let integrated: Vec<&ReportTask> = input
        .tasks
        .iter()
        .filter(|t| t.status == Some(TaskState::Completed) && is_integrated(t))
        .collect();
    let completed: Vec<&ReportTask> = input
        .tasks
        .iter()
        .filter(|t| t.status == Some(TaskState::Completed) && !is_integrated(t))
        .collect();
    let blocked: Vec<&ReportTask> = input
        .tasks
        .iter()
        .filter(|t| {
            matches!(
                t.status,
                Some(TaskState::Failed)
                    | Some(TaskState::Conflict)
                    | Some(TaskState::NeedsInput)
                    | Some(TaskState::Cancelled)
            )
        })
        .collect();
    let commands: Vec<&EvidenceCommand> = input
        .tasks
        .iter()
        .filter_map(|t| t.evidence.as_ref())
        .flat_map(|e| e.commands.iter())
        .collect();
    let files: BTreeSet<String> = input
        .tasks
        .iter()
        .filter_map(|t| t.evidence.as_ref())
        .flat_map(|e| e.changed_files.iter().cloned())
        .collect();
    let conflicts: Vec<String> = input
        .tasks
        .iter()
        .filter(|t| t.status == Some(TaskState::Conflict))
        .map(|t| format!("{}: {}", t.id, t.blocker.clone().unwrap_or_else(|| "merge conflict".into())))
        .collect();
    let mut risks = input.plan_risks.clone();
    risks.extend(
        input
            .workspaces
            .iter()
            .filter(|w| w.dirty_at_create)
            .map(|w| format!("Workspace {} was dirty at creation", w.id)),
    );
    if input.validation_event_count == 0 {
        risks.push("No validation results were recorded".into());
    }

    let ids = |list: &[&ReportTask]| list.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
    FinalReport {
        run_id: input.run_id.clone(),
        state: input.state.clone(),
        integrated: ReportSection {
            status: if integrated.len() == input.tasks.len() && !input.tasks.is_empty() {
                SectionStatus::Completed
            } else {
                SectionStatus::Partial
            },
            tasks: ids(&integrated),
            note: "Validated and integrated through the controlled queue".into(),
        },
        completed_not_integrated: ReportSection {
            status: if completed.is_empty() { SectionStatus::Completed } else { SectionStatus::Partial },
            tasks: ids(&completed),
            note: "Evidence collected but changes were not merged".into(),
        },
        blocked_or_failed: ReportSection {
            status: if blocked.is_empty() { SectionStatus::Completed } else { SectionStatus::Failed },
            tasks: ids(&blocked),
            note: "Requires user attention or a dedicated resolution task".into(),
        },
        tests: TestSummary {
            passed: commands.iter().filter(|c| c.exit_code == Some(0)).count(),
            failed: commands
                .iter()
                .filter(|c| matches!(c.exit_code, Some(code) if code != 0))
                .count(),
            not_run: commands.iter().filter(|c| c.exit_code.is_none()).count(),
        },
        files_changed: files.into_iter().collect(),
        conflicts,
        risks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn evidence(summary: &str, met: &[&str], codes: &[Option<i64>]) -> Evidence {
        Evidence {
            summary: summary.into(),
            acceptance_met: met.iter().map(|s| s.to_string()).collect(),
            commands: codes
                .iter()
                .map(|code| EvidenceCommand {
                    command: "cmd".into(),
                    exit_code: *code,
                })
                .collect(),
            ..Default::default()
        }
    }

    #[test]
    fn missing_evidence_fails() {
        let result = validate_evidence(&["x".into()], None);
        assert!(!result.ok);
    }

    #[test]
    fn unmet_acceptance_and_failed_commands_are_reported() {
        let result = validate_evidence(
            &["tests pass".into()],
            Some(&evidence("did it", &[], &[Some(1), None, Some(0)])),
        );
        assert!(!result.ok);
        assert!(result.reasons.iter().any(|r| r.contains("tests pass")));
        assert!(result.reasons.iter().any(|r| r.starts_with("Command failed (1)")));
        assert_eq!(result.reasons.len(), 2);
    }

    #[test]
    fn passing_evidence_is_accepted() {
        let result = validate_evidence(
            &["tests pass".into()],
            Some(&evidence("did it", &["tests pass"], &[Some(0), None])),
        );
        assert!(result.ok);
    }

    #[test]
    fn report_counts_tests_and_flags_missing_validation() {
        let input = ReportInput {
            run_id: "r".into(),
            state: "partial".into(),
            tasks: vec![ReportTask {
                id: "a".into(),
                status: Some(TaskState::Completed),
                output_refs: vec![],
                evidence: Some(evidence("ok", &[], &[Some(0), Some(2), None])),
                ..Default::default()
            }],
            ..Default::default()
        };
        let report = build_report(&input);
        assert_eq!(report.tests.passed, 1);
        assert_eq!(report.tests.failed, 1);
        assert_eq!(report.tests.not_run, 1);
        assert!(report.risks.iter().any(|r| r == "No validation results were recorded"));
        assert_eq!(report.completed_not_integrated.tasks, vec!["a".to_string()]);
    }
}
