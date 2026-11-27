//! Port of orchestration-runtime-capabilities.ts.

pub const ORCHESTRATION_FEDERATION_RUNTIME_CAPABILITY: &str = "orchestration.federation.v1";
pub const ORCHESTRATION_FEDERATION_CONTROL_MAIL_RUNTIME_CAPABILITY: &str = "orchestration.federation-control-mail.v1";
pub const ORCHESTRATION_FEDERATION_LIFECYCLE_SETTLEMENT_RUNTIME_CAPABILITY: &str = "orchestration.federation-lifecycle-settlement.v1";
pub const ORCHESTRATION_WORKER_STOP_VERDICT_RUNTIME_CAPABILITY: &str = "orchestration.worker-stop-verdict.v1";
/// worker-stop on this host also stops the helpers the worker started here.
pub const ORCHESTRATION_WORKER_STOP_HELPERS_RUNTIME_CAPABILITY: &str = "orchestration.worker-stop-helpers.v1";
pub const ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY: &str = "orchestration.worker-launch-preferences.v1";
pub const ORCHESTRATION_FEDERATION_STRUCTURED_READ_RUNTIME_CAPABILITY: &str = "orchestration.federation-structured-read.v1";
pub const ORCHESTRATION_FEDERATION_FLEET_SNAPSHOT_RUNTIME_CAPABILITY: &str = "orchestration.federation-fleet-snapshot.v1";
pub const ORCHESTRATION_FEDERATION_RELEASE_ARCHIVE_RUNTIME_CAPABILITY: &str = "orchestration.federation-release-archive.v1";
/// Settled workers release after a grace period; retain and reuse forward to the execution host.
pub const ORCHESTRATION_WORKER_AUTO_RELEASE_RUNTIME_CAPABILITY: &str = "orchestration.worker-auto-release.v1";
/// Finished workers close when a host countdown runs out; clients show it and offer Keep open (workerAutoClose, workerKeepOpen).
pub const ORCHESTRATION_WORKER_KEEP_OPEN_RUNTIME_CAPABILITY: &str = "orchestration.worker-keep-open.v1";
/// worker-start creates and binds a Run when its coordinator has none.
pub const ORCHESTRATION_WORKER_START_IMPLICIT_RUN_RUNTIME_CAPABILITY: &str = "orchestration.worker-start-implicit-run.v1";
/// A coordinator stays bound to every Run it created or used, not only the latest.
pub const ORCHESTRATION_RETAINED_RUN_BINDINGS_RUNTIME_CAPABILITY: &str = "orchestration.retained-run-bindings.v1";
/// The host reports a worker whose turn ends without worker_done or that sits at a prompt.
pub const ORCHESTRATION_WORKER_TURN_STOP_REPORTS_RUNTIME_CAPABILITY: &str = "orchestration.worker-turn-stop-reports.v1";
/// ask can record a question and return at once; its answer arrives as Dispatch mail.
pub const ORCHESTRATION_ASK_RETURNS_AT_ONCE_RUNTIME_CAPABILITY: &str = "orchestration.ask-returns-at-once.v1";
/// Paired windows and phones read a chat's worker approvals and answer them as the person.
pub const ORCHESTRATION_PAIRED_WORKER_APPROVALS_RUNTIME_CAPABILITY: &str = "orchestration.paired-worker-approvals.v1";
/// A person on a paired window may Clear and Stop a chat's workers in its dock, as on this computer.
pub const ORCHESTRATION_PAIRED_WORKER_DOCK_OWNER_RUNTIME_CAPABILITY: &str = "orchestration.paired-worker-dock-owner.v1";
/// Sent by a paired window or phone, never by the orca CLI: its approvals are the person's.
pub const ORCHESTRATION_PERSON_APPROVALS_CLIENT_CAPABILITY: &str = "orchestration.person-approvals.v1";
pub const ORCHESTRATION_FEDERATION_CONTROL_MAIL_PROTOCOL_VERSION: u32 = 2;
pub const ORCHESTRATION_FEDERATION_LIFECYCLE_SETTLEMENT_PROTOCOL_VERSION: u32 = 3;
pub const ORCHESTRATION_CONTRACT_VERSION: u32 = 1;
/// Contract 1 admitted only as a replay or join of an existing receipt, for a worker_done retry after
/// a timeout that may have been delivered. Reserved: a future contract must not reuse this number.
pub const ORCHESTRATION_REPLAY_ONLY_CONTRACT_VERSION: u32 = 2;
/// This runtime enforces the replay-only contract. Releases without the contract fence ignore the
/// version and would run the retry anew, so a client sends one only to a runtime that advertises this.
pub const ORCHESTRATION_REPLAY_ONLY_RETRY_RUNTIME_CAPABILITY: &str = "orchestration.replay-only-retry.v1";
pub const ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY: &str = "orchestration.contract.v1";
/// Receives agent mail a paired Orca carries for its agents, and queues replies for it to pull.
pub const ORCHESTRATION_PEER_MAIL_RUNTIME_CAPABILITY: &str = "orchestration.peer-mail.v1";
/// Peer mail also carries ordinary questions, dispatch instructions and merge-ready messages.
pub const ORCHESTRATION_PEER_MAIL_TYPES_RUNTIME_CAPABILITY: &str = "orchestration.peer-mail-types.v1";
/// Peer mail also reaches its bots (`bot:`, `--chat`, questions), admitted as its own bot mail is.
pub const ORCHESTRATION_PEER_BOT_MAIL_RUNTIME_CAPABILITY: &str = "orchestration.peer-bot-mail.v1";
/// Peer mail about a bot's item also carries files uploaded here for that item's chat.
pub const ORCHESTRATION_PEER_MAIL_FILES_RUNTIME_CAPABILITY: &str = "orchestration.peer-mail-files.v1";
/// Runs the workers a paired Orca places here as its own, coordinated from that Orca (wire v1).
pub const ORCHESTRATION_REMOTE_OWNED_WORKERS_RUNTIME_CAPABILITY: &str = "orchestration.remote-owned-workers.v1";
/// A paired Orca's chat-lineage start (`chatLineage`) starts here as a chat, and so do the workers it starts.
pub const ORCHESTRATION_CHAT_LINEAGE_RUNTIME_CAPABILITY: &str = "orchestration.chat-lineage.v1";
/// Its agents can message agents on a paired computer that pulls with `clientAsks`
/// (`send --on-client`); replies come back by `peerMailReturn`.
pub const ORCHESTRATION_CLIENT_AGENT_ASKS_RUNTIME_CAPABILITY: &str = "orchestration.client-agent-asks.v1";
/// `orchestration.taskUpdate` accepts worker-only passive `--note` updates on `dispatch_contexts`.
pub const ORCHESTRATION_TASK_UPDATE_NOTE_RUNTIME_CAPABILITY: &str = "orchestration.task-update-note.v1";

