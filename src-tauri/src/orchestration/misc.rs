//! Small ports: orchestration-message-wait-timeout, orchestration-run-pagination,
//! orchestration-retry-request-id, orchestration-federation-error-codes,
//! orchestration-session-caller-codes, orchestration-party-identity,
//! orchestration-worker-transcript, structured-worker-handle, worker-approval-time-left.

use serde::{Deserialize, Serialize};

/// orchestration-message-wait-timeout.ts
pub const ORCHESTRATION_MESSAGE_WAIT_DEFAULT_TIMEOUT_MS: u64 = 2 * 60 * 1000;

/// orchestration-run-pagination.ts
pub const ORCHESTRATION_RUN_PAGE_LIMIT: u32 = 100;

/// orchestration-retry-request-id.ts
pub const RETRY_REQUEST_ID_GUIDANCE: &str = "--retry-request must be the UUID Orca reported for the original request; pass it exactly as printed, or omit the flag to start a new request.";
/// A replay-only retry found nothing to replay or join (the receipt may have been evicted after
/// the original committed, or the request takes a route that keeps no receipt here), so it did not run.
pub const RETRY_NOT_REPLAYABLE_CODE: &str = "retry_not_replayable";

/// The CLI and the SSH relay shim parse argv separately; both gate replay identity on this shape.
pub fn is_orchestration_retry_request_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (i, &b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

/// Codes a paired-server call keeps end to end, so callers can tell a stale pairing from an old or
/// unreachable server. (orchestration-federation-error-codes.ts)
pub const ORCHESTRATION_FEDERATION_ERROR_CODES: [&str; 12] = [
    "server_required",
    "worktree_not_found_on_server",
    "resource_server_mismatch",
    "peer_changed",
    "remote_runtime_unavailable",
    "runtime_timeout",
    "invalid_runtime_response",
    "capability_unsupported",
    "relay_quota_exceeded",
    "server_mail_unsupported",
    "mail_requires_server_pairing",
    // The same mail is still being admitted there; nothing was applied, so the sender retries.
    "delivery_in_progress",
];

/// Refusals for an orchestration party named by its Orca agent session id; each applies no effects.
/// (orchestration-session-caller-codes.ts)
pub mod session_caller_codes {
    /// The request crossed a host boundary (a paired client, SSH, or WSL); session identity is same-host only.
    pub const HOST_BOUNDARY: &str = "session_caller_host_boundary";
    /// No Orca agent session with that id exists on this host.
    pub const UNKNOWN: &str = "session_caller_unknown";
    /// The id is a provider's own session id, which rotates on `/clear`; the refusal names the Orca id.
    pub const PROVIDER_ID: &str = "session_caller_provider_id";
    /// The session exists but has no live owner here: released, switching owners, or unreconciled.
    pub const NOT_LIVE: &str = "session_caller_not_live";
    /// The id names a terminal agent, which mail cannot reach by id yet.
    pub const TERMINAL_AGENT: &str = "session_caller_terminal_agent";
    /// A request with no session id named a chat's address as its caller.
    pub const CHAT_NOT_DECLARABLE: &str = "session_caller_chat_not_declarable";
}

/// PTY parties use terminal handle/pane, structured parties use Orca session identity
/// (orca_session_id:<id>). Structured workers also have handles/panes; ordinary chats do not.
/// (orchestration-party-identity.ts)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationPartyIdentity {
    /// Mailbox address the party sends from and reads: its terminal handle, else its session address.
    pub address: String,
    pub terminal_handle: Option<String>,
    pub pane_key: Option<String>,
    /// The bare Orca session id the party is addressed by; mail spells it `orca_session_id:<id>`.
    pub orca_session_id: Option<String>,
}

/// orchestration-worker-transcript.ts
pub const ORCHESTRATION_WORKER_TRANSCRIPT_METHOD: &str = "orchestration.workerTranscript";

