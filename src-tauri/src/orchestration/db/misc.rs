//! Ports of db/contract-constants.ts, db/generated-id.ts, db/pane-key-match.ts,
//! db/orchestration-db-file.ts, db/remote-owned/written-row.ts, db/run-list-cursor.ts,
//! db/run-list-page.ts, db/dispatch-context/{dispatch-circuit-breaker,dispatch-completion-epoch}.ts,
//! db/worker-dispatch/worker-dispatch-state.ts + shared/workspace-layout/stable-pane-id.ts.

use base64::Engine as _;
use serde::{Deserialize, Serialize};

// --- contract-constants.ts ---
/// v1.4.198 omits Run id; each remote attachment gets a stub home Run.
pub const FEDERATED_STUB_HOME_RUN_ID_PREFIX: &str = "run_federated_";
pub fn federated_stub_home_run_id(dispatch_id: &str) -> String {
    format!("{FEDERATED_STUB_HOME_RUN_ID_PREFIX}{dispatch_id}")
}
pub const LEGACY_CONTRACT_VERSION: u32 = 0;
pub const SCHEMA_VERSION: u32 = 52;

// --- generated-id.ts ---
pub const GENERATED_ID_BYTES: usize = 6;

pub fn generate_id(prefix: &str) -> String {
    let mut bytes = [0u8; GENERATED_ID_BYTES];
    // getrandom via uuid's rng; no extra dependency.
    let rnd = uuid::Uuid::new_v4();
    bytes.copy_from_slice(&rnd.as_bytes()[..GENERATED_ID_BYTES]);
    format!("{}_{}", prefix, bytes.iter().map(|b| format!("{b:02x}")).collect::<String>())
}

/// Whether `value` has the exact shape `generate_id(prefix)` produces.
pub fn is_generated_id(value: &str, prefix: &str) -> bool {
    let marker = format!("{prefix}_");
    let Some(hex) = value.strip_prefix(&marker) else { return false };
    hex.len() == GENERATED_ID_BYTES * 2 && hex.bytes().all(|b| b.is_ascii_hexdigit())
}

// --- pane-key-match.ts ---
const UUID_RE_SRC: &str = r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$";

pub fn is_stable_pane_id(value: &str) -> bool {
    regex::Regex::new(UUID_RE_SRC).unwrap().is_match(value)
}

pub fn is_terminal_leaf_id(value: &str) -> bool {
    is_stable_pane_id(value)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedPaneKey {
    pub tab_id: String,
    pub leaf_id: String,
    pub stable_pane_id: String,
}

pub fn parse_pane_key(pane_key: &str) -> Option<ParsedPaneKey> {
    let first = pane_key.find(':')?;
    if first == 0 || pane_key[first + 1..].contains(':') || first == pane_key.len() - 1 {
        return None;
    }
    let tab_id = &pane_key[..first];
    let leaf_id = &pane_key[first + 1..];
    if !is_terminal_leaf_id(leaf_id) {
        return None;
    }
    Some(ParsedPaneKey { tab_id: tab_id.to_string(), leaf_id: leaf_id.to_string(), stable_pane_id: leaf_id.to_string() })
}

/// Leaf UUIDs survive pane break-out; exact match also supports legacy/unparseable keys.
pub fn is_equivalent_pane_key(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    match (parse_pane_key(a), parse_pane_key(b)) {
        (Some(a), Some(b)) => a.leaf_id == b.leaf_id,
        _ => false,
    }
}

pub fn parse_worker_terminal_prior_owner_ids(value: &str) -> Option<Vec<String>> {
    let parsed: serde_json::Value = serde_json::from_str(value).ok()?;
    let items = parsed.as_array()?;
    if items.iter().all(|e| e.is_string()) {
        Some(items.iter().map(|e| e.as_str().unwrap().to_string()).collect())
    } else {
        None
    }
}

/// An indexable suffix prefilter narrows candidates; isEquivalentPaneKey still decides equivalence.
pub const RUN_PANE_KEY_MATCH_SUFFIX_SQL: &str = "substr(coordinator_pane_key, instr(coordinator_pane_key, ':') + 1)";
pub const DISPATCH_PANE_KEY_MATCH_SUFFIX_SQL: &str = "substr(assignee_pane_key, instr(assignee_pane_key, ':') + 1)";
pub const REMOTE_ATTACHMENT_PANE_KEY_MATCH_SUFFIX_SQL: &str = "substr(pane_key, instr(pane_key, ':') + 1)";
pub const WORKER_TERMINAL_PANE_KEY_MATCH_SUFFIX_SQL: &str = REMOTE_ATTACHMENT_PANE_KEY_MATCH_SUFFIX_SQL;

pub fn pane_key_match_suffix(pane_key: &str) -> &str {
    match pane_key.find(':') {
        None => pane_key,
        Some(colon) => &pane_key[colon + 1..],
    }
}

// --- orchestration-db-file.ts ---
/// The desktop's orchestration database inside a profile's userData directory.
pub fn orchestration_db_file(user_data_path: &str) -> std::path::PathBuf {
    std::path::Path::new(user_data_path).join("orchestration.db")
}

// --- written-row.ts ---
/// A row read back inside the transaction that just wrote it; its absence is a broken invariant, not a state.
pub fn written_row<T>(row: Option<T>, what: &str) -> Result<T, String> {
    row.ok_or_else(|| format!("{what} was not found right after it was written."))
}

// --- run-list-cursor.ts / run-list-page.ts ---
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunListCursor {
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub id: String,
}

pub fn encode_run_list_cursor(created_at: &str, id: &str) -> String {
    let cursor = RunListCursor { created_at: created_at.to_string(), id: id.to_string() };
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(serde_json::to_string(&cursor).unwrap())
}

pub fn decode_run_list_cursor(value: &str) -> Result<RunListCursor, String> {
    let decode = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(value).or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(value));
    let parsed: serde_json::Value = decode.ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).ok_or("cursor_invalid")?;
    let created_at = parsed.get("createdAt").and_then(|v| v.as_str()).ok_or("cursor_invalid")?;
    let id = parsed.get("id").and_then(|v| v.as_str()).ok_or("cursor_invalid")?;
    Ok(RunListCursor { created_at: created_at.to_string(), id: id.to_string() })
}

// --- dispatch-circuit-breaker.ts / dispatch-completion-epoch.ts ---
pub const DISPATCH_CIRCUIT_BREAK_FAILURES: u32 = 3;

/// Preserve the existing ISO/local and SQLite/UTC completion timestamp contract.
/// `value` non-string reads as null; `YYYY-MM-DD HH:MM:SS` is read as UTC (`...T...Z`).
pub fn dispatch_completion_epoch(value: &str) -> Option<i64> {
    let owned;
    let s = if value.contains('T') {
        value
    } else {
        owned = value.replacen(' ', "T", 1) + "Z";
        owned.as_str()
    };
    crate::orchestration::misc::parse_iso8601_ms(s)
}

// --- worker-dispatch-state.ts ---
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkerDispatchState {
    Starting,
    Ready,
    StartUnknown,
    Failed,
    Succeeded,
    Stopping,
    StopUnknown,
    Stopped,
    Abandoned,
}
