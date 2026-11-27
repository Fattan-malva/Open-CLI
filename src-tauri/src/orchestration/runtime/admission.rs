//! Port of addressing/orchestration-admission.ts.

/// Only semantic stages construct refusals; reader exceptions keep their acquisition provenance.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrchestrationAdmission<T> {
    Admitted { value: T },
    Refused { error: String },
}

pub fn require_orchestration_admission<T>(result: OrchestrationAdmission<T>) -> Result<T, String> {
    match result {
        OrchestrationAdmission::Admitted { value } => Ok(value),
        OrchestrationAdmission::Refused { error } => Err(error),
    }
}
