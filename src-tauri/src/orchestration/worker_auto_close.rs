//! Port of workers/worker-auto-close.ts (state + reading + countdown; JS pubsub/polling omitted).

use serde::{Deserialize, Serialize};

/// On a terminal that closes with a worker: that worker, by its pane and the name its record has.
/// Older hosts omit it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoundWorker {
    pub pane_key: String,
    pub worktree_id: Option<String>,
    pub name: Option<String>,
    /// The agent the worker started with, for its icon once its tab is gone.
    pub agent: Option<String>,
}

/// Kept open, or temporary with the host's deadline (null while it runs or works again); the host
/// answers null when nothing closes it. Hosts without orchestration.worker-keep-open.v1 lack the method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WorkerAutoCloseState {
    Kept { kept: KeptTrue },
    Temporary {
        kept: KeptFalse,
        closes_at: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        bound_to: Option<BoundWorker>,
    },
}

// serde needs concrete marker types for untagged bool literals.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeptTrue;
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct KeptFalse;

impl KeptTrue {
    pub const fn new() -> Self {
        KeptTrue
    }
}

impl KeptFalse {
    pub const fn new() -> Self {
        KeptFalse
    }
}

// Simpler constructors mirroring the TS object literals.
pub fn kept_open() -> WorkerAutoCloseState {
    WorkerAutoCloseState::Kept { kept: KeptTrue::new() }
}

pub fn temporary(closes_at: Option<String>, bound_to: Option<BoundWorker>) -> WorkerAutoCloseState {
    WorkerAutoCloseState::Temporary { kept: KeptFalse::new(), closes_at, bound_to }
}

pub fn is_kept(state: &WorkerAutoCloseState) -> bool {
    matches!(state, WorkerAutoCloseState::Kept { .. })
}

/// Reads a raw `{ autoClose }` RPC reply; anything malformed reads as null.
pub fn read_worker_auto_close_reply(result: &serde_json::Value) -> Option<WorkerAutoCloseState> {
    let state = result.get("autoClose")?;
    if !state.is_object() {
        return None;
    }
    match state.get("kept") {
        Some(serde_json::Value::Bool(true)) => Some(kept_open()),
        Some(serde_json::Value::Bool(false)) => {
            let closes_at = state.get("closesAt").and_then(|c| c.as_str()).map(|s| s.to_string());
            let bound_to = state.get("boundTo").and_then(read_bound_worker);
            Some(temporary(closes_at, bound_to))
        }
        _ => None,
    }
}

fn read_bound_worker(value: &serde_json::Value) -> Option<BoundWorker> {
    let pane_key = value.get("paneKey")?.as_str()?.to_string();
    let str_field = |name: &str| value.get(name).and_then(|v| v.as_str()).map(|s| s.to_string());
    Some(BoundWorker { pane_key, worktree_id: str_field("worktreeId"), name: str_field("name"), agent: str_field("agent") })
}

/// How long after a temporary worker finishes its host closes it; the banner's copy and progress follow it.
pub const WORKER_AUTO_CLOSE_GRACE_MS: u64 = 2 * 60_000;
/// A temporary worker is re-read to follow its finish and follow-ups; its countdown ticks locally.
pub const TEMPORARY_POLL_MS: u64 = 15_000;
pub const SETTLED_POLL_MS: u64 = 60_000;

/// m:ss until the host's deadline, never below 0:00. `closes_at` is ISO-8601; `now_ms` epoch ms.
pub fn format_worker_auto_close_countdown(closes_at: &str, now_ms: i64) -> String {
    let Some(parsed) = super::misc::parse_iso8601_ms(closes_at) else {
        return "NaN:NaN".into(); // JS Math.ceil(NaN) stays NaN
    };
    let ms = parsed.saturating_sub(now_ms);
    let q = ms.div_euclid(1000);
    let ceil = if ms.rem_euclid(1000) > 0 { q + 1 } else { q };
    let seconds = ceil.max(0);
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_states() {
        let v = serde_json::json!({"autoClose": {"kept": true}});
        assert!(is_kept(&read_worker_auto_close_reply(&v).unwrap()));
        let v = serde_json::json!({"autoClose": {"kept": false, "closesAt": "2026-01-01T00:00:00Z", "boundTo": {"paneKey": "p", "name": "n"}}});
        match read_worker_auto_close_reply(&v).unwrap() {
            WorkerAutoCloseState::Temporary { closes_at, bound_to, .. } => {
                assert_eq!(closes_at.as_deref(), Some("2026-01-01T00:00:00Z"));
                assert_eq!(bound_to.unwrap().name.as_deref(), Some("n"));
            }
            _ => panic!(),
        }
        assert!(read_worker_auto_close_reply(&serde_json::json!({})).is_none());
        assert!(read_worker_auto_close_reply(&serde_json::json!({"autoClose": {"kept": "x"}})).is_none());
    }

    #[test]
    fn countdown_never_negative() {
        assert_eq!(format_worker_auto_close_countdown("1970-01-01T00:00:00Z", 10_000_000), "0:00");
    }
}