/// A finished terminal worker's conversation log; what a click opens once its terminal is gone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestrationWorkerTranscript {
    /// Agent name; kept as a string because the TS `TuiAgent` catalog is product-side.
    pub agent: String,
    /// A path on the host that answered, as the worker's agent reported it.
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrchestrationWorkerTranscriptResult {
    pub transcript: Option<OrchestrationWorkerTranscript>,
}

/// structured-worker-handle.ts
/// Do not use term_: renderer-epoch/leaves validation would discard a main-minted terminal leaf on reload.
pub const STRUCTURED_WORKER_HANDLE_PREFIX: &str = "structworker_";

pub fn is_structured_worker_handle(handle: Option<&str>) -> bool {
    handle.is_some_and(|h| h.starts_with(STRUCTURED_WORKER_HANDLE_PREFIX))
}

/// worker-approval-time-left.ts
/// Seconds left before the agent decides on its own, as m:ss; null once past or unknown.
/// `now` is milliseconds since the Unix epoch; `expires_at` is an ISO-8601 timestamp.
pub fn worker_approval_time_left(expires_at: Option<&str>, now_ms: i64) -> Option<String> {
    let expires_ms = expires_at.and_then(parse_iso8601_ms)?;
    let left = ceil_div(expires_ms - now_ms, 1000);
    if left <= 0 {
        return None;
    }
    Some(format!("{}:{:02}", left / 60, left % 60))
}

fn ceil_div(n: i64, d: i64) -> i64 {
    let q = n.div_euclid(d);
    if n.rem_euclid(d) > 0 {
        q + 1
    } else {
        q
    }
}

/// Minimal ISO-8601 parser producing milliseconds since the Unix epoch.
/// Accepts `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM`, `YYYY-MM-DDTHH:MM:SS`, optional `.fff`,
/// optional `Z` or `±HH:MM`/`±HHMM`/`±HH` offset. Returns None on malformed input.
pub fn parse_iso8601_ms(input: &str) -> Option<i64> {
    let s = input.trim();
    let bytes = s.as_bytes();
    if bytes.len() < 10 {
        return None;
    }
    let year: i64 = s.get(0..4)?.parse().ok()?;
    if bytes.get(4) != Some(&b'-') {
        return None;
    }
    let month: i64 = s.get(5..7)?.parse().ok()?;
    if bytes.get(7) != Some(&b'-') {
        return None;
    }
    let day: i64 = s.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let mut ms: i64 = days_from_civil(year, month, day) * 86_400_000;
    let rest = &s[10..];
    if rest.is_empty() {
        return Some(ms);
    }
    let rest = rest.strip_prefix('T').or_else(|| rest.strip_prefix(' '))?;
    // time part
    let (time, offset_ms) = split_offset(rest)?;
    let mut time_parts = time.splitn(3, ':');
    let hour: i64 = time_parts.next()?.parse().ok()?;
    let minute: i64 = time_parts.next().unwrap_or("0").parse().ok()?;
    let sec_frac = time_parts.next().unwrap_or("0");
    let (sec_str, frac_ms) = match sec_frac.split_once('.') {
        Some((sec, frac)) => {
            let mut frac = frac.to_string();
            while frac.len() < 3 {
                frac.push('0');
            }
            frac.truncate(3);
            (sec, frac.parse::<i64>().ok()?)
        }
        None => (sec_frac, 0),
    };
    let second: i64 = if sec_str.is_empty() { 0 } else { sec_str.parse().ok()? };
    if hour > 24 || minute > 59 || second > 60 {
        return None;
    }
    ms += hour * 3_600_000 + minute * 60_000 + second * 1000 + frac_ms;
    ms -= offset_ms;
    Some(ms)
}

