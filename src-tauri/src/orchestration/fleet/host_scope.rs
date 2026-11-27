//! Port of workers/worker-terminal-host-scope.ts: parses durable host_scope into a read.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostScope {
    Local { host_id: String },
    Wsl { host_id: String, distro: String },
    Ssh { target_id: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostScopeRead {
    /// Null or empty: legacy local and folder-workspace authority.
    Absent,
    /// Present and meaningless. Never local: a malformed remote scope must not read as home.
    Unreadable,
    Local { id: String, scope: Option<HostScope> },
    Remote { id: String, target_id: Option<String>, scope: Option<HostScope> },
}

pub fn read_host_scope(value: Option<&str>) -> HostScopeRead {
    let Some(value) = value.filter(|v| !v.is_empty()) else {
        return HostScopeRead::Absent;
    };
    let parsed: serde_json::Value = match serde_json::from_str(value) {
        Ok(v) => v,
        // Pre-JSON rows were a bare `local:<id>` string.
        Err(_) => {
            return if value.starts_with("local:") {
                HostScopeRead::Local { id: "local".into(), scope: None }
            } else {
                HostScopeRead::Unreadable
            };
        }
    };
    let Some(object) = parsed.as_object() else {
        return HostScopeRead::Unreadable;
    };
    let kind = object.get("kind").and_then(|v| v.as_str());
    let host_id = object.get("hostId").and_then(|v| v.as_str()).map(str::to_string);
    let target_id = object
        .get("targetId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    match kind {
        Some("local") => {
            let scope = (host_id.as_deref() == Some("local"))
                .then(|| HostScope::Local { host_id: "local".into() });
            HostScopeRead::Local { id: host_id.unwrap_or_else(|| "local".into()), scope }
        }
        // Local WSL names a guest on this machine; stray target IDs must not make it a remote host.
        Some("wsl") if host_id.as_deref() == Some("local") => {
            let distro = object
                .get("distro")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            HostScopeRead::Local {
                id: "local".into(),
                scope: distro.map(|distro| HostScope::Wsl { host_id: "local".into(), distro }),
            }
        }
        Some("ssh") if target_id.is_some() => {
            let target = target_id.clone().unwrap();
            HostScopeRead::Remote {
                id: target.clone(),
                target_id: target_id.clone(),
                scope: Some(HostScope::Ssh { target_id: target }),
            }
        }
        Some(other) => HostScopeRead::Remote {
            id: target_id.clone().or(host_id).unwrap_or_else(|| other.to_string()),
            target_id,
            scope: None,
        },
        None => HostScopeRead::Unreadable,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_and_legacy_local_strings() {
        assert_eq!(read_host_scope(None), HostScopeRead::Absent);
        assert_eq!(read_host_scope(Some("")), HostScopeRead::Absent);
        assert_eq!(
            read_host_scope(Some("local:abc")),
            HostScopeRead::Local { id: "local".into(), scope: None }
        );
    }

    #[test]
    fn malformed_is_never_local() {
        assert_eq!(read_host_scope(Some("not json")), HostScopeRead::Unreadable);
    }

    #[test]
    fn wsl_with_stray_target_stays_local() {
        let read = read_host_scope(Some(r#"{"kind":"wsl","hostId":"local","distro":"Ubuntu","targetId":"x"}"#));
        assert_eq!(
            read,
            HostScopeRead::Local {
                id: "local".into(),
                scope: Some(HostScope::Wsl { host_id: "local".into(), distro: "Ubuntu".into() })
            }
        );
    }

    #[test]
    fn ssh_needs_a_target_to_fence() {
        let read = read_host_scope(Some(r#"{"kind":"ssh","targetId":"t1"}"#));
        assert!(matches!(read, HostScopeRead::Remote { target_id: Some(ref t), .. } if t == "t1"));
        let no_target = read_host_scope(Some(r#"{"kind":"ssh"}"#));
        assert!(matches!(no_target, HostScopeRead::Remote { target_id: None, .. }));
    }
}
