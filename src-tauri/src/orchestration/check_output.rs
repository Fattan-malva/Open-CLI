//! Port of orchestration-check-output.ts.

use serde::{Deserialize, Serialize};

use super::control_character_escape::escape_terminal_control_characters;
use super::follow_up::{follow_up_line, FollowUpAction};
use super::rpc_contract::ORCHESTRATION_LEGACY_RUN_ID;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryContract {
    LegacyDirect,
    CurrentDelivery,
    AuditOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrchestrationMessageSummary {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery_contract: Option<DeliveryContract>,
    pub from_handle: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to_handle: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub payload: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub follow_up: Option<serde_json::Value>,
    /// The open item a finished worker was started for, as the host read it for this check.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub for_item: Option<BotItemReportFact>,
}

/// BotItemReportFact (shared/bots/bot-item-report-hint.ts).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotItemReportFact {
    pub number: i64,
    pub title: String,
    pub status: String,
    #[serde(default)]
    pub done_means: Option<String>,
    /// The thread, issue or pull request the item's work started in, where its result is owed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_in: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCompatibilityResult {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub read_only: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ack_message_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer_acknowledgement: Option<AnswerAcknowledgement>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_delivery: Option<CurrentDelivery>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume_required: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resume_command: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerAcknowledgement {
    pub question_id: String,
    pub answer_message_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentDelivery {
    pub run_id: String,
    pub check_command: String,
    pub ack_command: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct OrchestrationCheckOutput {
    pub messages: Vec<OrchestrationMessageSummary>,
    pub count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formatted: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery_id: Option<Option<String>>,
    /// Older runtimes omit it and replay the batch until an explicit --ack.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delivery_acknowledged: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acknowledged: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timed_out: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cancelled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub connection_lost: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_compatibility: Option<LegacyCompatibilityResult>,
}

pub fn format_message_read_only_tag(message: &OrchestrationMessageSummary, legacy_compatibility_active: bool) -> &'static str {
    if is_legacy_read_only_message(message, legacy_compatibility_active) {
        " [legacy, read-only]"
    } else {
        ""
    }
}

pub fn is_legacy_read_only_message(message: &OrchestrationMessageSummary, legacy_compatibility_active: bool) -> bool {
    message.run_id.as_deref() == Some(ORCHESTRATION_LEGACY_RUN_ID)
        || (message.delivery_contract == Some(DeliveryContract::LegacyDirect) && !legacy_compatibility_active)
        || message.delivery_contract == Some(DeliveryContract::AuditOnly)
}

pub fn format_orchestration_check_text(result: &OrchestrationCheckOutput, checked_terminal: &str) -> String {
    let formatted_requested = result.formatted.is_some();
    let prepared = prepare_orchestration_check_output(result.clone(), checked_terminal, formatted_requested);
    let compatibility_active = prepared.legacy_compatibility.as_ref().is_some_and(|c| !c.read_only.unwrap_or(false));
    let legacy_header = match &prepared.legacy_compatibility {
        Some(c) if c.read_only.unwrap_or(false) => "[LEGACY READ-ONLY]\n",
        Some(c) if c.recovery.unwrap_or(false) => "[LEGACY RECOVERY REPLAY — MAY HAVE BEEN SEEN]\n",
        Some(_) => "[LEGACY COMPATIBILITY]\n",
        None => "",
    };
    let delivery_notice = format_current_delivery_notice(prepared.legacy_compatibility.as_ref().and_then(|c| c.current_delivery.as_ref()))
        + &if prepared.delivery_acknowledged != Some(true) {
            format_unacknowledged_delivery_notice(prepared.delivery_id.as_ref().and_then(|d| d.as_deref()))
        } else {
            String::new()
        };
    if let Some(formatted) = &prepared.formatted {
        let delivery = prepared.delivery_id.as_ref().and_then(|d| d.as_deref()).map(|d| format!("Delivery {d}\n")).unwrap_or_default();
        return format!("{legacy_header}{delivery}{formatted}{delivery_notice}");
    }
    if prepared.count == 0 {
        if prepared.timed_out.unwrap_or(false) {
            return format!("{legacy_header}Wait timed out; no messages were consumed.{delivery_notice}");
        }
        if prepared.cancelled.unwrap_or(false) {
            let cancelled = if prepared.connection_lost.unwrap_or(false) {
                "Wait cancelled because the connection closed; no messages were consumed."
            } else {
                "Wait cancelled; no messages were consumed."
            };
            return format!("{legacy_header}{cancelled}{delivery_notice}");
        }
        let empty = match prepared.acknowledged.as_ref().and_then(|a| a.as_deref()) {
            Some(a) if !a.is_empty() => format!("Acknowledged {a}."),
            _ => "No messages.".into(),
        };
        return format!("{legacy_header}{empty}{delivery_notice}");
    }
    // Current hosts acknowledge the batch on read, so plain text must carry every body and payload.
    let rendered = format_legacy_aware_check_messages(&prepared.messages, checked_terminal, compatibility_active);
    let output = match prepared.delivery_id.as_ref().and_then(|d| d.as_deref()) {
        Some(d) => format!("Delivery {d}\n{rendered}"),
        None => rendered,
    };
    format!("{legacy_header}{output}{delivery_notice}")
}

pub fn format_unacknowledged_delivery_notice(delivery_id: Option<&str>) -> String {
    match delivery_id {
        Some(id) if !id.is_empty() => format!(
            "\nThis Orca version does not acknowledge batches automatically. After handling every message, rerun this check with --ack {id}."
        ),
        _ => String::new(),
    }
}

pub fn prepare_orchestration_check_output(mut result: OrchestrationCheckOutput, checked_terminal: &str, formatted_requested: bool) -> OrchestrationCheckOutput {
    let compatibility_active = result.legacy_compatibility.as_ref().is_some_and(|c| !c.read_only.unwrap_or(false));
    if !formatted_requested || !result.messages.iter().any(|m| is_legacy_read_only_message(m, compatibility_active)) {
        return result;
    }
    result.formatted = Some(format_legacy_aware_check_messages(&result.messages, checked_terminal, compatibility_active));
    result
}

fn format_message_priority_tag(message: &OrchestrationMessageSummary) -> &'static str {
    match message.priority.as_deref() {
        Some("urgent") => " [URGENT]",
        Some("high") => " [HIGH]",
        _ => "",
    }
}

