//! Port of orchestration-compatibility-evidence.ts.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_EVIDENCE_FIELD_LENGTH: usize = 4_096;

pub const ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV: &str = "ORCA_ORCHESTRATION_COMPATIBILITY_HOST_KIND";
pub const ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV: &str = "ORCA_ORCHESTRATION_COMPATIBILITY_HOST_ID";
pub const ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION_ENV: &str = "ORCA_ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION";
pub const ORCHESTRATION_COMPATIBILITY_ATTACHMENT_ENV: &str = "ORCA_ORCHESTRATION_COMPATIBILITY_ATTACHMENT";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", rename_all_fields = "camelCase")]
pub enum OrchestrationCompatibilityHostStamp {
    #[serde(rename = "wsl")]
    Wsl { host_id: String, distro: String },
    #[serde(rename = "ssh")]
    Ssh { target_id: String, connection_incarnation: String, attachment_id: String },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationCompatibilityEvidence {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pane_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub launch_token: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<OrchestrationCompatibilityHostStamp>,
    /// Injected Orca session identity is authoritative when present; dispatch resolves it and validates any declared handle against it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_session_id: Option<String>,
}

fn secret_keys() -> HashSet<&'static str> {
    [
        "launchToken",
        "connectionIncarnation",
        "attachmentId",
        "compatibilityEvidence",
        "orchestrationCompatibilityEvidence",
        "ORCA_AGENT_LAUNCH_TOKEN",
        ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION_ENV,
        ORCHESTRATION_COMPATIBILITY_ATTACHMENT_ENV,
    ]
    .into_iter()
    .collect()
}

fn bounded_value(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if !trimmed.is_empty() && trimmed.encode_utf16().count() <= MAX_EVIDENCE_FIELD_LENGTH {
        Some(trimmed.to_string())
    } else {
        None
    }
}

/// `env` mirrors `Readonly<Record<string, string | undefined>>`.
pub fn read_orchestration_compatibility_evidence(env: &dyn Fn(&str) -> Option<String>) -> Option<OrchestrationCompatibilityEvidence> {
    let terminal_handle = bounded_value(env("ORCA_TERMINAL_HANDLE").as_deref());
    let pane_key = bounded_value(env("ORCA_PANE_KEY").as_deref());
    let launch_token = bounded_value(env("ORCA_AGENT_LAUNCH_TOKEN").as_deref());
    let host = read_host_stamp(env);
    if terminal_handle.is_none() && pane_key.is_none() && launch_token.is_none() && host.is_none() {
        return None;
    }
    Some(OrchestrationCompatibilityEvidence {
        terminal_handle,
        pane_key,
        launch_token,
        host,
        agent_session_id: None,
    })
}

fn read_host_stamp(env: &dyn Fn(&str) -> Option<String>) -> Option<OrchestrationCompatibilityHostStamp> {
    let kind = bounded_value(env(ORCHESTRATION_COMPATIBILITY_HOST_KIND_ENV).as_deref());
    let host_id = bounded_value(env(ORCHESTRATION_COMPATIBILITY_HOST_ID_ENV).as_deref());
    let incarnation = bounded_value(env(ORCHESTRATION_COMPATIBILITY_HOST_INCARNATION_ENV).as_deref());
    let attachment = bounded_value(env(ORCHESTRATION_COMPATIBILITY_ATTACHMENT_ENV).as_deref());
    match kind.as_deref() {
        Some("wsl") if host_id.is_some() && incarnation.is_some() => Some(OrchestrationCompatibilityHostStamp::Wsl {
            host_id: host_id.unwrap(),
            distro: incarnation.unwrap(),
        }),
        Some("ssh") if host_id.is_some() && incarnation.is_some() && attachment.is_some() => {
            Some(OrchestrationCompatibilityHostStamp::Ssh {
                target_id: host_id.unwrap(),
                connection_incarnation: incarnation.unwrap(),
                attachment_id: attachment.unwrap(),
            })
        }
        _ => None,
    }
}

pub fn redact_orchestration_compatibility_secrets(value: &Value) -> Value {
    let keys = secret_keys();
    redact_value(value, &keys, &mut Vec::new())
}

fn redact_value(value: &Value, keys: &HashSet<&'static str>, seen: &mut Vec<usize>) -> Value {
    match value {
        Value::Array(items) => {
            // JSON has no cycles; the TS WeakSet guards against them.
            Value::Array(items.iter().map(|v| redact_value(v, keys, seen)).collect())
        }
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| {
                    let redacted = if keys.contains(k.as_str()) { Value::String("[redacted]".into()) } else { redact_value(v, keys, seen) };
                    (k.clone(), redacted)
                })
                .collect(),
        ),
        other => other.clone(),
    }
}
