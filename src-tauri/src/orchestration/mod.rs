//! Port of Orca's orchestration contracts (src/shared/orchestration).
//! Wire format matches the TypeScript schemas: camelCase keys and the same enum values.
//! Modules are ported ahead of their callers, so unused items are allowed until the runtime lands.
#![allow(dead_code)]
pub mod approvals;
pub mod crew;
pub mod fleet;
pub mod follow_up;
pub mod mutation;
pub mod sender;
pub mod text;
pub mod timing;
