//! Port of workers/orca-dispatch-status-prompt.ts.
//! Compact multi-KB dispatch boilerplate so preamble identity, task id and task-body fallback all
//! fit AGENT_STATUS_MAX_FIELD_LENGTH.
//! Indices are byte offsets into the original UTF-8 string (JS uses UTF-16; ASCII markers make
//! results identical in practice).

pub const ORCA_DISPATCH_STATUS_PREAMBLE_PREFIX: &str = "You are working inside Orca, a multi-agent IDE.";
pub const ORCA_DISPATCH_STATUS_TASK_MARKER: &str = "=== TASK ===";
/// Type this lead: Claude follows pasted briefs only when user prose explicitly asks; bare pasted_content was refused (STA-8200).
pub const ORCA_DISPATCH_PROMPT_LEAD_LINE: &str = "Please carry out this task from my Orca coordinator by following the brief I pasted below.";
const ORCA_DISPATCH_STATUS_TASK_ID_MARKER: &str = "Your task ID is:";
/// Real task markers follow 4KB+ preambles; scan beyond the one-line preview budget to reach the body.
const ORCA_DISPATCH_STATUS_SOURCE_SCAN_LIMIT: usize = 24_576;
const PASTED_CONTENT_OPEN_TAG: &str = "<pasted_content";
/// Claude Code's tag carries only a short id; bound the search for `>`.
const PASTED_CONTENT_OPEN_TAG_MAX_LENGTH: usize = 64;

/// Find preamble start or -1 through optional typed lead/pasted_content wrappers, including older hosts' bare preambles.
/// Returns byte offset, or `None`.
pub fn find_orca_dispatch_preamble_start(value: &str) -> Option<usize> {
    // Bound trusted-shape detection too: arbitrary leading whitespace must not bypass the status normalizer's scan cap.
    let scan_end = char_boundary(value, value.len().min(ORCA_DISPATCH_STATUS_SOURCE_SCAN_LIMIT));
    let mut start = skip_trim_whitespace(value, 0, scan_end);
    if value[start..].starts_with(ORCA_DISPATCH_PROMPT_LEAD_LINE) {
        start = skip_trim_whitespace(value, start + ORCA_DISPATCH_PROMPT_LEAD_LINE.len(), scan_end);
    }
    if value[start..].starts_with(PASTED_CONTENT_OPEN_TAG) {
        let tag_window_end = char_boundary(value, (start + PASTED_CONTENT_OPEN_TAG_MAX_LENGTH).min(value.len()));
        let tag_len = value[start..tag_window_end].find('>')?;
        start = skip_trim_whitespace(value, start + tag_len + 1, scan_end);
    }
    if start + ORCA_DISPATCH_STATUS_PREAMBLE_PREFIX.len() <= scan_end && value[start..].starts_with(ORCA_DISPATCH_STATUS_PREAMBLE_PREFIX) {
        Some(start)
    } else {
        None
    }
}

fn skip_trim_whitespace(value: &str, from: usize, scan_end: usize) -> usize {
    let mut index = from.min(value.len());
    let bytes = value.as_bytes();
    while index < scan_end && index < bytes.len() {
        // whitespace check on the full char
        if let Some(ch) = value[index..].chars().next() {
            if is_ecma_trim_whitespace(ch) {
                index += ch.len_utf8();
                continue;
            }
        }
        break;
    }
    index
}

