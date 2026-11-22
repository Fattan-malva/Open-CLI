//! Detects installed agent CLIs, works out how many agents this machine can run,
//! and starts an agent CLI in a PTY session for the agent-group workspace.

use serde::Serialize;
use std::process::Command;
use sysinfo::System;
use tauri::{AppHandle, State};

use crate::PtyState;

const KNOWN_AGENTS: &[(&str, &str)] = &[
    ("claude", "Claude Code"),
    ("codex", "Codex CLI"),
    ("gemini", "Gemini CLI"),
    ("opencode", "OpenCode"),
    ("aider", "Aider"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    id: String,
    label: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCapacity {
    cpus: usize,
    memory_mb: u64,
    max_agents: usize,
}

fn locate(name: &str) -> Option<String> {
    let mut command = if cfg!(windows) {
        Command::new("where")
    } else {
        Command::new("which")
    };
    command.arg(name);
    crate::hidden_command(&mut command);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[tauri::command(async)]
pub async fn agent_detect() -> Result<Vec<DetectedAgent>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        Ok(KNOWN_AGENTS
            .iter()
            .filter_map(|(id, label)| {
                locate(id).map(|path| DetectedAgent {
                    id: id.to_string(),
                    label: label.to_string(),
                    path,
                })
            })
            .collect())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Each agent CLI needs about half a core and about 1 GB of memory, so the
/// limit is the smaller of the two. Low-spec machines get a low limit.
#[tauri::command(async)]
pub async fn agent_capacity() -> Result<AgentCapacity, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let cpus = std::thread::available_parallelism()
            .map(|count| count.get())
            .unwrap_or(2);
        let mut system = System::new();
        system.refresh_memory();
        let memory_mb = system.total_memory() / (1024 * 1024);
        let by_cpu = (cpus / 2).max(1);
        let by_memory = ((memory_mb / 1024) as usize).max(1);
        Ok(AgentCapacity {
            cpus,
            memory_mb,
            max_agents: by_cpu.min(by_memory).clamp(1, 12),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

fn launch_command(path: &str) -> (String, Option<String>) {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        ("cmd.exe".to_string(), Some(path.to_string()))
    } else if lower.ends_with(".ps1") {
        ("powershell.exe".to_string(), Some(path.to_string()))
    } else {
        (path.to_string(), None)
    }
}

#[tauri::command(async)]
pub async fn agent_spawn(
    app: AppHandle,
    pty: State<'_, PtyState>,
    id: String,
    agent: String,
    cwd: Option<String>,
) -> Result<(), String> {
    if !KNOWN_AGENTS.iter().any(|(known, _)| *known == agent) {
        return Err(format!("unknown agent: {agent}"));
    }
    let state = pty.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = locate(&agent).ok_or_else(|| format!("{agent} tidak ditemukan di PATH"))?;
        let (shell, command) = launch_command(&path);
        crate::ensure_pty_session_with_command(
            &app,
            &state,
            &id,
            Some(shell),
            cwd,
            command.as_deref(),
        )
        .map(|_| ())
    })
    .await
    .map_err(|error| error.to_string())?
}
