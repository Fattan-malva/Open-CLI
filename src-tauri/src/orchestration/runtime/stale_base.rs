//! Port of coordinator/dispatch/coordinator-stale-base-flag.ts.
//! The strict flag is stripped from prompts; it also matches fenced code, where the drift warning remains the safeguard.

use regex::Regex;

/// Allow ordinary monorepo churn while rejecting the observed 168-commit stale base.
pub const DISPATCH_STALE_THRESHOLD: u32 = 20;

pub struct AllowStaleBase {
    pub allow_stale: bool,
    pub stripped_spec: String,
}

pub fn parse_allow_stale_base_from_spec(spec: &str) -> AllowStaleBase {
    let re = Regex::new(r"(?im)^[ \t]*allow-stale-base:[ \t]*true[ \t]*\r?$").unwrap();
    let strip = Regex::new(r"(?im)^[ \t]*allow-stale-base:[ \t]*true[ \t]*\r?\n?").unwrap();
    if !re.is_match(spec) {
        return AllowStaleBase { allow_stale: false, stripped_spec: spec.to_string() };
    }
    AllowStaleBase { allow_stale: true, stripped_spec: strip.replace(spec, "").to_string() }
}
