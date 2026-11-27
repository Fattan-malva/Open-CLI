//! Port of crew/crew-rules.ts.

use crate::orchestration::markdown::build_orchestration_task_display_metadata;
use crate::orchestration::markdown::OrchestrationTaskDisplayMetadata;

pub struct CrewTaskRow {
    pub spec: Option<String>,
    pub task_title: Option<String>,
    pub display_name: Option<String>,
}

pub fn crew_task_display(task: Option<&CrewTaskRow>) -> OrchestrationTaskDisplayMetadata {
    match task.and_then(|t| t.spec.as_ref()) {
        Some(spec) => build_orchestration_task_display_metadata(
            spec,
            task.and_then(|t| t.task_title.as_deref()),
            task.and_then(|t| t.display_name.as_deref()),
        ),
        None => OrchestrationTaskDisplayMetadata { task_title: String::new(), display_name: String::new() },
    }
}

pub fn creator_first_parent<T>(creator: Option<T>, coordinator: Option<T>, coordinator_is_self: bool) -> Option<T> {
    creator.or(if coordinator_is_self { None } else { coordinator })
}

pub fn crew_display_name(names: &[Option<&str>]) -> Option<String> {
    names.iter().flatten().find(|n| !n.is_empty()).map(|n| n.to_string())
}
