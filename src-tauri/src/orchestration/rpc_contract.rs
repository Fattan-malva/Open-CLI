//! Port of orchestration-rpc-contract.ts.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::runtime_capabilities::ORCHESTRATION_CONTRACT_VERSION;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrchestrationMigrationReason {
    ClientContractMissing,
    ClientContractUnsupported,
    RuntimeCapabilityMissing,
    CommandRetired,
}

pub const ORCHESTRATION_SKILL_COMMAND_ARGS: [&str; 4] = ["skills", "get", "orchestration", "--full"];

pub const ORCHESTRATION_LEGACY_RUN_ID: &str = "run_legacy_local";
/// Files mail sent from a terminal in no Run. Distinct from the legacy Run on purpose: rows under
/// the legacy id read as a pre-Runs database and trigger adoption on the next open.
pub const ORCHESTRATION_UNBOUND_RUN_ID: &str = "run_unbound";

pub const ORCHESTRATION_MUTATION_METHODS: &[&str] = &[
    "orchestration.runCreate",
    "orchestration.runUse",
    "orchestration.send",
    "orchestration.reply",
    "orchestration.taskCreate",
    "orchestration.taskUpdate",
    "orchestration.dispatch",
    "orchestration.workerStart",
    "orchestration.workerStop",
    "orchestration.workerDockStop",
    "orchestration.workerDockAcknowledge",
    "orchestration.workerAbandon",
    "orchestration.workerRelease",
    "orchestration.workerRetain",
    "orchestration.approvalAnswer",
    "orchestration.ask",
    "orchestration.gateCreate",
    "orchestration.gateResolve",
    "orchestration.reset",
    "orchestration.federationAttachStart",
    "orchestration.federationAck",
    "orchestration.federationImport",
    "orchestration.federationStop",
    "orchestration.federationRelease",
    "orchestration.federationRetain",
    "orchestration.peerRunCancel",
];

pub const RETIRED_ORCHESTRATION_METHODS: &[&str] = &["orchestration.run", "orchestration.runStop"];

pub fn is_retired_orchestration_method(method: &str) -> bool {
    RETIRED_ORCHESTRATION_METHODS.contains(&method)
}

pub fn is_orchestration_mutation(method: &str, params: Option<&Value>) -> bool {
    if is_retired_orchestration_method(method) {
        return true;
    }
    if method == "orchestration.check" {
        if has_string_property(params, "ack") {
            return true;
        }
        return !is_explicit_read_only_check(params);
    }
    if method == "orchestration.dispatch" {
        return !has_true_property(params, "dryRun");
    }
    ORCHESTRATION_MUTATION_METHODS.contains(&method)
}

pub fn is_terminal_prompt_mutation(method: &str, params: Option<&Value>) -> bool {
    if method != "terminal.send" {
        return false;
    }
    let Some(Value::Object(value)) = params else { return false };
    let client_type = value.get("client").and_then(|c| c.get("type")).and_then(|t| t.as_str());
    value.get("agentPrompt") == Some(&Value::Bool(true))
        && value.get("text").and_then(|t| t.as_str()).is_some_and(|t| !t.is_empty())
        && value.get("enter") == Some(&Value::Bool(true))
        && value.get("interrupt") != Some(&Value::Bool(true))
        && client_type == Some("desktop")
}

