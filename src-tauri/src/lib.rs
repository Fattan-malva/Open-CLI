use std::collections::HashMap;
#[cfg(windows)]
use std::collections::HashSet;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::{Arc, Mutex};

mod orchestrator;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, State, WebviewUrl, WindowEvent,
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::os::windows::io::RawHandle;
#[cfg(windows)]
use winapi::shared::minwindef::{DWORD, LPVOID};
#[cfg(windows)]
use winapi::shared::ntdef::HANDLE;
#[cfg(windows)]
use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(windows)]
use winapi::um::jobapi2::{
    AssignProcessToJobObject, CreateJobObjectW, QueryInformationJobObject,
    SetInformationJobObject, TerminateJobObject,
};
#[cfg(windows)]
use winapi::um::tlhelp32::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
    TH32CS_SNAPPROCESS,
};
#[cfg(windows)]
use winapi::um::winbase::CREATE_NO_WINDOW;
#[cfg(windows)]
use winapi::um::winnt::{
    JOBOBJECT_BASIC_PROCESS_ID_LIST, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectBasicProcessIdList, JobObjectExtendedLimitInformation,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyEvent {
    id: String,
    data: String,
}

const AGENT_CLI_FILE: &str = "cli-agent.json";
const EMPTY_AGENT_CLI_JSON: &str =
    "{\"customAgents\":[],\"activeIds\":[],\"projectPath\":null}";
const BROWSER_PRIVACY_FILE: &str = "browser-privacy.json";
const EMPTY_BROWSER_PRIVACY_JSON: &str = "{\"sessionOnly\":false}";
const LEGACY_APP_DIR_NAME: &str = "com.opencli.app";
const LEGACY_RUNTIME_DIR_NAME: &str = "OpenCLI";
const DEV_APP_DIR_NAME: &str = "opencli-dev";
const UNINSTALL_CONFIRMATION: &str = "UNINSTALL";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BrowserPrivacy {
    session_only: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FsEntry {
    name: String,
    path: String,
    kind: String,
}

#[cfg(windows)]
struct JobHandle(HANDLE);

#[cfg(windows)]
unsafe impl Send for JobHandle {}

#[cfg(windows)]
impl JobHandle {
    fn new() -> Option<Self> {
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
            if handle.is_null() {
                return None;
            }

            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let ok = SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &mut limits as *mut _ as LPVOID,
                std::mem::size_of_val(&limits) as DWORD,
            );
            if ok == 0 {
                CloseHandle(handle);
                return None;
            }

            Some(Self(handle))
        }
    }

    fn assign(&self, handle: RawHandle) -> bool {
        unsafe { AssignProcessToJobObject(self.0, handle as HANDLE) != 0 }
    }

    fn busy(&self) -> Option<bool> {
        unsafe {
            let mut needed: DWORD = 0;
            QueryInformationJobObject(
                self.0,
                JobObjectBasicProcessIdList,
                std::ptr::null_mut(),
                0,
                &mut needed,
            );
            if needed == 0 {
                return None;
            }

            let mut buffer = vec![0u8; needed as usize];
            let info = buffer.as_mut_ptr() as *mut JOBOBJECT_BASIC_PROCESS_ID_LIST;
            let ok = QueryInformationJobObject(
                self.0,
                JobObjectBasicProcessIdList,
                info as LPVOID,
                needed,
                &mut needed,
            );
            if ok == 0 {
                return None;
            }

            Some((*info).NumberOfProcessIdsInList > 1)
        }
    }

    fn terminate(&self) {
        unsafe {
            TerminateJobObject(self.0, 1);
        }
    }
}

#[cfg(windows)]
impl Drop for JobHandle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    #[cfg(windows)]
    job: Option<JobHandle>,
}

#[derive(Default)]
pub(crate) struct PtyState {
    pub(crate) sessions: Arc<Mutex<HashMap<String, Session>>>,
}

