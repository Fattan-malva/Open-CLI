//! Port of mailbox/paired-sender-name.ts.

use serde::{Deserialize, Serialize};

use super::conversation_name::agent_message_sender_name;

/// Who sent mail from a computer paired with this one, either side of the pairing. `computer` is
/// this computer's name for a server it pulls from, or a client's Orca's name for itself; '' when
/// none was named. `botName` is the sender's bot as its own Orca named it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedSender {
    pub computer: String,
    pub bot_name: Option<String>,
}

/// A saved bot request's paired sender, from any shape Orca has written: `fromPairedComputer`, or
/// the older `fromPairedServer` (a server's agent, never named by bot) and `fromComputer` (null when
/// unnamed). An empty or null computer is still paired, just unnamed; null when not paired.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedPairedSenderRecord {
    pub from_bot_name: Option<String>,
    pub from_paired_computer: Option<String>,
    pub from_paired_server: Option<String>,
    /// `null` = present-but-unnamed; absent = not paired. Tracked separately below.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub from_computer: Option<Option<String>>,
}

pub fn saved_paired_sender(record: &SavedPairedSenderRecord) -> Option<PairedSender> {
    if let Some(computer) = &record.from_paired_computer {
        return Some(PairedSender { computer: computer.clone(), bot_name: record.from_bot_name.clone() });
    }
    if let Some(computer) = &record.from_paired_server {
        return Some(PairedSender { computer: computer.clone(), bot_name: None });
    }
    if let Some(from_computer) = &record.from_computer {
        return Some(PairedSender { computer: from_computer.clone().unwrap_or_default(), bot_name: record.from_bot_name.clone() });
    }
    None
}

/// That computer's bot by name on it, or an agent there. Never "your owner's": a paired computer
/// may be someone else's.
pub fn paired_sender_name(sender: &PairedSender) -> String {
    let computer = if sender.computer.is_empty() { "another computer" } else { sender.computer.as_str() };
    match &sender.bot_name {
        Some(bot) if !bot.is_empty() => format!("{bot} on {computer}"),
        _ => format!("an agent on {computer}"),
    }
}

/// The computer a paired Orca's mail label names. Every Orca labels its mail `<address> on <computer>`,
/// and an address has no spaces, so an Orca from before it sent a sender still says where it is from.
pub fn paired_label_computer(label: &str) -> Option<String> {
    let at = label.find(" on ")?;
    if at == 0 || label[..at].contains(' ') {
        return None;
    }
    agent_message_sender_name(&label[at + " on ".len()..])
}
