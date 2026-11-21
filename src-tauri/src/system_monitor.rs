use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Pid, ProcessesToUpdate, System};

#[cfg(windows)]
use winapi::shared::minwindef::DWORD;
#[cfg(windows)]
use winapi::um::sysinfoapi::{GlobalMemoryStatusEx, MEMORYSTATUSEX};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessMemory {
    pub pid: u32,
    pub name: String,
    pub label: String,
    pub memory_bytes: u64,
    pub memory_mb: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMemorySnapshot {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub opencli_bytes: u64,
    pub total_gb: f64,
    pub used_gb: f64,
    pub available_gb: f64,
    pub opencli_gb: f64,
    pub used_percent: f64,
    pub opencli_percent: f64,
    pub processes: Vec<ProcessMemory>,
    pub sampled_at: i64,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0)
}

fn bytes_to_gb(bytes: u64) -> f64 {
    bytes as f64 / 1_073_741_824.0
}

fn bytes_to_mb(bytes: u64) -> f64 {
    bytes as f64 / 1_048_576.0
}

fn percent(part: u64, total: u64) -> f64 {
    if total == 0 {
        0.0
    } else {
        (part as f64 / total as f64) * 100.0
    }
}

fn physical_memory() -> (u64, u64, u64) {
    #[cfg(windows)]
    unsafe {
        let mut status: MEMORYSTATUSEX = std::mem::zeroed();
        status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as DWORD;
        if GlobalMemoryStatusEx(&mut status) != 0 && status.ullTotalPhys > 0 {
            let total = status.ullTotalPhys as u64;
            let available = status.ullAvailPhys as u64;
            let used = total.saturating_sub(available);
            return (total, used, available);
        }
    }

    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory();
    let available = sys.available_memory();
    let used = total.saturating_sub(available);
    (total, used, available)
}

fn collect_descendants(system: &System, root: Pid) -> Vec<Pid> {
    let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children.entry(parent).or_default().push(*pid);
        }
    }

    let mut seen = HashSet::new();
    let mut stack = vec![root];
    let mut result = Vec::new();
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if system.process(pid).is_some() {
            result.push(pid);
        }
        if let Some(kids) = children.get(&pid) {
            for kid in kids {
                if !seen.contains(kid) {
                    stack.push(*kid);
                }
            }
        }
    }
    result
}

#[tauri::command]
pub async fn system_memory_snapshot() -> Result<SystemMemorySnapshot, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let (total_bytes, used_bytes, available_bytes) = physical_memory();

        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        let root_pid = Pid::from_u32(std::process::id());
        let mut pids = collect_descendants(&system, root_pid);
        if !pids.iter().any(|pid| pid.as_u32() == root_pid.as_u32()) {
            pids.push(root_pid);
        }

        let mut processes: Vec<ProcessMemory> = pids
            .into_iter()
            .filter_map(|pid| {
                let process = system.process(pid)?;
                let raw_name = process.name().to_string_lossy().to_string();
                let memory_bytes = process.memory();
                Some(ProcessMemory {
                    pid: pid.as_u32(),
                    name: raw_name.clone(),
                    label: raw_name,
                    memory_bytes,
                    memory_mb: bytes_to_mb(memory_bytes),
                })
            })
            .collect();

        processes.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes).then_with(|| a.pid.cmp(&b.pid)));
        let opencli_bytes = processes.iter().map(|process| process.memory_bytes).sum::<u64>();
        processes.truncate(10);

        Ok(SystemMemorySnapshot {
            total_bytes,
            used_bytes,
            available_bytes,
            opencli_bytes,
            total_gb: bytes_to_gb(total_bytes),
            used_gb: bytes_to_gb(used_bytes),
            available_gb: bytes_to_gb(available_bytes),
            opencli_gb: bytes_to_gb(opencli_bytes),
            used_percent: percent(used_bytes, total_bytes),
            opencli_percent: percent(opencli_bytes, total_bytes),
            processes,
            sampled_at: now_millis(),
        })
    })
    .await
    .map_err(|error| error.to_string())?
}
