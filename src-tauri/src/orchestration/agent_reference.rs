//! Port of mailbox/orchestration-agent-reference.ts plus the Orca session address leaves
//! (agent-session/identity/orca-session-address{,-prefix}.ts, terminal/terminal-handle-prefix.ts,
//! agent-session/lifecycle/agent-session-record.ts isAgentSessionId).

use serde::{Deserialize, Serialize};

pub const ORCA_SESSION_ADDRESS_PREFIX: &str = "orca_session_id:";
/// A bare Orca session id; only `is_orca_session_id` + `parse_orca_session_address` produce one.
pub const TERMINAL_HANDLE_PREFIXES: [&str; 2] = ["term_", super::misc::STRUCTURED_WORKER_HANDLE_PREFIX];

pub fn is_terminal_handle(token: &str) -> bool {
    TERMINAL_HANDLE_PREFIXES.iter().any(|p| token.starts_with(p))
}

/// A plain random id; session id pattern /^[A-Za-z0-9_-]{8,128}$/.
pub fn is_agent_session_id(value: &str) -> bool {
    let len = value.chars().count();
    (8..=128).contains(&len)
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

pub fn is_orca_session_id(id: &str) -> bool {
    is_agent_session_id(id) && !is_terminal_handle(id)
}

/// A bare Orca session id (branded in TS). Format an address with `format_orca_session_address`.
pub fn create_orca_session_id(random_uuid: impl FnOnce() -> String) -> Result<String, String> {
    let id = random_uuid();
    if is_orca_session_id(&id) {
        Ok(id)
    } else {
        Err(format!("Not an Orca session id: {id}"))
    }
}

pub fn format_orca_session_address(orca_session_id: &str) -> String {
    format!("{ORCA_SESSION_ADDRESS_PREFIX}{orca_session_id}")
}

/// The bare Orca session id of an `orca_session_id:<id>` address; anything else reads as null.
pub fn parse_orca_session_address(address: Option<&str>) -> Option<String> {
    let id = address?.strip_prefix(ORCA_SESSION_ADDRESS_PREFIX)?;
    is_orca_session_id(id).then(|| id.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationAgentReference {
    pub label: String,
    pub address: String,
    pub host_key: String,
    /// The agent's logo on its composer pill; never part of the sent text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,
}

pub fn is_public_orchestration_address(address: &str) -> bool {
    if address.starts_with("term_") || address.starts_with("dispatch:") || address.starts_with("run:") {
        // /^(?:term_[a-zA-Z0-9_-]+|(?:dispatch|run):[a-zA-Z0-9_-]+)$/
        let rest = if let Some(r) = address.strip_prefix("term_") {
            r
        } else if let Some(r) = address.strip_prefix("dispatch:") {
            r
        } else {
            &address["run:".len()..]
        };
        return !rest.is_empty() && rest.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    }
    parse_orca_session_address(Some(address)).is_some()
}

/// Strip CR/LF/U+2028/U+2029 to spaces and drop C0/C1 controls (keeps printable, incl. space).
pub fn printable_agent_label(label: &str) -> String {
    label
        .chars()
        .map(|c| match c {
            '\r' | '\n' | '\u{2028}' | '\u{2029}' => ' ',
            c => c,
        })
        .filter(|&c| {
            let n = c as u32;
            n >= 32 && !(127..=159).contains(&n)
        })
        .collect()
}

/// Every printed reference carries this; a draft without it holds no agent reference.
pub const AGENT_REFERENCE_MARK: &str = " (Orca agent ";

pub fn may_hold_agent_references(text: &str) -> bool {
    text.contains(AGENT_REFERENCE_MARK)
}

pub fn agent_reference_token(reference: &OrchestrationAgentReference) -> String {
    format!("@{}{}{})", reference.label, AGENT_REFERENCE_MARK, reference.address)
}

/// The routing line a sent message ends with, one per mentioned agent.
pub fn agent_reference_note(label: &str, address: &str) -> String {
    format!("[Orca agent \"{label}\": {address} — message it with orca orchestration send --to {address} --subject \"<topic>\" --body \"<message>\"]")
}

pub fn terminal_agent_reference(reference: &OrchestrationAgentReference) -> Option<String> {
    if is_public_orchestration_address(&reference.address) {
        Some(format!("{}{}{}) ", printable_agent_label(&reference.label), AGENT_REFERENCE_MARK, reference.address))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_address_shapes() {
        assert!(is_public_orchestration_address("term_abc123"));
        assert!(!is_public_orchestration_address("term_"));
        assert!(is_public_orchestration_address("dispatch:d-1"));
        assert!(is_public_orchestration_address("run:r_1"));
        assert!(!is_public_orchestration_address("dispatch:"));
        assert!(is_public_orchestration_address("orca_session_id:0123456789abcdef"));
        assert!(!is_public_orchestration_address("term_x:y"));
    }

    #[test]
    fn session_address_roundtrip() {
        assert_eq!(parse_orca_session_address(Some("orca_session_id:0123456789abcdef")), Some("0123456789abcdef".into()));
        assert_eq!(parse_orca_session_address(Some("orca_session_id:short")), None);
        assert_eq!(parse_orca_session_address(Some("orca_session_id:term_0123456789")), None);
        assert_eq!(parse_orca_session_address(Some("x")), None);
        assert_eq!(format_orca_session_address("0123456789abcdef"), "orca_session_id:0123456789abcdef");
    }

    #[test]
    fn printable_labels_strip_controls() {
        assert_eq!(printable_agent_label("a\nb\rc\u{2028}d\u{2029}e\u{7}f"), "a b c d ef");
    }
}
