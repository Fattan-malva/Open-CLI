//! Port of agent-session conversation-name normalization (agent-session-message-source.ts,
//! normalizeAgentSessionConversationName) + sliceAtCodeUnitLimit.

use regex::Regex;

pub const AGENT_SESSION_CONVERSATION_NAME_MAX_LENGTH: usize = 200;

fn unrenderable_run() -> Regex {
    Regex::new(r"(?:[\s\p{Cc}\p{Zl}\p{Zp}]|(?![\u200C\u200D])\p{Cf})+").unwrap()
}

fn blank_only() -> Regex {
    Regex::new(r"^[\s\u200C\u200D]+$").unwrap()
}

fn trailing_dangle() -> Regex {
    Regex::new(r"[\s\u200C\u200D]+$").unwrap()
}

/// A sender name as stored: bounded and flattened like a conversation name, never raw.
pub fn agent_message_sender_name(value: &str) -> Option<String> {
    normalize_agent_session_conversation_name(value)
}

pub fn normalize_agent_session_conversation_name(value: &str) -> Option<String> {
    let collapsed = unrenderable_run().replace_all(value, " ").trim().to_string();
    if collapsed.is_empty() || blank_only().is_match(&collapsed) {
        return None;
    }
    if utf16_len(&collapsed) <= AGENT_SESSION_CONVERSATION_NAME_MAX_LENGTH {
        return Some(collapsed);
    }
    let truncated = trailing_dangle().replace(&slice_at_code_unit_limit(&collapsed, AGENT_SESSION_CONVERSATION_NAME_MAX_LENGTH), "").to_string();
    if truncated.is_empty() {
        None
    } else {
        Some(truncated)
    }
}

pub fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

/// Cut at a character boundary to avoid a stranded high surrogate rendered as U+FFFD.
pub fn slice_at_code_unit_limit(s: &str, max_units: usize) -> String {
    let mut units = 0usize;
    let mut end = s.len();
    for (byte_idx, ch) in s.char_indices() {
        let w = ch.len_utf16();
        if units + w > max_units {
            end = byte_idx;
            break;
        }
        units += w;
    }
    s[..end].to_string()
}