fn format_quoted_message_field(label: &str, value: Option<&str>) -> String {
    let escaped = escape_terminal_control_characters(value.unwrap_or(""), false);
    let indented = escaped.split('\n').map(|line| format!("  {line}")).collect::<Vec<_>>().join("\n");
    format!("[{label}]\n{indented}")
}

fn format_legacy_aware_check_messages(messages: &[OrchestrationMessageSummary], checked_terminal: &str, legacy_compatibility_active: bool) -> String {
    messages
        .iter()
        .map(|message| {
            let legacy_read_only = is_legacy_read_only_message(message, legacy_compatibility_active);
            let mut lines = vec![
                format!(
                    "{}{}{} [{}] from={}",
                    message.id,
                    format_message_read_only_tag(message, legacy_compatibility_active),
                    format_message_priority_tag(message),
                    message.kind.as_deref().unwrap_or("status"),
                    message.from_handle
                ),
                format_quoted_message_field("subject", message.subject.as_deref()),
            ];
            if legacy_read_only {
                lines.push("[Inspection only: reply and acknowledgment are unavailable.]".into());
            }
            if let Some(body) = &message.body {
                if !body.is_empty() {
                    lines.push(format_quoted_message_field("body", Some(body)));
                }
            }
            if let Some(Some(payload)) = &message.payload {
                if !payload.is_empty() {
                    lines.push(format_quoted_message_field("payload", Some(payload)));
                }
            }
            if !legacy_read_only {
                if let Some(follow_up_value) = &message.follow_up {
                    if let Ok(action) = serde_json::from_value::<FollowUpActionWire>(follow_up_value.clone()) {
                        lines.push(format!("[{}]", follow_up_line(&action.into_action(), "orca")));
                    }
                } else {
                    let reply_target = message.to_handle.as_deref().unwrap_or(checked_terminal);
                    let reply_from = if reply_target.starts_with("run:") || reply_target.starts_with("dispatch:") { String::new() } else { format!(" --from {reply_target}") };
                    lines.push(format!("[Reply: orca orchestration reply --id {}{} --body \"...\"]", message.id, reply_from));
                }
                if let Some(item) = &message.for_item {
                    lines.push(format!("[{}]", escape_terminal_control_characters(&format_bot_item_report_hint(item, "orca"), false)));
                }
            }
            lines.join("\n")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn format_current_delivery_notice(delivery: Option<&CurrentDelivery>) -> String {
    match delivery {
        None => String::new(),
        Some(d) => format!("\n[CURRENT RUN MAIL WAITING]\nRead: {}\nThen acknowledge the delivery ID it prints: {}", d.check_command, d.ack_command),
    }
}

/// Minimal wire form of FollowUpAction for `follow_up` payloads.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FollowUpActionWire {
    Send { dispatch_id: String, active: bool },
    WorkerStartOn { server: String },
    WorkerStart,
    MailSender { to: String, chat: Option<String> },
    Information,
}

impl FollowUpActionWire {
    pub fn into_action(self) -> FollowUpAction {
        match self {
            FollowUpActionWire::Send { dispatch_id, active } => FollowUpAction::Send { dispatch_id, active },
            FollowUpActionWire::WorkerStartOn { server } => FollowUpAction::WorkerStartOn { server },
            FollowUpActionWire::WorkerStart => FollowUpAction::WorkerStart,
            FollowUpActionWire::MailSender { to, chat } => FollowUpAction::MailSender { to, chat },
            FollowUpActionWire::Information => FollowUpAction::Information,
        }
    }
}

// --- bot-item-report-hint.ts (without the Slack-post extension) ---

fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn bot_item_status_name(status: &str) -> &str {
    match status {
        "planned" => "Planned",
        "working" => "In progress",
        "waiting" => "Waiting",
        "needs_you" => "Needs you",
        "done" => "Done",
        "canceled" => "Canceled",
        _ => status,
    }
}

pub fn format_bot_item_report_hint(item: &BotItemReportFact, cli: &str) -> String {
    let done_means = item.done_means.as_deref().map(one_line).unwrap_or_default();
    let status = bot_item_status_name(&item.status);
    let mut parts = vec![format!("This worker was started for item {}, \"{}\" ({}).", item.number, one_line(&item.title), status)];
    if !done_means.is_empty() {
        let punctuated = if done_means.ends_with(['.', '!', '?']) { done_means.clone() } else { format!("{done_means}.") };
        parts.push(format!("Done means: {punctuated}"));
    }
    parts.push(format!("If this result changes the item, update it with {cli} bot item <cancel|comment|done|set> {}.", item.number));
    if let Some(started_in) = &item.started_in {
        if !started_in.is_empty() {
            parts.push(format!("Its work started in {started_in}: post what this result settles there."));
        }
    }
    parts.join(" ")
}