pub(crate) fn pty_write_session(
    state: &PtyState,
    id: &str,
    data: &str,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(id).ok_or("session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|error| error.to_string())
}

fn emit(app: &AppHandle, event: &str, id: &str, data: String) {
    let _ = app.emit(
        event,
        PtyEvent {
            id: id.to_string(),
            data,
        },
    );
}

fn hidden_command(command: &mut Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
}

fn command_output(command: &mut Command) -> Option<Output> {
    hidden_command(command);
    command
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .ok()
}

#[cfg(windows)]
fn has_descendant_process(root_pid: u32) -> bool {
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return true;
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as DWORD;
        let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
        let mut names: HashMap<u32, String> = HashMap::new();

        if Process32FirstW(snapshot, &mut entry) != 0 {
            loop {
                let pid = entry.th32ProcessID;
                let parent = entry.th32ParentProcessID;
                let name = String::from_utf16_lossy(&entry.szExeFile)
                    .trim_end_matches('\0')
                    .to_ascii_lowercase();
                children.entry(parent).or_default().push(pid);
                names.insert(pid, name);
                if Process32NextW(snapshot, &mut entry) == 0 {
                    break;
                }
            }
        }

        CloseHandle(snapshot);

        let mut visited = HashSet::new();
        let mut stack = vec![root_pid];
        while let Some(parent) = stack.pop() {
            if let Some(entries) = children.get(&parent) {
                for &child in entries {
                    if child == root_pid || !visited.insert(child) {
                        continue;
                    }
                    if names
                        .get(&child)
                        .map_or(false, |name| name == "conhost.exe")
                    {
                        continue;
                    }
                    return true;
                }
            }
        }

        false
    }
}

fn terminate_tree(session: &mut Session) {
    #[cfg(windows)]
    let terminated_by_job = session
        .job
        .as_ref()
        .map(|job| {
            job.terminate();
            true
        })
        .unwrap_or(false);

    #[cfg(windows)]
    if !terminated_by_job {
        if let Some(pid) = session.child.process_id() {
            let pid_arg = pid.to_string();
            let mut command = Command::new("taskkill");
            command.args(["/PID", &pid_arg, "/T", "/F"]);
            let _ = command_output(&mut command);
        }
    }

    let _ = session.child.kill();
    let _ = session.child.wait();
}

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = shell.unwrap_or_else(|| "powershell.exe".to_string());
    let mut cmd = CommandBuilder::new(&shell);
    if shell.to_lowercase().contains("powershell") && !shell.to_lowercase().contains("pwsh") {
        cmd.arg("-NoLogo");
    }
    cmd.env("TERM", "xterm-256color");
    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);

    #[cfg(windows)]
    let job = JobHandle::new().and_then(|job| {
        let handle = child.as_raw_handle()?;
        if job.assign(handle) {
            Some(job)
        } else {
            None
        }
    });

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    state.sessions.lock().unwrap().insert(
        id.clone(),
        Session {
            writer,
            master: pair.master,
            child,
            #[cfg(windows)]
            job,
        },
    );

    let event_id = id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let filtered: Vec<u8> = buf[..n]
                        .iter()
                        .copied()
                        .filter(|byte| *byte != 7)
                        .collect();
                    if !filtered.is_empty() {
                        emit(
                            &app_handle,
                            "pty:data",
                            &event_id,
                            BASE64.encode(&filtered),
                        );
                    }
                }
                Err(_) => break,
            }
        }
        emit(&app_handle, "pty:exit", &event_id, String::new());
    });

    Ok(())
}

#[tauri::command]
fn pty_write(state: State<'_, PtyState>, id: String, data: String) -> Result<(), String> {
    pty_write_session(&state, &id, &data)
}

#[tauri::command]
fn pty_resize(
    state: State<'_, PtyState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_is_busy(state: State<'_, PtyState>, id: String) -> Result<bool, String> {
    let mut sessions = state.sessions.lock().unwrap();
    let Some(session) = sessions.get_mut(&id) else {
        return Ok(false);
    };

    #[cfg(windows)]
    {
        if let Some(job) = &session.job {
            if let Some(busy) = job.busy() {
                return Ok(busy);
            }
        }
        if let Some(pid) = session.child.process_id() {
            if has_descendant_process(pid) {
                return Ok(true);
            }
        }
    }

    if session
        .child
        .try_wait()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Ok(false);
    }

    #[cfg(not(windows))]
    return Ok(true);

    Ok(false)
}

#[tauri::command]
fn pty_kill(app: AppHandle, state: State<'_, PtyState>, id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        terminate_tree(&mut session);
    }
    emit(&app, "pty:exit", &id, String::new());
    Ok(())
}

fn kill_all(state: &PtyState) {
    let mut sessions = state.sessions.lock().unwrap();
    for (_, mut session) in sessions.drain() {
        terminate_tree(&mut session);
    }
}

const BROWSER_WEBVIEW_LABEL: &str = "browser-view";
const BROWSER_TITLE_EVENT: &str = "browser-tab-title";

#[derive(Clone, Serialize)]
struct BrowserTitleEvent {
    label: String,
    title: String,
}

fn browser_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(root.join("EBWebView"))
}

fn browser_privacy_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(root.join("data").join(BROWSER_PRIVACY_FILE))
}

