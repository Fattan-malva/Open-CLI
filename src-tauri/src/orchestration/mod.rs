//! Port of Orca's orchestration contracts (src/shared/orchestration).
//! Wire format matches the TypeScript schemas: camelCase keys and the same enum values.
//! Modules are ported ahead of their callers, so unused items are allowed until the runtime lands.
#![allow(dead_code)]
pub mod agent_reference;
pub mod compatibility_evidence;
pub mod conversation_name;
pub mod approvals;
pub mod caller_status;
pub mod check_output;
pub mod control_character_escape;
pub mod crew;
pub mod db;
pub mod dispatched_worker_attention;
pub mod dispatch_status_prompt;
pub mod dispatch_refusal;
pub mod dock;
pub mod fleet;
pub mod follow_up;
pub mod markdown;
pub mod misc;
pub mod paired_sender_name;
pub mod remote_owned_wire;
pub mod removed_work;
pub mod rpc_contract;
pub mod runtime;
pub mod runtime_capabilities;
pub mod mutation;
pub mod nested_worker_depth;
pub mod sender;
pub mod worker_auto_close;
pub mod worker_output;
pub mod worker_start_prompt_budget;
pub mod worker_stop_receipt;
pub mod text;
pub mod timing;










