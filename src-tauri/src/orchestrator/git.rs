use serde_json::{json, Value};
use std::path::Path;
use std::process::{Command, Output};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use winapi::um::winbase::CREATE_NO_WINDOW;

fn command(program: &str, args: &[&str], cwd: &Path) -> Result<Output, String> {
    let mut process = Command::new(program);
    process.args(args).current_dir(cwd);
    #[cfg(windows)]
    process.creation_flags(CREATE_NO_WINDOW);
    process
        .output()
        .map_err(|error| format!("failed to run {}: {}", program, error))
}

fn git(args: &[&str], cwd: &Path) -> Result<Output, String> {
    command("git", args, cwd)
}

fn ok(output: &Output) -> Result<String, String> {
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub fn is_git_repo(root: &Path) -> bool {
    git(&["rev-parse", "--is-inside-work-tree"], root)
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn base_commit(root: &Path) -> Result<String, String> {
    git(&["rev-parse", "HEAD"], root).and_then(|output| ok(&output))
}

pub fn is_dirty(root: &Path) -> bool {
    git(&["status", "--porcelain"], root)
        .map(|output| !String::from_utf8_lossy(&output.stdout).trim().is_empty())
        .unwrap_or(false)
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .collect()
}

pub fn create_worktree(
    root: &str,
    run_id: &str,
    task_id: &str,
    mode: &str,
    worktree_root: &Path,
) -> Result<Value, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("project root does not exist: {}", root));
    }
    let id = format!("ws-{}-{}", sanitize(run_id), sanitize(task_id));
    let timestamp = super::store::now();
    if mode != "worktree" || !is_git_repo(root_path) {
        return Ok(json!({
            "id": id,
            "runId": run_id,
            "root": root,
            "path": root,
            "branch": "",
            "baseCommit": "",
            "isolationMode": if mode == "worktree" { "none" } else { mode },
            "dirtyAtCreate": if mode == "worktree" { false } else { is_dirty(root_path) },
            "createdAt": timestamp,
        }));
    }

    let base = base_commit(root_path)?;
    let dirty = is_dirty(root_path);
    std::fs::create_dir_all(worktree_root).map_err(|error| error.to_string())?;
    let path = worktree_root.join(sanitize(task_id));
    let branch = format!(
        "orchestrator/{}-{}-{}",
        sanitize(run_id),
        sanitize(task_id),
        &base[..base.len().min(8)]
    );
    let path_str = path.to_string_lossy().to_string();
    if !path.exists() {
        let output = git(
            &["worktree", "add", "-b", &branch, &path_str, &base],
            root_path,
        )?;
        ok(&output)?;
    }
    Ok(json!({
        "id": id,
        "runId": run_id,
        "root": root,
        "path": path_str,
        "branch": branch,
        "baseCommit": base,
        "isolationMode": "worktree",
        "dirtyAtCreate": dirty,
        "createdAt": timestamp,
    }))
}

fn workspace_path(data: &Value) -> Result<(String, String), String> {
    let path = data
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| "workspace has no path".to_string())?
        .to_string();
    let base = data
        .get("baseCommit")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok((path, base))
}

pub fn status(data: &Value) -> Result<Value, String> {
    let (path, _) = workspace_path(data)?;
    let root = Path::new(&path);
    let dirty = is_dirty(root);
    let files = if dirty {
        git(&["status", "--porcelain"], root)
            .map(|output| {
                String::from_utf8_lossy(&output.stdout)
                    .lines()
                    .filter_map(|line| line.get(3..))
                    .map(|item| item.trim().to_string())
                    .filter(|item| !item.is_empty())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    let branch = git(&["rev-parse", "--abbrev-ref", "HEAD"], root)
        .map(|output| ok(&output).unwrap_or_default())
        .unwrap_or_default();
    Ok(json!({ "dirty": dirty, "changedFiles": files, "branch": branch }))
}

pub fn diff(data: &Value) -> Result<String, String> {
    let (path, base) = workspace_path(data)?;
    let root = Path::new(&path);
    let args: Vec<String> = if base.is_empty() {
        vec!["diff".to_string(), "HEAD".to_string()]
    } else {
        vec!["diff".to_string(), base.clone(), "HEAD".to_string()]
    };
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let output = git(&refs, root)?;
    let text = String::from_utf8_lossy(&output.stdout);
    Ok(text.chars().take(200_000).collect())
}

pub fn run_command(data: &Value, shell_command: &str) -> Result<Value, String> {
    let (path, _) = workspace_path(data)?;
    let root = Path::new(&path);
    let output = if cfg!(windows) {
        let mut process = Command::new("powershell.exe");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            process.creation_flags(CREATE_NO_WINDOW);
        }
        process
            .args(["-NoProfile", "-Command", shell_command])
            .current_dir(root)
            .output()
            .map_err(|error| error.to_string())?
    } else {
        command("sh", &["-c", shell_command], root)?
    };
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    text.push_str(&String::from_utf8_lossy(&output.stderr));
    Ok(json!({
        "exitCode": output.status.code(),
        "output": text.chars().take(20_000).collect::<String>(),
    }))
}

pub fn integrate(data: &Value, target: &str) -> Result<Value, String> {
    if target != "worktree" {
        return Ok(
            json!({ "ok": false, "conflict": false, "output": "unsupported integration target" }),
        );
    }
    let (path, base) = workspace_path(data)?;
    let workspace = Path::new(&path);
    let root_value = data
        .get("root")
        .and_then(Value::as_str)
        .ok_or_else(|| "workspace has no root".to_string())?;
    let root = Path::new(root_value);
    if base.is_empty() || !is_git_repo(root) || !is_git_repo(workspace) {
        return Ok(
            json!({ "ok": false, "conflict": false, "output": "integration requires git worktrees" }),
        );
    }
    let patch = git(&["diff", &base, "HEAD"], workspace)?;
    if !patch.status.success() {
        return Ok(
            json!({ "ok": false, "conflict": false, "output": String::from_utf8_lossy(&patch.stderr).to_string() }),
        );
    }
    let patch_dir = workspace.parent().unwrap_or(workspace).join("patches");
    std::fs::create_dir_all(&patch_dir).map_err(|error| error.to_string())?;
    let patch_path = patch_dir.join(format!(
        "{}.patch",
        super::store::now().replace([':', '-'], "")
    ));
    std::fs::write(&patch_path, &patch.stdout).map_err(|error| error.to_string())?;
    let patch_arg = patch_path.to_string_lossy().to_string();
    let apply = git(
        &["apply", "--3way", "--whitespace=nowarn", &patch_arg],
        root,
    )?;
    if apply.status.success() {
        return Ok(
            json!({ "ok": true, "conflict": false, "output": String::from_utf8_lossy(&apply.stdout).to_string() }),
        );
    }
    let output = format!(
        "{}\n{}",
        String::from_utf8_lossy(&apply.stdout),
        String::from_utf8_lossy(&apply.stderr)
    );
    let conflict = git(&["apply", "--check", "--3way", &patch_arg], root)
        .map(|check| !check.status.success())
        .unwrap_or(false);
    Ok(json!({ "ok": false, "conflict": conflict, "output": output }))
}
