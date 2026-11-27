//! Port of mailbox/reply-subject.ts, mailbox/orchestration-ask-timeout.ts,
//! orchestration-task-display.ts (single-line parts), and orchestration-task-summary.ts.

pub const ASK_DEFAULT_TIMEOUT_MS: u64 = 600_000;
pub const ASK_MAX_TIMEOUT_MS: u64 = 1_800_000;
pub const ASK_CLIENT_GRACE_MS: u64 = 5_000;
pub const TASK_TITLE_MAX_LENGTH: usize = 80;
pub const DISPLAY_NAME_MAX_LENGTH: usize = 160;
const TASK_SPEC_BRIEF_LENGTH: usize = 160;

/// Clamps an ask timeout into [0, max]; missing means the default.
pub fn clamp_ask_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    match timeout_ms {
        None => ASK_DEFAULT_TIMEOUT_MS,
        Some(ms) => ms.min(ASK_MAX_TIMEOUT_MS),
    }
}

pub fn resolve_ask_client_timeout_ms(timeout_ms: Option<u64>) -> u64 {
    clamp_ask_timeout_ms(timeout_ms) + ASK_CLIENT_GRACE_MS
}

/// Length of leading "re:" markers (case-insensitive, each followed by space/tab/newline or end),
/// returning 0 when fewer than `minimum` are present.
fn reply_prefixes_end(subject: &str, minimum: usize) -> usize {
    let bytes = subject.as_bytes();
    let mut count = 0usize;
    let mut end = 0usize;
    let mut pos = 0usize;
    loop {
        let mut p = pos;
        while p < bytes.len() && (bytes[p] == b' ' || bytes[p] == b'\t') {
            p += 1;
        }
        if p + 3 <= bytes.len()
            && bytes[p].eq_ignore_ascii_case(&b'r')
            && bytes[p + 1] == b'e'
            && bytes[p + 2] == b':'
            && (p + 3 == bytes.len() || matches!(bytes[p + 3], b' ' | b'\t' | b'\r' | b'\n'))
        {
            count += 1;
            end = p + 3;
            pos = end;
        } else {
            break;
        }
    }
    if count < minimum {
        return 0;
    }
    if end < bytes.len() && (bytes[end] == b' ' || bytes[end] == b'\t') {
        end + 1
    } else {
        end
    }
}

/// Prefixes "Re: " once.
pub fn reply_subject(subject: &str) -> String {
    let end = reply_prefixes_end(subject, 1);
    format!("Re: {}", &subject[end..])
}

/// Collapses two or more repeated "Re:" markers into one.
pub fn collapse_repeated_reply_prefixes(subject: &str) -> String {
    let end = reply_prefixes_end(subject, 2);
    if end == 0 {
        subject.to_string()
    } else {
        format!("Re: {}", &subject[end..])
    }
}

/// Collapses whitespace, trims, and truncates to `max` chars ending in "...".
pub fn normalize_single_line(value: Option<&str>, max_length: usize) -> String {
    let Some(value) = value else { return String::new() };
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = normalized.chars().collect();
    if chars.len() <= max_length {
        return normalized;
    }
    let body: String = chars[..max_length.saturating_sub(3)].iter().collect();
    format!("{}...", body.trim_end())
}

/// One line of at most 160 characters, ending in "…" when cut.
pub fn abbreviate_text(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let chars: Vec<char> = flat.chars().collect();
    if chars.len() <= TASK_SPEC_BRIEF_LENGTH {
        return flat;
    }
    let body: String = chars[..TASK_SPEC_BRIEF_LENGTH - 1].iter().collect();
    format!("{}…", body.trim_end())
}

/// True when the abbreviated brief drops content (whitespace-only cleanup does not count).
pub fn spec_is_truncated(spec: &str) -> bool {
    spec.split_whitespace().collect::<Vec<_>>().join(" ").chars().count() > TASK_SPEC_BRIEF_LENGTH
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_subject_prefixes_once() {
        assert_eq!(reply_subject("Plan"), "Re: Plan");
        assert_eq!(reply_subject("re: Plan"), "Re: Plan");
    }

    #[test]
    fn collapse_needs_two_markers() {
        assert_eq!(collapse_repeated_reply_prefixes("Re: Plan"), "Re: Plan");
        assert_eq!(collapse_repeated_reply_prefixes("Re: Re: Re: Plan"), "Re: Plan");
    }

    #[test]
    fn ask_timeout_is_clamped() {
        assert_eq!(clamp_ask_timeout_ms(None), ASK_DEFAULT_TIMEOUT_MS);
        assert_eq!(clamp_ask_timeout_ms(Some(99_999_999)), ASK_MAX_TIMEOUT_MS);
        assert_eq!(resolve_ask_client_timeout_ms(Some(0)), ASK_CLIENT_GRACE_MS);
    }

    #[test]
    fn single_line_truncates_with_ellipsis() {
        let long = "a".repeat(100);
        let out = normalize_single_line(Some(&long), 80);
        assert_eq!(out.chars().count(), 80);
        assert!(out.ends_with("..."));
        assert_eq!(normalize_single_line(Some("  a \n b  "), 80), "a b");
    }

    #[test]
    fn abbreviate_keeps_short_text_and_marks_cut_text() {
        assert_eq!(abbreviate_text("hello   world"), "hello world");
        let long = "x".repeat(200);
        let out = abbreviate_text(&long);
        assert!(out.ends_with('…'));
        assert_eq!(out.chars().count(), 160);
        assert!(spec_is_truncated(&long));
        assert!(!spec_is_truncated("short"));
    }
}
