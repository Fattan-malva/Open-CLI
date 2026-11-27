//! Pure orchestration logic (state machines, DAG, scheduler, validation).
//! No I/O and no Tauri types here, so it can be unit-tested without a window.

pub mod commands;
pub mod context;
pub mod dag;
pub mod planner;
pub mod scheduler;
pub mod state;
pub mod validation;
