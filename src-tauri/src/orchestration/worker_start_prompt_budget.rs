//! Port of workers/orchestration-worker-start-prompt-budget.ts
//! plus shared terminal-input limits (terminal/input/terminal-input.ts)
//! and agent-prompt-injection's getMaxTerminalPasteBytesForIngestMs.

use super::timing::{AGENT_PROMPT_EFFECT_TIMEOUT_MS, WORKER_START_CLIENT_GRACE_MS};

pub const TERMINAL_INPUT_CHUNK_MAX_BYTES: usize = 16 * 1024;
pub const TERMINAL_INPUT_MAX_BYTES: usize = 16 * 1024 * 1024;
pub const TERMINAL_INPUT_TOO_LARGE_ERROR: &str = "Terminal input is too large for a safe terminal send.";

// Win11 bundled ConPTY ingest, 16KiB chunks. (agent-launch/startup/agent-prompt-injection.ts)
const WINDOWS_CONPTY_INGEST_BYTES_PER_MS: u64 = 64;
const DEFAULT_PASTE_INGEST_BYTES_PER_MS: u64 = 4_096;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Platform {
    Win32,
    MacOs,
    Linux,
    Other,
}

/// Ingest floor uses the PTY transport host platform, not the child command's OS.
pub fn get_terminal_paste_ingest_ms(platform: Platform, byte_length: u64) -> u64 {
    if byte_length == 0 {
        return 0;
    }
    let per_ms = match platform {
        Platform::Win32 => WINDOWS_CONPTY_INGEST_BYTES_PER_MS,
        _ => DEFAULT_PASTE_INGEST_BYTES_PER_MS,
    };
    byte_length.div_ceil(per_ms)
}

/// Largest paste whose host-ingest floor fits in `budget_ms`.
pub const fn get_max_terminal_paste_bytes_for_ingest_ms(platform: Platform, budget_ms: u64) -> u64 {
    if budget_ms == 0 {
        return 0;
    }
    let per_ms = match platform {
        Platform::Win32 => WINDOWS_CONPTY_INGEST_BYTES_PER_MS,
        _ => DEFAULT_PASTE_INGEST_BYTES_PER_MS,
    };
    budget_ms * per_ms
}

const WORKER_START_PROMPT_INGEST_BUDGET_MS: u64 = WORKER_START_CLIENT_GRACE_MS - AGENT_PROMPT_EFFECT_TIMEOUT_MS;
const WORKER_START_PREAMBLE_RESERVED_BYTES: usize = TERMINAL_INPUT_CHUNK_MAX_BYTES * 4;

/// Keeps worst-case Windows ingest plus effect settlement inside worker-start's fixed RPC grace.
pub const ORCHESTRATION_WORKER_START_PROMPT_MAX_BYTES: usize = {
    let paste = get_max_terminal_paste_bytes_for_ingest_ms(Platform::Win32, WORKER_START_PROMPT_INGEST_BUDGET_MS) as usize;
    if paste < TERMINAL_INPUT_MAX_BYTES {
        paste
    } else {
        TERMINAL_INPUT_MAX_BYTES
    }
};

/// Task body limit; the remaining prompt budget is reserved for Orca's fixed dispatch preamble.
pub const ORCHESTRATION_WORKER_START_TASK_SPEC_MAX_BYTES: usize = ORCHESTRATION_WORKER_START_PROMPT_MAX_BYTES - WORKER_START_PREAMBLE_RESERVED_BYTES;

/// UTF-8 byte length, matching `measureUtf8ByteLength` / `Buffer.byteLength(text, 'utf8')`.
pub fn utf8_byte_len(text: &str) -> usize {
    text.len()
}

pub fn is_terminal_input_too_large(text: &str, max_bytes: usize) -> bool {
    super::conversation_name::utf16_len(text) > max_bytes || text.len() > max_bytes
}

pub fn is_worker_start_task_spec_too_large(spec: &str) -> bool {
    is_terminal_input_too_large(spec, ORCHESTRATION_WORKER_START_TASK_SPEC_MAX_BYTES)
}

/// Splits `text` into UTF-8-safe chunks of at most `max_chunk_bytes`.
pub fn iterate_terminal_input_chunks(text: &str, max_chunk_bytes: usize) -> Vec<String> {
    let max = max_chunk_bytes.max(1);
    if text.is_empty() {
        return Vec::new();
    }
    if text.len() <= max {
        return vec![text.to_string()];
    }
    let mut chunks = Vec::new();
    let mut start = 0usize;
    while start < text.len() {
        let mut end = (start + max).min(text.len());
        while end > start && !text.is_char_boundary(end) {
            end -= 1;
        }
        chunks.push(text[start..end].to_string());
        start = end;
    }
    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn budget_numbers_match_typescript() {
        assert_eq!(TERMINAL_INPUT_CHUNK_MAX_BYTES, 16 * 1024);
        assert_eq!(ORCHESTRATION_WORKER_START_PROMPT_MAX_BYTES, 1_280_000);
        assert_eq!(ORCHESTRATION_WORKER_START_TASK_SPEC_MAX_BYTES, 1_214_464);
    }

    #[test]
    fn ingest_math() {
        assert_eq!(get_max_terminal_paste_bytes_for_ingest_ms(Platform::Win32, 20_000), 1_280_000);
        assert_eq!(get_max_terminal_paste_bytes_for_ingest_ms(Platform::Win32, 0), 0);
        assert_eq!(get_terminal_paste_ingest_ms(Platform::Win32, 128), 2);
        assert_eq!(get_terminal_paste_ingest_ms(Platform::MacOs, 4096), 1);
    }

    #[test]
    fn chunks_respect_utf8_boundaries() {
        let text = "é".repeat(10); // 2 bytes each
        let chunks = iterate_terminal_input_chunks(&text, 5);
        assert!(chunks.iter().all(|c| c.len() <= 5));
        assert_eq!(chunks.concat(), text);
    }
}
