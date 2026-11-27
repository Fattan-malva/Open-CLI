//! Port of shared/markdown/markdown-plain-line.ts + orchestration-task-display.ts.
//! (The TS uses regex backreferences; the `regex` crate lacks them, so marks are scanned manually.)

const OPEN: char = '\u{1}';
const CLOSE: char = '\u{2}';

/// One line of Markdown as plain words: no `**`, `#`, list marks, code ticks or link syntax. Code
/// spans keep their contents as written.
pub fn markdown_plain_line(line: &str) -> String {
    let mut spans: Vec<String> = Vec::new();
    // The delimiters are dropped from the input first, so only real code spans become placeholders.
    let cleaned: String = line.chars().filter(|&c| c != OPEN && c != CLOSE).collect();
    // `code` -> placeholder
    let mut with_spans = String::new();
    let mut rest = cleaned.as_str();
    while let Some(open) = rest.find('`') {
        if let Some(close_rel) = rest[open + 1..].find('`') {
            with_spans.push_str(&rest[..open]);
            let code = &rest[open + 1..open + 1 + close_rel];
            spans.push(code.to_string());
            with_spans.push(OPEN);
            with_spans.push_str(&(spans.len() - 1).to_string());
            with_spans.push(CLOSE);
            rest = &rest[open + 1 + close_rel + 1..];
        } else {
            break;
        }
    }
    with_spans.push_str(rest);

    let mut s = with_spans.trim().to_string();
    s = strip_leading_marker(&s);
    s = strip_links(&s);
    s = strip_pairs(&s, "**");
    s = strip_pairs(&s, "__");
    s = strip_italic(&s);
    // restore code spans
    let mut out = String::new();
    let mut rest = s.as_str();
    while let Some(open) = rest.find(OPEN) {
        out.push_str(&rest[..open]);
        if let Some(close_rel) = rest[open + 1..].find(CLOSE) {
            let idx: usize = rest[open + 1..open + 1 + close_rel].parse().unwrap_or(usize::MAX);
            out.push_str(spans.get(idx).map(|s| s.as_str()).unwrap_or(""));
            rest = &rest[open + 1 + close_rel + 1..];
        } else {
            out.push(OPEN);
            rest = &rest[open + 1..];
        }
    }
    out.push_str(rest);
    out.trim().to_string()
}

fn strip_leading_marker(s: &str) -> String {
    // /^(#{1,6}|>|[-*+]|\d+[.)])(?:\s+|$)/
    let trimmed = s;
    let bytes = trimmed.as_bytes();
    let mut marker_len = 0usize;
    if !bytes.is_empty() {
        if bytes[0] == b'#' {
            let mut n = 0;
            while n < bytes.len() && bytes[n] == b'#' && n < 6 {
                n += 1;
            }
            if (1..=6).contains(&n) {
                marker_len = n;
            }
        } else if bytes[0] == b'>' || bytes[0] == b'-' || bytes[0] == b'*' || bytes[0] == b'+' {
            marker_len = 1;
        } else {
            let mut n = 0;
            while n < bytes.len() && bytes[n].is_ascii_digit() {
                n += 1;
            }
            if n > 0 && n < bytes.len() && (bytes[n] == b'.' || bytes[n] == b')') {
                marker_len = n + 1;
            }
        }
    }
    if marker_len == 0 {
        return trimmed.to_string();
    }
    let after = &trimmed[marker_len..];
    if after.is_empty() {
        return String::new();
    }
    match after.chars().next() {
        Some(c) if c.is_whitespace() => after.trim_start().to_string(),
        _ => trimmed.to_string(), // marker must be followed by whitespace or end
    }
}

fn strip_links(s: &str) -> String {
    // /!?\[([^\]]*)\]\([^)]*\)/g -> $1
    let mut out = String::new();
    let mut rest = s;
    loop {
        // find [ or ![
        let open = rest.find('[');
        let Some(open) = open else { break };
        let label_start = if open > 0 && rest.as_bytes()[open - 1] == b'!' { open - 1 } else { open };
        let Some(close_rel) = rest[open + 1..].find(']') else { break };
        let after_close = open + 1 + close_rel + 1;
        // need ( ... )
        if rest.as_bytes().get(after_close) == Some(&b'(') {
            if let Some(paren_rel) = rest[after_close + 1..].find(')') {
                out.push_str(&rest[..label_start]);
                out.push_str(&rest[open + 1..open + 1 + close_rel]);
                rest = &rest[after_close + 1 + paren_rel + 1..];
                continue;
            }
        }
        // not a link; copy through '[' and continue after it
        out.push_str(&rest[..open + 1]);
        rest = &rest[open + 1..];
    }
    out.push_str(rest);
    out
}