pub fn is_durable_mutation(method: &str, params: Option<&Value>) -> bool {
    is_orchestration_mutation(method, params) || is_terminal_prompt_mutation(method, params)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationSkillRecoveryData {
    pub effects_applied: bool, // always false
    pub guide: SkillGuide,
    pub next_command_args: Vec<String>,
    pub next_steps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SkillGuide {
    pub topic: String, // "orchestration"
    pub full: bool,    // true
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationMigrationData {
    pub reason: OrchestrationMigrationReason,
    pub required_contract_version: u32,
    #[serde(flatten)]
    pub recovery: OrchestrationSkillRecoveryData,
}

pub fn orchestration_skill_recovery_data() -> OrchestrationSkillRecoveryData {
    OrchestrationSkillRecoveryData {
        effects_applied: false,
        guide: SkillGuide { topic: "orchestration".into(), full: true },
        next_command_args: ORCHESTRATION_SKILL_COMMAND_ARGS.iter().map(|s| s.to_string()).collect(),
        next_steps: vec![
            "Using this same Orca CLI executable, run: skills get orchestration --full".into(),
            "Read the returned guide completely and do not retry the previous command unchanged.".into(),
        ],
    }
}

pub fn orchestration_migration_data(reason: OrchestrationMigrationReason) -> OrchestrationMigrationData {
    OrchestrationMigrationData {
        reason,
        required_contract_version: ORCHESTRATION_CONTRACT_VERSION,
        recovery: orchestration_skill_recovery_data(),
    }
}

fn is_explicit_read_only_check(params: Option<&Value>) -> bool {
    has_true_property(params, "peek") || has_true_property(params, "all") || has_false_property(params, "unread")
}

fn has_string_property(value: Option<&Value>, property: &str) -> bool {
    value.and_then(|v| v.get(property)).is_some_and(|v| v.is_string())
}

fn has_true_property(value: Option<&Value>, property: &str) -> bool {
    value.and_then(|v| v.get(property)) == Some(&Value::Bool(true))
}

fn has_false_property(value: Option<&Value>, property: &str) -> bool {
    value.and_then(|v| v.get(property)) == Some(&Value::Bool(false))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn mutation_classification() {
        assert!(is_orchestration_mutation("orchestration.run", None));
        assert!(is_orchestration_mutation("orchestration.send", None));
        assert!(!is_orchestration_mutation("orchestration.runShow", None));
        assert!(!is_orchestration_mutation("orchestration.dispatch", Some(&json!({"dryRun": true}))));
        assert!(is_orchestration_mutation("orchestration.dispatch", Some(&json!({"dryRun": false}))));
        assert!(!is_orchestration_mutation("orchestration.check", Some(&json!({"peek": true}))));
        assert!(!is_orchestration_mutation("orchestration.check", Some(&json!({"all": true}))));
        assert!(!is_orchestration_mutation("orchestration.check", Some(&json!({"unread": false}))));
        assert!(is_orchestration_mutation("orchestration.check", Some(&json!({}))));
        assert!(is_orchestration_mutation("orchestration.check", Some(&json!({"ack": "x"}))));
    }

    #[test]
    fn terminal_prompt_mutation() {
        let p = json!({"agentPrompt": true, "text": "hi", "enter": true, "client": {"type": "desktop"}});
        assert!(is_terminal_prompt_mutation("terminal.send", Some(&p)));
        assert!(!is_terminal_prompt_mutation("terminal.send", Some(&json!({"agentPrompt": true, "text": "hi", "enter": true, "client": {"type": "cli"}}))));
        assert!(!is_terminal_prompt_mutation("terminal.send", Some(&json!({"agentPrompt": true, "text": "", "enter": true, "client": {"type": "desktop"}}))));
        assert!(!is_terminal_prompt_mutation("terminal.send", Some(&json!({"agentPrompt": true, "text": "hi", "enter": true, "interrupt": true, "client": {"type": "desktop"}}))));
    }

    #[test]
    fn migration_data_shape() {
        let d = orchestration_migration_data(OrchestrationMigrationReason::ClientContractMissing);
        let v = serde_json::to_value(&d).unwrap();
        assert_eq!(v["reason"], json!("client_contract_missing"));
        assert_eq!(v["requiredContractVersion"], json!(1));
        assert_eq!(v["effectsApplied"], json!(false));
        assert_eq!(v["nextCommandArgs"], json!(["skills", "get", "orchestration", "--full"]));
    }
}