fn split_offset(time: &str) -> Option<(&str, i64)> {
    if let Some(t) = time.strip_suffix('Z').or_else(|| time.strip_suffix('z')) {
        return Some((t, 0));
    }
    // find +/- after position 0 (not the date part; time starts after 'T')
    for (i, c) in time.char_indices().rev() {
        if (c == '+' || c == '-') && i > 0 {
            let (t, off) = time.split_at(i);
            let off = &off[1..];
            let sign: i64 = if c == '+' { 1 } else { -1 };
            let (oh, om) = if let Some((h, m)) = off.split_once(':') {
                (h.parse::<i64>().ok()?, m.parse::<i64>().ok()?)
            } else if off.len() == 4 {
                (off[0..2].parse::<i64>().ok()?, off[2..4].parse::<i64>().ok()?)
            } else if off.len() == 2 {
                (off.parse::<i64>().ok()?, 0)
            } else {
                return None;
            };
            return Some((t, sign * (oh * 3_600_000 + om * 60_000)));
        }
    }
    Some((time, 0))
}

/// Howard Hinnant's days_from_civil.
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_request_id_shape() {
        assert!(is_orchestration_retry_request_id("01234567-89ab-cdef-0123-456789abcdef"));
        assert!(is_orchestration_retry_request_id("01234567-89AB-CDEF-0123-456789ABCDEF"));
        assert!(!is_orchestration_retry_request_id("0123456789abcdef0123456789abcdef"));
        assert!(!is_orchestration_retry_request_id("not-a-uuid"));
        assert!(!is_orchestration_retry_request_id("01234567-89ab-cdef-0123-456789abcdeg"));
    }

    #[test]
    fn structured_worker_handle() {
        assert!(is_structured_worker_handle(Some("structworker_x")));
        assert!(!is_structured_worker_handle(Some("term_x")));
        assert!(!is_structured_worker_handle(None));
    }

    #[test]
    fn time_left_formats_m_ss() {
        let now = 1_700_000_000_000i64;
        // expires exactly 90s ahead -> 1:30
        let exp = iso_from_ms(now + 90_000);
        assert_eq!(worker_approval_time_left(Some(&exp), now).as_deref(), Some("1:30"));
        // 59s -> 0:59
        let exp = iso_from_ms(now + 59_000);
        assert_eq!(worker_approval_time_left(Some(&exp), now).as_deref(), Some("0:59"));
        // past -> null
        let exp = iso_from_ms(now - 1);
        assert_eq!(worker_approval_time_left(Some(&exp), now), None);
        assert_eq!(worker_approval_time_left(None, now), None);
        assert_eq!(worker_approval_time_left(Some("not a date"), now), None);
    }

    #[test]
    fn iso8601_roundtrip() {
        assert_eq!(parse_iso8601_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_iso8601_ms("1970-01-01"), Some(0));
        assert_eq!(parse_iso8601_ms("1970-01-01T00:00:00.500Z"), Some(500));
        assert_eq!(parse_iso8601_ms("1970-01-01T01:00:00+01:00"), Some(0));
        assert_eq!(parse_iso8601_ms("1969-12-31T23:00:00-01:00"), Some(0));
        assert_eq!(parse_iso8601_ms("2024-02-29T12:00:00Z"), parse_iso8601_ms("2024-02-29T12:00:00Z"));
        // non-leap Feb 29 normalizes to Mar 1, like JS Date.parse
        assert_eq!(parse_iso8601_ms("2023-02-29T12:00:00Z"), parse_iso8601_ms("2023-03-01T12:00:00Z"));
    }

    fn iso_from_ms(ms: i64) -> String {
        // RFC3339 UTC from epoch ms, minimal.
        let days = ms.div_euclid(86_400_000);
        let tod = ms.rem_euclid(86_400_000);
        let (y, m, d) = civil_from_days(days);
        let hh = tod / 3_600_000;
        let mm = (tod % 3_600_000) / 60_000;
        let ss = (tod % 60_000) / 1000;
        let frac = tod % 1000;
        format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}.{frac:03}Z")
    }

    fn civil_from_days(z: i64) -> (i64, i64, i64) {
        let z = z + 719468;
        let era = if z >= 0 { z } else { z - 146096 } / 146097;
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let y = yoe + era * 400;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        (if m <= 2 { y + 1 } else { y }, m, d)
    }
}