fn strip_pairs(s: &str, marker: &str) -> String {
    // /(M)(.+?)\1/g non-nested -> $2
    let mut out = String::new();
    let mut rest = s;
    loop {
        let Some(open) = rest.find(marker) else { break };
        let content_start = open + marker.len();
        let Some(close_rel) = rest[content_start..].find(marker) else { break };
        let inner = &rest[content_start..content_start + close_rel];
        if inner.is_empty() {
            // `.+?` requires at least one char; copy marker and continue
            out.push_str(&rest[..content_start]);
            rest = &rest[content_start..];
            continue;
        }
        out.push_str(&rest[..open]);
        out.push_str(inner);
        rest = &rest[content_start + close_rel + marker.len()..];
    }
    out.push_str(rest);
    out
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn strip_italic(s: &str) -> String {
    // /(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?=[^\w*]|$)/g -> $1$2
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::new();
    let mut copied = 0usize; // chars before `copied` already emitted
    let mut i = 0usize;
    while i < chars.len() {
        let marker = chars[i];
        if marker == '*' || marker == '_' {
            let prev_ok = i == 0 || (!is_word_char(chars[i - 1]) && chars[i - 1] != '*');
            let content_start = i + 1;
            if prev_ok && content_start < chars.len() {
                let first = chars[content_start];
                if !first.is_whitespace() && first != '*' && first != '_' {
                    // find closing marker without crossing another marker
                    let mut k = content_start + 1;
                    while k < chars.len() && chars[k] != '*' && chars[k] != '_' {
                        k += 1;
                    }
                    if k < chars.len() && chars[k] == marker {
                        let after_ok = k + 1 >= chars.len() || (!is_word_char(chars[k + 1]) && chars[k + 1] != '*');
                        let inner: String = chars[content_start..k].iter().collect();
                        if after_ok && !inner.is_empty() {
                            let prefix: String = chars[copied..i].iter().collect();
                            out.push_str(&prefix);
                            out.push_str(&inner);
                            i = k + 1;
                            copied = i;
                            continue;
                        }
                    }
                }
            }
        }
        i += 1;
    }
    let tail: String = chars[copied..].iter().collect();
    out.push_str(&tail);
    out
}
// --- orchestration-task-display.ts ---

pub const ORCHESTRATION_TASK_TITLE_MAX_LENGTH: usize = 80;
pub const ORCHESTRATION_DISPLAY_NAME_MAX_LENGTH: usize = 160;
/// Bounds the Markdown pass on one huge spec line; a heading's link fits well within it.
const SPEC_LINE_SCAN_LIMIT: usize = 4_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OrchestrationTaskDisplayMetadata {
    pub task_title: String,
    pub display_name: String,
}

pub fn build_orchestration_task_display_metadata(spec: &str, task_title: Option<&str>, display_name: Option<&str>) -> OrchestrationTaskDisplayMetadata {
    let task_title = {
        let t = normalize_single_line(task_title, ORCHESTRATION_TASK_TITLE_MAX_LENGTH);
        if t.is_empty() {
            derive_task_title_from_spec(spec)
        } else {
            t
        }
    };
    let display_name = {
        let d = normalize_single_line(display_name, ORCHESTRATION_DISPLAY_NAME_MAX_LENGTH);
        if d.is_empty() {
            task_title.clone()
        } else {
            d
        }
    };
    OrchestrationTaskDisplayMetadata { task_title, display_name }
}

fn derive_task_title_from_spec(spec: &str) -> String {
    for line in spec.split('\n').map(|l| l.strip_suffix('\r').unwrap_or(l)) {
        let slice_end = line.len().min(SPEC_LINE_SCAN_LIMIT);
        let slice_end = if line.is_char_boundary(slice_end) { slice_end } else { slice_end - 1 };
        let title = normalize_single_line(Some(markdown_plain_line(&line[..slice_end]).as_str()), ORCHESTRATION_TASK_TITLE_MAX_LENGTH);
        if !title.is_empty() {
            return title;
        }
    }
    normalize_single_line(Some(spec), ORCHESTRATION_TASK_TITLE_MAX_LENGTH)
}

pub fn normalize_single_line(value: Option<&str>, max_length: usize) -> String {
    let Some(value) = value else { return String::new() };
    if value.is_empty() {
        return String::new();
    }
    let normalized = value.trim().split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return String::new();
    }
    if super::conversation_name::utf16_len(&normalized) <= max_length {
        return normalized;
    }
    // slice at UTF-16 code-unit boundary, drop a trailing dangling high surrogate, trim end
    let body = super::conversation_name::slice_at_code_unit_limit(&normalized, max_length.saturating_sub(3));
    format!("{}...", body.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_plain_line_basic() {
        assert_eq!(markdown_plain_line("# Title"), "Title");
        assert_eq!(markdown_plain_line("- item"), "item");
        assert_eq!(markdown_plain_line("1. item"), "item");
        assert_eq!(markdown_plain_line("> quote"), "quote");
        assert_eq!(markdown_plain_line("**bold** and _em_"), "bold and em");
        assert_eq!(markdown_plain_line("[label](http://x)"), "label");
        assert_eq!(markdown_plain_line("![alt](img.png)"), "alt");
        assert_eq!(markdown_plain_line("a `code *x*` b"), "a code *x* b");
    }
}


