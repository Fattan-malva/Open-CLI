//! Port of orchestration-timing-budgets.ts.
pub const AGENT_PROMPT_EFFECT_TIMEOUT_MS: u64 = 30_000;
pub const CONTRACT_PREFLIGHT_TIMEOUT_MS: u64 = 5_000;
pub const MAIL_RECONCILIATION_TIMEOUT_MS: u64 = 5_000;
pub const READINESS_TIMEOUT_MS: u64 = 60_000;
pub const FEDERATION_ATTACH_GRACE_MS: u64 = AGENT_PROMPT_EFFECT_TIMEOUT_MS + 10_000;
pub const WORKER_START_CLIENT_GRACE_MS: u64 = AGENT_PROMPT_EFFECT_TIMEOUT_MS + 20_000;
/// Node's setTimeout ceiling; the TypeScript check compares against it.
pub const MAX_TIMER_DELAY_MS: u64 = 2_147_483_647;

pub fn resolve_worker_start_readiness_timeout_ms(timeout_ms: Option<f64>) -> u64 {
    match timeout_ms {
        Some(ms) if ms.is_finite() && ms > 0.0 => ms as u64,
        _ => READINESS_TIMEOUT_MS,
    }
}

pub fn resolve_federation_attach_timeout_ms(readiness_timeout_ms: u64) -> u64 {
    readiness_timeout_ms + FEDERATION_ATTACH_GRACE_MS
}

pub fn resolve_worker_start_client_timeout_ms(readiness_timeout_ms: u64) -> u64 {
    readiness_timeout_ms + WORKER_START_CLIENT_GRACE_MS
}

pub fn is_worker_start_timeout_within_timer_limit(timeout_ms: Option<f64>) -> bool {
    let readiness = resolve_worker_start_readiness_timeout_ms(timeout_ms);
    resolve_worker_start_client_timeout_ms(readiness) <= MAX_TIMER_DELAY_MS
}

/// The attach deadline is the smaller of the attach budget and the time left on the outer deadline, at least 1 ms.
pub fn resolve_federation_attach_deadline_ms(readiness_timeout_ms: u64, outer_deadline_ms: i64, now_ms: i64) -> i64 {
    let budget = resolve_federation_attach_timeout_ms(readiness_timeout_ms) as i64;
    1.max(budget.min(outer_deadline_ms - now_ms))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn worker_start_defaults_when_missing_or_invalid() {
        assert_eq!(resolve_worker_start_readiness_timeout_ms(None), READINESS_TIMEOUT_MS);
        assert_eq!(resolve_worker_start_readiness_timeout_ms(Some(-1.0)), READINESS_TIMEOUT_MS);
        assert_eq!(resolve_worker_start_readiness_timeout_ms(Some(5_000.0)), 5_000);
    }

    #[test]
    fn attach_deadline_never_exceeds_outer_budget_and_is_at_least_one() {
        assert_eq!(resolve_federation_attach_deadline_ms(READINESS_TIMEOUT_MS, 1_000, 0), 1_000);
        assert_eq!(resolve_federation_attach_deadline_ms(READINESS_TIMEOUT_MS, 0, 5_000), 1);
    }

    #[test]
    fn timer_limit_check() {
        assert!(is_worker_start_timeout_within_timer_limit(None));
        assert!(!is_worker_start_timeout_within_timer_limit(Some(2_147_500_000.0)));
    }
}