pub const ORCHESTRATION_RUNTIME_CAPABILITIES: &[&str] = &[
    ORCHESTRATION_TASK_UPDATE_NOTE_RUNTIME_CAPABILITY,
    ORCHESTRATION_CLIENT_AGENT_ASKS_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_CONTROL_MAIL_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_LIFECYCLE_SETTLEMENT_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_STOP_VERDICT_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_STOP_HELPERS_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_LAUNCH_PREFERENCES_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_STRUCTURED_READ_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_FLEET_SNAPSHOT_RUNTIME_CAPABILITY,
    ORCHESTRATION_FEDERATION_RELEASE_ARCHIVE_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_AUTO_RELEASE_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_KEEP_OPEN_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_START_IMPLICIT_RUN_RUNTIME_CAPABILITY,
    ORCHESTRATION_RETAINED_RUN_BINDINGS_RUNTIME_CAPABILITY,
    ORCHESTRATION_WORKER_TURN_STOP_REPORTS_RUNTIME_CAPABILITY,
    ORCHESTRATION_ASK_RETURNS_AT_ONCE_RUNTIME_CAPABILITY,
    ORCHESTRATION_PAIRED_WORKER_APPROVALS_RUNTIME_CAPABILITY,
    ORCHESTRATION_PAIRED_WORKER_DOCK_OWNER_RUNTIME_CAPABILITY,
    ORCHESTRATION_CONTRACT_RUNTIME_CAPABILITY,
    ORCHESTRATION_REPLAY_ONLY_RETRY_RUNTIME_CAPABILITY,
    ORCHESTRATION_PEER_MAIL_RUNTIME_CAPABILITY,
    ORCHESTRATION_PEER_MAIL_TYPES_RUNTIME_CAPABILITY,
    ORCHESTRATION_PEER_BOT_MAIL_RUNTIME_CAPABILITY,
    ORCHESTRATION_PEER_MAIL_FILES_RUNTIME_CAPABILITY,
    ORCHESTRATION_REMOTE_OWNED_WORKERS_RUNTIME_CAPABILITY,
    ORCHESTRATION_CHAT_LINEAGE_RUNTIME_CAPABILITY,
];