/// Single-line <prefix> Your task ID is: <id> === TASK === <body> status preview; null for non-dispatch prompts.
/// `normalize_single_line` mirrors the TS injected `normalizeSingleLine`.
pub fn compact_dispatch_prompt_for_status(value: &str, max_length: usize, normalize_single_line: impl Fn(&str, usize) -> String) -> Option<String> {
    let start = find_orca_dispatch_preamble_start(value)?;
    let scan_end = char_boundary(value, value.len().min(ORCA_DISPATCH_STATUS_SOURCE_SCAN_LIMIT));
    let scan = &value[start..scan_end.min(value.len())];

    let mut task_id = String::new();
    if let Some(id_marker_index) = scan.find(ORCA_DISPATCH_STATUS_TASK_ID_MARKER) {
        let after_id = &scan[id_marker_index + ORCA_DISPATCH_STATUS_TASK_ID_MARKER.len()..];
        let after_id = after_id.trim_start_matches(is_ecma_trim_whitespace);
        let id_rest = after_id;
        let id_end = id_rest.find(char::is_whitespace).unwrap_or(id_rest.len());
        task_id = id_rest[..id_end].trim().to_string();
    }

    let mut task_body = String::new();
    if let Some(task_marker_index) = find_orca_dispatch_task_marker_index(scan) {
        let body = &scan[task_marker_index + ORCA_DISPATCH_STATUS_TASK_MARKER.len()..];
        for line in body.split(|c| c == '\n').map(|l| l.strip_suffix('\r').unwrap_or(l)) {
            // JS split(/\r?\n/)
            let preview = line.trim().split_whitespace().collect::<Vec<_>>().join(" ");
            if preview.starts_with("</pasted_content") {
                break;
            }
            if !preview.is_empty() {
                task_body = preview;
                break;
            }
        }
    }

    // Retain preamble identity, task-label id and fallback body inside the 200-character status field.
    let mut compact = ORCA_DISPATCH_STATUS_PREAMBLE_PREFIX.to_string();
    if !task_id.is_empty() {
        compact += &format!(" {ORCA_DISPATCH_STATUS_TASK_ID_MARKER} {task_id}");
    }
    if !task_body.is_empty() {
        compact += &format!(" {ORCA_DISPATCH_STATUS_TASK_MARKER} {task_body}");
    }
    Some(normalize_single_line(&compact, max_length))
}

/// Require standalone === TASK === in multiline preambles because repository-controlled commit subjects may quote it.
/// Normalized single-line previews retain inline markers for idempotent cross-hop/UI reads.
pub fn find_orca_dispatch_task_marker_index(value: &str) -> Option<usize> {
    let mut search_from = 0usize;
    let bytes = value.as_bytes();
    while search_from < value.len() {
        let Some(rel) = value[search_from..].find(ORCA_DISPATCH_STATUS_TASK_MARKER) else { break };
        let marker_index = search_from + rel;
        let marker_end = marker_index + ORCA_DISPATCH_STATUS_TASK_MARKER.len();
        let starts_line = marker_index == 0 || is_line_break_byte(bytes[marker_index - 1]);
        let ends_line = marker_end == value.len() || is_line_break_byte(bytes[marker_end]);
        if starts_line && ends_line {
            return Some(marker_index);
        }
        search_from = marker_end;
    }
    // Already-normalized dispatch previews are single-line and intentionally
    // carry the marker inline; normalization must stay idempotent across hops.
    if value.contains('\n') || value.contains('\r') {
        None
    } else {
        value.find(ORCA_DISPATCH_STATUS_TASK_MARKER)
    }
}

/// Offset into the original task input; detection is bounded, the authored suffix is not.
pub fn orca_dispatch_task_body_offset(value: &str) -> Option<usize> {
    let start = find_orca_dispatch_preamble_start(value)?;
    let scan_end = char_boundary(value, value.len().min(ORCA_DISPATCH_STATUS_SOURCE_SCAN_LIMIT));
    let scan = &value[start..scan_end];
    let marker = find_orca_dispatch_task_marker_index(scan)?;
    let mut offset = start + marker + ORCA_DISPATCH_STATUS_TASK_MARKER.len();
    let bytes = value.as_bytes();
    // A marker at the scan bound must still end its original delimiter line.
    if offset < value.len() && !is_line_break_byte(bytes[offset]) && (scan.contains('\n') || scan.contains('\r')) {
        return None;
    }
    if bytes.get(offset) == Some(&13) {
        offset += 1;
    }
    if bytes.get(offset) == Some(&10) {
        offset += 1;
    }
    Some(offset)
}

fn is_line_break_byte(code: u8) -> bool {
    code == 10 || code == 13
}

fn is_ecma_trim_whitespace(c: char) -> bool {
    matches!(c,
        ' ' | '\t' | '\n' | '\u{b}' | '\u{c}' | '\r'
        | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}'
        | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

fn char_boundary(s: &str, mut i: usize) -> usize { while i > 0 && !s.is_char_boundary(i) { i -= 1; } i }

