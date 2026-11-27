//! Port of mailbox/orchestration-report-follow-up.ts: the action lines printed under a finished report.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FollowUpAction {
    /// `active`: the report's task already has a follow-up running, which the send steers.
    Send { dispatch_id: String, active: bool },
    WorkerStartOn { server: String },
    WorkerStart,
    /// New mail to the sender; `chat` names the bot chat that sent it, when `to` is `bot:<name>`.
    MailSender { to: String, chat: Option<String> },
    Information,
}

/// Saved server and bot names are free text; quoting keeps a name with spaces one argument.
fn quote_argument(name: &str) -> String {
    let plain = !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '.' | ':' | '@' | '/' | '-'));
    if plain {
        return name.to_string();
    }
    let escaped: String = name
        .chars()
        .flat_map(|c| {
            if matches!(c, '"' | '\\' | '$' | '`') {
                vec!['\\', c]
            } else {
                vec![c]
            }
        })
        .collect();
    format!("\"{}\"", escaped)
}

/// The command a follow-up action suggests. `Information` has none.
pub fn follow_up_command(action: &FollowUpAction, cli: &str) -> Option<String> {
    Some(match action {
        FollowUpAction::Send { dispatch_id, .. } => format!(
            "{cli} orchestration send --to dispatch:{dispatch_id} --subject \"...\" --body \"...\""
        ),
        FollowUpAction::WorkerStartOn { server } => format!(
            "{cli} orchestration worker-start --on {} --spec \"...\"",
            quote_argument(server)
        ),
        FollowUpAction::WorkerStart => format!("{cli} orchestration worker-start --spec \"...\""),
        FollowUpAction::MailSender { to, chat } => match chat {
            // Mail to a bot's chat is a request, so it names one of the request types.
            Some(chat) => format!(
                "{cli} orchestration send --to {} --chat {chat} --type question --subject \"...\" --body \"...\"",
                quote_argument(to)
            ),
            None => format!(
                "{cli} orchestration send --to {} --subject \"...\" --body \"...\"",
                quote_argument(to)
            ),
        },
        FollowUpAction::Information => return None,
    })
}

/// The action line every view prints under a finished task's report, and the refusal repeats.
pub fn follow_up_line(action: &FollowUpAction, cli: &str) -> String {
    let Some(command) = follow_up_command(action, cli) else {
        return "For your information: there is nothing to answer".to_string();
    };
    match action {
        FollowUpAction::Send { dispatch_id, active: true } => {
            format!("Its follow-up {dispatch_id} is running; to message it: {command}")
        }
        FollowUpAction::Send { active: false, .. } => {
            format!("To give this worker more work: {command}")
        }
        FollowUpAction::WorkerStartOn { server } => {
            format!("To start more work on {server}: {command}")
        }
        FollowUpAction::WorkerStart => format!("To start a new worker: {command}"),
        FollowUpAction::MailSender { .. } => format!("To answer its sender: {command}"),
        FollowUpAction::Information => unreachable!(),
    }
}

pub fn follow_up_next(action: &FollowUpAction, cli: &str) -> String {
    format!("{}.", follow_up_line(action, cli))
}

pub fn finished_report_reply_refusal(report_dispatch_id: &str, action: &FollowUpAction, cli: &str) -> String {
    format!(
        "The task behind this report (Dispatch {report_dispatch_id}) finished, so a reply would never reach its worker; nothing was sent. {} To just acknowledge the report, do nothing.",
        follow_up_next(action, cli)
    )
}

pub fn not_yours_reply_refusal(action: Option<&FollowUpAction>, cli: &str) -> String {
    match action {
        Some(action) => format!(
            "That message wasn't sent to you, so a reply to it was refused and nothing was sent. {}",
            follow_up_next(action, cli)
        ),
        None => "That message wasn't sent to you, so a reply to it was refused and nothing was sent.".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_names_with_spaces_and_escapes_shell_characters() {
        assert_eq!(quote_argument("bot-1"), "bot-1");
        assert_eq!(quote_argument("my bot"), "\"my bot\"");
        assert_eq!(quote_argument("a\"b$c"), "\"a\\\"b\\$c\"");
    }

    #[test]
    fn send_line_depends_on_active_flag() {
        let active = FollowUpAction::Send { dispatch_id: "d1".into(), active: true };
        assert!(follow_up_line(&active, "orca").starts_with("Its follow-up d1 is running"));
        let idle = FollowUpAction::Send { dispatch_id: "d1".into(), active: false };
        assert!(follow_up_line(&idle, "orca").starts_with("To give this worker more work"));
    }

    #[test]
    fn information_has_no_command() {
        assert!(follow_up_command(&FollowUpAction::Information, "orca").is_none());
        assert_eq!(
            follow_up_line(&FollowUpAction::Information, "orca"),
            "For your information: there is nothing to answer"
        );
    }

    #[test]
    fn mail_to_a_bot_chat_names_the_request_type() {
        let action = FollowUpAction::MailSender { to: "bot:alpha".into(), chat: Some("c1".into()) };
        let command = follow_up_command(&action, "orca").unwrap();
        assert!(command.contains("--type question"));
        assert!(command.contains("--chat c1"));
    }
}
