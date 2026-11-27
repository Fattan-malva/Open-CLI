//! Port of workers/nested-worker-depth.ts.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NestedWorkerDepthSettings {
    /// Maximum worker nesting; 1 forbids sub-workers. Renderer-only: omit from SettingsUpdate RPC so workers cannot raise their cap.
    pub nested_worker_max_depth: Option<i64>,
    /// One-shot guard: a stored 1 from the old default moves to 4 once; later choices stick.
    pub nested_worker_max_depth_defaulted_to_four: Option<bool>,
}

/// Worker nesting limit; a backstop against runaway loops of workers starting workers.
pub const NESTED_WORKER_MAX_DEPTH_DEFAULT: i64 = 4;
/// The pre-4 default, persisted in full so it cannot be told apart from a deliberate choice.
const LEGACY_NESTED_WORKER_MAX_DEPTH_DEFAULT: i64 = 1;
/// Root coordinators are depth 0; the first generation of workers is depth 1.
pub const ROOT_DISPATCH_DEPTH: i64 = 0;
pub const NESTED_WORKER_DEPTH_EXCEEDED_CODE: &str = "nested_worker_depth_exceeded";

pub fn nested_worker_depth_exceeded_message(child_depth: i64, max_depth: i64) -> String {
    // Name the next step or refused workers loop on unavailable dispatch.
    format!(
        "Workers can nest at most {max_depth} {} deep, so this worker can't start another (depth {child_depth}). Finish this task here.",
        if max_depth == 1 { "level" } else { "levels" }
    )
}

pub const NESTED_WORKER_DEPTH_EXCEEDED_NEXT_STEPS: [&str; 2] = [
    "Finish the task in this terminal instead of starting another worker.",
    // The original string carries a literal U+001F between "Settings" and "Orchestration".
    "To allow deeper nesting, ask the user to raise \"Nested worker depth\" in Settings \u{1f} Orchestration of the Orca desktop app.",
];

/// Reject unsafe/noninteger values below one to the default; malformed settings cannot disable the depth fence.
pub fn resolve_nested_worker_max_depth(settings: Option<&NestedWorkerDepthSettings>) -> i64 {
    match settings.and_then(|s| s.nested_worker_max_depth) {
        Some(raw) if raw >= 1 => raw,
        _ => NESTED_WORKER_MAX_DEPTH_DEFAULT,
    }
}

/// Move the old default of 1 to 4 once; higher values and any later choice stay.
pub fn migrate_nested_worker_max_depth_default(settings: Option<&NestedWorkerDepthSettings>) -> NestedWorkerDepthSettings {
    let current = resolve_nested_worker_max_depth(settings);
    let already = settings.and_then(|s| s.nested_worker_max_depth_defaulted_to_four) == Some(true);
    NestedWorkerDepthSettings {
        nested_worker_max_depth: Some(if !already && current == LEGACY_NESTED_WORKER_MAX_DEPTH_DEFAULT { NESTED_WORKER_MAX_DEPTH_DEFAULT } else { current }),
        nested_worker_max_depth_defaulted_to_four: Some(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_names_levels_and_next_step() {
        assert!(nested_worker_depth_exceeded_message(2, 1).contains("at most 1 level deep"));
        assert!(nested_worker_depth_exceeded_message(5, 4).contains("at most 4 levels deep"));
        assert!(nested_worker_depth_exceeded_message(5, 4).contains("(depth 5)"));
    }

    #[test]
    fn malformed_settings_cannot_disable_fence() {
        assert_eq!(resolve_nested_worker_max_depth(None), NESTED_WORKER_MAX_DEPTH_DEFAULT);
        assert_eq!(resolve_nested_worker_max_depth(Some(&NestedWorkerDepthSettings::default())), NESTED_WORKER_MAX_DEPTH_DEFAULT);
        assert_eq!(resolve_nested_worker_max_depth(Some(&NestedWorkerDepthSettings { nested_worker_max_depth: Some(0), ..Default::default() })), NESTED_WORKER_MAX_DEPTH_DEFAULT);
        assert_eq!(resolve_nested_worker_max_depth(Some(&NestedWorkerDepthSettings { nested_worker_max_depth: Some(7), ..Default::default() })), 7);
    }

    #[test]
    fn legacy_one_moves_to_four_once() {
        let s = NestedWorkerDepthSettings { nested_worker_max_depth: Some(1), nested_worker_max_depth_defaulted_to_four: None };
        let m = migrate_nested_worker_max_depth_default(Some(&s));
        assert_eq!(m.nested_worker_max_depth, Some(4));
        let s = NestedWorkerDepthSettings { nested_worker_max_depth: Some(1), nested_worker_max_depth_defaulted_to_four: Some(true) };
        assert_eq!(migrate_nested_worker_max_depth_default(Some(&s)).nested_worker_max_depth, Some(1));
    }
}
