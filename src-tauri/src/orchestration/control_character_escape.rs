//! Port of terminal/output/terminal-control-character-escape.ts.

/// Escape C0/C1 controls as `\xNN`; `\n` passes through unless `escape_line_breaks`.
pub fn escape_terminal_control_characters(value: &str, escape_line_breaks: bool) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        let code = ch as u32;
        if (!escape_line_breaks && ch == '\n') || (0x20..0x7f).contains(&code) || code > 0x9f {
            out.push(ch);
        } else {
            out.push_str(&format!("\\x{code:02x}"));
        }
    }
    out
}