fn default_browser_privacy() -> BrowserPrivacy {
    serde_json::from_str::<BrowserPrivacy>(EMPTY_BROWSER_PRIVACY_JSON)
        .unwrap_or(BrowserPrivacy { session_only: false })
}

fn read_browser_privacy(app: &AppHandle) -> BrowserPrivacy {
    let path = match browser_privacy_path(app) {
        Ok(path) => path,
        Err(_) => return default_browser_privacy(),
    };
    let contents = match fs::read_to_string(path) {
        Ok(contents) => contents,
        Err(_) => return default_browser_privacy(),
    };
    match serde_json::from_str::<BrowserPrivacy>(&contents) {
        Ok(privacy) => privacy,
        Err(_) => default_browser_privacy(),
    }
}

fn write_browser_privacy(app: &AppHandle, privacy: &BrowserPrivacy) -> Result<(), String> {
    let path = browser_privacy_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let contents = serde_json::to_string(privacy).map_err(|error| error.to_string())?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

fn clear_browsing_data(app: &AppHandle) -> Result<(), String> {
    let webviews = app.webviews();
    if webviews.is_empty() {
        return Err("Webview tidak ditemukan.".to_string());
    }

    let mut failure = None;
    for webview in webviews.values() {
        if let Err(error) = webview.clear_all_browsing_data() {
            failure = Some(error.to_string());
        }
    }

    match failure {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn close_browser_webviews(app: &AppHandle) -> Result<(), String> {
    let labels: Vec<String> = app
        .webviews()
        .keys()
        .cloned()
        .filter(|label| label.starts_with("browser-tab-") || label == BROWSER_WEBVIEW_LABEL)
        .collect();

    for label in labels {
        if let Some(webview) = app.get_webview(&label) {
            webview.close().map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

fn browser_bounds(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    }
}

#[tauri::command]
async fn browser_open(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if let Some(webview) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
            let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
            webview
                .set_bounds(browser_bounds(x, y, width, height))
                .map_err(|error| error.to_string())?;
            webview.navigate(target).map_err(|error| error.to_string())?;
            webview.show().map_err(|error| error.to_string())?;
            webview.set_focus().map_err(|error| error.to_string())?;
            return Ok(());
        }

        let window = app
            .get_window("main")
            .ok_or_else(|| "jendela utama tidak ditemukan".to_string())?;
        let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

        window
            .add_child(
                tauri::webview::WebviewBuilder::new(
                    BROWSER_WEBVIEW_LABEL,
                    WebviewUrl::External(target),
                ),
                LogicalPosition::new(x, y),
                LogicalSize::new(width, height),
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn browser_set_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
        webview
            .set_bounds(browser_bounds(x, y, width, height))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_close(app: AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
        webview.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_tab_create(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let title_app = app.clone();

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if app.get_webview(&label).is_some() {
            return Ok(());
        }

        let window = app
            .get_window("main")
            .ok_or_else(|| "jendela utama tidak ditemukan".to_string())?;
        let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
        let title_label = label.clone();

        let webview = window
            .add_child(
                tauri::webview::WebviewBuilder::new(label, WebviewUrl::External(target))
                    .on_document_title_changed(move |_webview, title| {
                        let _ = title_app.emit(
                            BROWSER_TITLE_EVENT,
                            BrowserTitleEvent {
                                label: title_label.clone(),
                                title,
                            },
                        );
                    }),
                LogicalPosition::new(x, y),
                LogicalSize::new(width, height),
            )
            .map_err(|error| error.to_string())?;
        webview.hide().map_err(|error| error.to_string())?;

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn browser_tab_navigate(app: AppHandle, label: String, url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let webview = app
            .get_webview(&label)
            .ok_or_else(|| "tab browser tidak ditemukan".to_string())?;
        let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;

        webview.navigate(target).map_err(|error| error.to_string())?;
        webview.show().map_err(|error| error.to_string())?;
        webview.set_focus().map_err(|error| error.to_string())?;

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn browser_tab_sync(
    app: AppHandle,
    labels: Vec<String>,
    active: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let bounds = move || browser_bounds(x, y, width, height);

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        for label in labels {
            let Some(webview) = app.get_webview(&label) else {
                continue;
            };

            if active.as_ref() == Some(&label) {
                webview.set_bounds(bounds()).map_err(|error| error.to_string())?;
                webview.show().map_err(|error| error.to_string())?;
                webview.set_focus().map_err(|error| error.to_string())?;
            } else {
                webview.hide().map_err(|error| error.to_string())?;
            }
        }

        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn browser_tab_close(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        webview.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn browser_tabs_close_all(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || close_browser_webviews(&app))
        .await
        .map_err(|error| error.to_string())?
}

fn agent_cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(root.join("data").join(AGENT_CLI_FILE))
}

fn legacy_agent_cli_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().config_dir().map_err(|error| error.to_string())?;
    Ok(root
        .join(LEGACY_APP_DIR_NAME)
        .join("data")
        .join(AGENT_CLI_FILE))
}

fn migrate_legacy_agent_cli_file(app: &AppHandle, target: &Path) {
    if cfg!(debug_assertions) || target.exists() {
        return;
    }

    let legacy = match legacy_agent_cli_path(app) {
        Ok(path) => path,
        Err(_) => return,
    };
    if !legacy.exists() {
        return;
    }

    if let Some(parent) = target.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if let Ok(contents) = fs::read_to_string(&legacy) {
        if serde_json::from_str::<JsonValue>(&contents).is_ok() {
            let _ = fs::write(target, contents);
        }
    }
}

fn remove_app_data_dir(path: &Path) -> Result<(), String> {
    let expected = std::ffi::OsStr::new("opencli");
    let dev = std::ffi::OsStr::new(DEV_APP_DIR_NAME);
    let legacy = std::ffi::OsStr::new(LEGACY_APP_DIR_NAME);
    let runtime = std::ffi::OsStr::new(LEGACY_RUNTIME_DIR_NAME);
    let name = path.file_name().unwrap_or_default();
    if name != expected && name != dev && name != legacy && name != runtime {
        return Err("Path data aplikasi tidak valid.".to_string());
    }
    if !path.exists() {
        return Ok(());
    }
    fs::remove_dir_all(path).map_err(|error| error.to_string())
}

fn uninstaller_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let parent = exe
        .parent()
        .ok_or_else(|| "Folder aplikasi tidak ditemukan.".to_string())?;
    let path = parent.join("unins000.exe");
    if !path.exists() {
        return Err("Uninstaller tidak ditemukan pada folder aplikasi.".to_string());
    }
    Ok(path)
}

fn ensure_agent_cli_file(app: &AppHandle) -> Result<PathBuf, String> {
    let path = agent_cli_path(app)?;
    migrate_legacy_agent_cli_file(app, &path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if !path.exists() {
        fs::write(&path, EMPTY_AGENT_CLI_JSON).map_err(|error| error.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
fn app_data_path(app: AppHandle) -> Result<String, String> {
    let root = app.path().app_data_dir().map_err(|error| error.to_string())?;
    Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
fn browser_data_path(app: AppHandle) -> Result<String, String> {
    let path = browser_data_dir(&app)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn browser_clear_data(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        close_browser_webviews(&app)?;
        clear_browsing_data(&app)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
fn browser_session_only_get(app: AppHandle) -> Result<bool, String> {
    Ok(read_browser_privacy(&app).session_only)
}

#[tauri::command]
fn browser_session_only_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    write_browser_privacy(&app, &BrowserPrivacy { session_only: enabled })?;
    if enabled {
        clear_browsing_data(&app)?;
    }
    Ok(())
}

#[tauri::command]
fn app_uninstall(app: AppHandle, confirmation: String) -> Result<(), String> {
    if confirmation != UNINSTALL_CONFIRMATION {
        return Err(format!(
            "Ketik {} untuk melanjutkan uninstall.",
            UNINSTALL_CONFIRMATION
        ));
    }

    let uninstaller = uninstaller_path()?;
    let data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    remove_app_data_dir(&data_dir)?;

    let legacy_config = app
        .path()
        .config_dir()
        .map_err(|error| error.to_string())?
        .join(LEGACY_APP_DIR_NAME);
    remove_app_data_dir(&legacy_config)?;

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let legacy_local = PathBuf::from(&local).join(LEGACY_APP_DIR_NAME);
        remove_app_data_dir(&legacy_local)?;

        let legacy_runtime = PathBuf::from(&local).join(LEGACY_RUNTIME_DIR_NAME);
        remove_app_data_dir(&legacy_runtime)?;
    }

    let _child = Command::new(&uninstaller)
        .arg("/S")
        .spawn()
        .map_err(|error| error.to_string())?;
    std::process::exit(0);
}

#[tauri::command]
fn agent_cli_read(app: AppHandle) -> Result<String, String> {
    let path = ensure_agent_cli_file(&app)?;
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn agent_cli_write(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<JsonValue>(&contents).map_err(|error| error.to_string())?;
    let path = ensure_agent_cli_file(&app)?;
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[tauri::command]
fn fs_list_drives() -> Result<Vec<FsEntry>, String> {
    let mut entries = Vec::new();

    #[cfg(windows)]
    for code in b'A'..=b'Z' {
        let path = format!("{}:\\", code as char);
        if Path::new(&path).exists() {
            entries.push(FsEntry {
                name: path.clone(),
                path,
                kind: "drive".to_string(),
            });
        }
    }

    #[cfg(not(windows))]
    entries.push(FsEntry {
        name: "/".to_string(),
        path: "/".to_string(),
        kind: "drive".to_string(),
    });

    Ok(entries)
}

#[tauri::command]
fn fs_list_folders(path: String, query: Option<String>) -> Result<Vec<FsEntry>, String> {
    let target = if path.trim().is_empty() {
        #[cfg(windows)]
        {
            "C:\\".to_string()
        }
        #[cfg(not(windows))]
        {
            "/".to_string()
        }
    } else {
        path
    };

    let needle = query.unwrap_or_default().trim().to_lowercase();
    let mut entries = Vec::new();

    for item in fs::read_dir(&target).map_err(|error| error.to_string())? {
        let item = item.map_err(|error| error.to_string())?;
        if !item.file_type().map_err(|error| error.to_string())?.is_dir() {
            continue;
        }

        let name = item.file_name().to_string_lossy().to_string();
        if !needle.is_empty() && !name.to_lowercase().contains(&needle) {
            continue;
        }

        entries.push(FsEntry {
            path: item.path().to_string_lossy().to_string(),
            name,
            kind: "folder".to_string(),
        });
    }

    entries.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(entries.into_iter().take(300).collect())
}

fn dev_data_root() -> Option<PathBuf> {
    if !cfg!(debug_assertions) {
        return None;
    }

    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    if home.trim().is_empty() {
        return None;
    }

    Some(
        PathBuf::from(home)
            .join(".config")
            .join(DEV_APP_DIR_NAME),
    )
}

pub fn run() {
    let mut context = tauri::generate_context!();
    if let Some(root) = dev_data_root() {
        context.config_mut().app.app_directories_override =
            Some(tauri::utils::config::AppDirectoriesOverride::Root(root));
    }

    tauri::Builder::default()
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_is_busy,
            pty_kill,
            browser_open,
            browser_set_bounds,
            browser_close,
            browser_tab_create,
            browser_tab_navigate,
            browser_tab_sync,
            browser_tab_close,
            browser_tabs_close_all,
            agent_cli_read,
            agent_cli_write,
            app_data_path,
            browser_data_path,
            browser_clear_data,
            browser_session_only_get,
            browser_session_only_set,
            app_uninstall,
            fs_list_drives,
            fs_list_folders,
            orchestrator::commands::orchestrator_snapshot,
            orchestrator::commands::orchestrator_upsert_run,
            orchestrator::commands::orchestrator_upsert_task,
            orchestrator::commands::orchestrator_upsert_approval,
            orchestrator::commands::orchestrator_emit_event,
            orchestrator::commands::orchestrator_next_event_id,
            orchestrator::commands::orchestrator_register_agent,
            orchestrator::commands::orchestrator_unregister_agent,
            orchestrator::commands::orchestrator_run_dir,
            orchestrator::commands::orchestrator_artifact_write,
            orchestrator::commands::orchestrator_artifact_read,
            orchestrator::commands::orchestrator_artifact_wait,
            orchestrator::commands::orchestrator_workspace_create,
            orchestrator::commands::orchestrator_workspace_status,
            orchestrator::commands::orchestrator_workspace_diff,
            orchestrator::commands::orchestrator_send_prompt,
            orchestrator::commands::orchestrator_dispatch,
            orchestrator::commands::orchestrator_run_command,
            orchestrator::commands::orchestrator_integrate,
            orchestrator::commands::orchestrator_recover,
            orchestrator::commands::orchestrator_browser_bridge_start,
            orchestrator::commands::orchestrator_browser_bridge_stop,
            orchestrator::commands::orchestrator_browser_call,
            orchestrator::commands::orchestrator_browser_inspect,
            orchestrator::commands::orchestrator_browser_snapshot
        ])
        .setup(|app| {
            if let Err(error) = ensure_agent_cli_file(app.handle()) {
                eprintln!("Gagal menyiapkan data/cli-agent.json: {}", error);
            }
            orchestrator::init(app.handle());
            if read_browser_privacy(app.handle()).session_only {
                if let Err(error) = clear_browsing_data(app.handle()) {
                    eprintln!("Gagal membersihkan data browser: {}", error);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                let state = window.state::<PtyState>();
                kill_all(&state);

                if read_browser_privacy(window.app_handle()).session_only {
                    let _ = clear_browsing_data(window.app_handle());
                }
            }
        })
        .run(context)
        .expect("error while running tauri application");
}
