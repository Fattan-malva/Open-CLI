//! Port of fleet/orchestration-fleet-status-index.ts.
use std::collections::{HashMap, HashSet};

use super::evidence::{worker_identity, AgentStatusEvidence, EvidenceBinding, WorkerIdentity};
use super::host_scope::{read_host_scope, HostScopeRead};
use super::types::FleetDurableWorker;

#[derive(Default)]
pub struct StatusIndex<'a> {
    pub by_dispatch_id: HashMap<String, &'a AgentStatusEvidence>,
    pub by_pane_key: HashMap<String, &'a AgentStatusEvidence>,
    pub by_terminal_handle: HashMap<String, &'a AgentStatusEvidence>,
    pub pane_owners: HashMap<String, HashSet<String>>,
    pub handle_owners: HashMap<String, HashSet<String>>,
}

fn add_owner(owners: &mut HashMap<String, HashSet<String>>, key: &str, dispatch_id: &str) {
    owners.entry(key.to_string()).or_default().insert(dispatch_id.to_string());
}

/// Newest delivery wins, since replays restamp it.
fn keep_freshest<'a>(map: &mut HashMap<String, &'a AgentStatusEvidence>, key: &str, evidence: &'a AgentStatusEvidence) {
    let replace = match map.get(key) {
        None => true,
        Some(current) => current.delivered_at < evidence.delivered_at,
    };
    if replace {
        map.insert(key.to_string(), evidence);
    }
}

pub fn create_status_index<'a>(statuses: &'a [AgentStatusEvidence], workers: &[FleetDurableWorker]) -> StatusIndex<'a> {
    let mut index = StatusIndex::default();
    let mut pane_keys = HashSet::new();
    let mut dispatch_ids = HashSet::new();
    let mut terminal_handles = HashSet::new();
    for worker in workers {
        dispatch_ids.insert(worker.dispatch_id.clone());
        match worker_identity(worker.pane_key.as_deref(), worker.agent_terminal_handle.as_deref()) {
            WorkerIdentity::Unidentifiable => continue,
            WorkerIdentity::PaneAndTerminal { pane_key, terminal_handle } => {
                pane_keys.insert(pane_key.clone());
                add_owner(&mut index.pane_owners, &pane_key, &worker.dispatch_id);
                terminal_handles.insert(terminal_handle.clone());
                add_owner(&mut index.handle_owners, &terminal_handle, &worker.dispatch_id);
            }
            WorkerIdentity::TerminalOnly { terminal_handle } => {
                terminal_handles.insert(terminal_handle.clone());
                add_owner(&mut index.handle_owners, &terminal_handle, &worker.dispatch_id);
            }
        }
    }
    for evidence in statuses {
        let binding = &evidence.binding;
        // Indexing unresolved evidence by its observed pane would recreate the false binding this union prevents.
        if let EvidenceBinding::Unresolved { .. } = binding {
            continue;
        }
        if let EvidenceBinding::Worker { dispatch_id, .. } = binding {
            if dispatch_ids.contains(dispatch_id) {
                keep_freshest(&mut index.by_dispatch_id, dispatch_id, evidence);
            }
        }
        if let Some(pane) = binding.pane_key() {
            if pane_keys.contains(pane) {
                keep_freshest(&mut index.by_pane_key, pane, evidence);
            }
        }
        if let Some(handle) = binding.terminal_handle() {
            if terminal_handles.contains(handle) {
                keep_freshest(&mut index.by_terminal_handle, handle, evidence);
            }
        }
    }
    index
}

fn unique_owner(owners: &HashMap<String, HashSet<String>>, key: Option<&str>) -> bool {
    match key {
        None => true,
        Some(k) => owners.get(k).map(|s| s.len() == 1).unwrap_or(false),
    }
}

/// Only a remote scope that names a target fences the connection the evidence must ride.
pub fn remote_target_for_worker(worker: &FleetDurableWorker) -> Option<String> {
    match read_host_scope(worker.resource.as_ref().and_then(|r| r.host_scope.as_deref())) {
        HostScopeRead::Remote { target_id, .. } => target_id,
        _ => None,
    }
}

fn status_identity_matches(
    worker: &FleetDurableWorker,
    identity: &WorkerIdentity,
    evidence: &AgentStatusEvidence,
    index: &StatusIndex<'_>,
) -> bool {
    let binding = &evidence.binding;
    let (terminal_handle, pane_key) = match identity {
        WorkerIdentity::Unidentifiable => return false,
        WorkerIdentity::PaneAndTerminal { terminal_handle, pane_key } => (terminal_handle.as_str(), Some(pane_key.as_str())),
        WorkerIdentity::TerminalOnly { terminal_handle } => (terminal_handle.as_str(), None),
    };
    if let EvidenceBinding::Unresolved { .. } = binding {
        return false;
    }
    if let EvidenceBinding::Worker { dispatch_id, .. } = binding {
        if dispatch_id != &worker.dispatch_id {
            return false;
        }
    }
    if binding.terminal_handle() != Some(terminal_handle) {
        return false;
    }
    if let Some(remote) = remote_target_for_worker(worker) {
        if evidence.activity.connection_id.as_deref() != Some(remote.as_str()) {
            return false;
        }
    }
    // A durable process incarnation, when present, must match the binding's.
    if let Some(durable) = worker.resource.as_ref().and_then(|r| r.process_incarnation.as_deref()) {
        if binding.process_incarnation() != Some(durable) {
            return false;
        }
    }
    let pane_matches = match pane_key {
        None => true,
        Some(pane) => binding.pane_key() == Some(pane),
    };
    if let EvidenceBinding::Worker { .. } = binding {
        // A durable process incarnation authenticates matching handles across pane remints.
        let durable = worker.resource.as_ref().and_then(|r| r.process_incarnation.as_ref()).is_some();
        return pane_matches || durable;
    }
    pane_matches
        && unique_owner(&index.pane_owners, pane_key)
        && unique_owner(&index.handle_owners, Some(terminal_handle))
}

pub fn status_for_worker<'a>(worker: &FleetDurableWorker, index: &StatusIndex<'a>) -> Option<&'a AgentStatusEvidence> {
    let identity = worker_identity(worker.pane_key.as_deref(), worker.agent_terminal_handle.as_deref());
    if identity == WorkerIdentity::Unidentifiable {
        return None;
    }
    if let Some(by_dispatch) = index.by_dispatch_id.get(&worker.dispatch_id).copied() {
        if status_identity_matches(worker, &identity, by_dispatch, index) {
            return Some(by_dispatch);
        }
    }
    let mut candidates: Vec<&AgentStatusEvidence> = Vec::new();
    if let WorkerIdentity::PaneAndTerminal { pane_key, .. } = &identity {
        if let Some(e) = index.by_pane_key.get(pane_key).copied() {
            candidates.push(e);
        }
    }
    if let Some(handle) = identity_handle(&identity) {
        if let Some(e) = index.by_terminal_handle.get(handle).copied() {
            candidates.push(e);
        }
    }
    candidates
        .into_iter()
        .filter(|e| status_identity_matches(worker, &identity, e, index))
        .max_by_key(|e| e.delivered_at)
}

fn identity_handle(identity: &WorkerIdentity) -> Option<&str> {
    match identity {
        WorkerIdentity::PaneAndTerminal { terminal_handle, .. } | WorkerIdentity::TerminalOnly { terminal_handle } => {
            Some(terminal_handle)
        }
        WorkerIdentity::Unidentifiable => None,
    }
}
