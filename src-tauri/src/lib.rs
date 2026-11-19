use std::collections::HashMap;
#[cfg(windows)]
use std::collections::HashSet;
use std::io::{Read, Write};
use std::process::{Command, Output, Stdio};
use std::sync::{Arc, Mutex};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
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
struct PtyState {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
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
    let mut sessions = state.sessions.lock().unwrap();
    let session = sessions.get_mut(&id).ok_or("session not found")?;
    session
        .writer
        .write_all(data.as_bytes())
        .and_then(|_| session.writer.flush())
        .map_err(|e| e.to_string())
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

#[tauri::command]
async fn browser_open(
    app: AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let bounds = Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    };

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        if let Some(webview) = app.get_webview(BROWSER_WEBVIEW_LABEL) {
            let target = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
            webview.set_bounds(bounds).map_err(|error| error.to_string())?;
            webview.navigate(target).map_err(|error| error.to_string())?;
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
            .set_bounds(Rect {
                position: LogicalPosition::new(x, y).into(),
                size: LogicalSize::new(width, height).into(),
            })
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

pub fn run() {
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
            browser_close
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                let state = window.state::<PtyState>();
                kill_all(&state);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
