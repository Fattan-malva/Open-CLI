use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

pub struct UserTaskStore {
    conn: Mutex<Connection>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRecord {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub category: String,
    pub due_date: Option<String>,
    pub marker: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoRecord {
    pub id: String,
    pub task_id: Option<String>,
    pub title: String,
    pub done: bool,
    pub due_date: Option<String>,
    pub marker: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPayload {
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub category: String,
    pub due_date: Option<String>,
    pub marker: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoPayload {
    pub task_id: Option<String>,
    pub title: String,
    pub due_date: Option<String>,
    pub marker: String,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoUpdatePayload {
    pub task_id: Option<String>,
    pub title: String,
    pub due_date: Option<String>,
    pub marker: String,
    pub done: bool,
}

impl UserTaskStore {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let conn = Connection::open(path).map_err(|error| error.to_string())?;
        let store = Self {
            conn: Mutex::new(conn),
        };
        store.migrate()?;
        Ok(store)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             CREATE TABLE IF NOT EXISTS user_tasks (
               id TEXT PRIMARY KEY,
               title TEXT NOT NULL,
               description TEXT NOT NULL,
               status TEXT NOT NULL,
               priority TEXT NOT NULL,
               category TEXT NOT NULL,
               due_date TEXT,
               marker TEXT NOT NULL,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS user_todos (
               id TEXT PRIMARY KEY,
               task_id TEXT,
               title TEXT NOT NULL,
               done INTEGER NOT NULL DEFAULT 0,
               due_date TEXT,
               marker TEXT NOT NULL,
               created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL,
               FOREIGN KEY(task_id) REFERENCES user_tasks(id) ON DELETE SET NULL
             );
             CREATE INDEX IF NOT EXISTS idx_user_tasks_updated_at ON user_tasks(updated_at DESC);
             CREATE INDEX IF NOT EXISTS idx_user_todos_updated_at ON user_todos(updated_at DESC);
             CREATE INDEX IF NOT EXISTS idx_user_todos_task_id ON user_todos(task_id);",
        )
        .map_err(|error| error.to_string())
    }

    fn conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn.lock().map_err(|error| error.to_string())
    }
}

fn now_iso() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or(0);
    let secs = millis.div_euclid(1000);
    let ms = millis.rem_euclid(1000) as u32;
    let days = secs.div_euclid(86_400);
    let sod = secs.rem_euclid(86_400);
    let hour = sod / 3_600;
    let minute = (sod % 3_600) / 60;
    let second = sod % 60;
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{ms:03}Z")
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year, m, d)
}

fn next_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}-{}", std::process::id())
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn row_to_task(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        priority: row.get(4)?,
        category: row.get(5)?,
        due_date: row.get(6)?,
        marker: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn row_to_todo(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoRecord> {
    let done: i64 = row.get(3)?;
    Ok(TodoRecord {
        id: row.get(0)?,
        task_id: row.get(1)?,
        title: row.get(2)?,
        done: done != 0,
        due_date: row.get(4)?,
        marker: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn get_task(store: &UserTaskStore, id: &str) -> Result<TaskRecord, String> {
    let conn = store.conn()?;
    conn.query_row(
        "SELECT id, title, description, status, priority, category, due_date, marker, created_at, updated_at
         FROM user_tasks WHERE id = ?1",
        params![id],
        row_to_task,
    )
    .optional()
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "task not found".to_string())
}

fn get_todo(store: &UserTaskStore, id: &str) -> Result<TodoRecord, String> {
    let conn = store.conn()?;
    conn.query_row(
        "SELECT id, task_id, title, done, due_date, marker, created_at, updated_at
         FROM user_todos WHERE id = ?1",
        params![id],
        row_to_todo,
    )
    .optional()
    .map_err(|error| error.to_string())?
    .ok_or_else(|| "todo not found".to_string())
}

pub fn init(app: &AppHandle) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("tasks");
    let store = UserTaskStore::open(root.join("tasks.sqlite"))?;
    app.manage(store);
    Ok(())
}

#[tauri::command]
pub fn user_task_list(store: tauri::State<'_, UserTaskStore>) -> Result<Vec<TaskRecord>, String> {
    let conn = store.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, description, status, priority, category, due_date, marker, created_at, updated_at
             FROM user_tasks ORDER BY updated_at DESC, created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], row_to_task)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn user_task_create(
    store: tauri::State<'_, UserTaskStore>,
    payload: TaskPayload,
) -> Result<TaskRecord, String> {
    let now = now_iso();
    let record = TaskRecord {
        id: next_id("task"),
        title: payload.title.trim().to_string(),
        description: payload.description.trim().to_string(),
        status: payload.status,
        priority: payload.priority,
        category: payload.category.trim().to_string(),
        due_date: normalize_optional(payload.due_date),
        marker: payload.marker.trim().to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = store.conn()?;
    conn.execute(
        "INSERT INTO user_tasks (id, title, description, status, priority, category, due_date, marker, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            record.id,
            record.title,
            record.description,
            record.status,
            record.priority,
            record.category,
            record.due_date,
            record.marker,
            record.created_at,
            record.updated_at,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(record)
}

#[tauri::command]
pub fn user_task_update(
    store: tauri::State<'_, UserTaskStore>,
    id: String,
    payload: TaskPayload,
) -> Result<TaskRecord, String> {
    let existing = get_task(&store, &id)?;
    let record = TaskRecord {
        id: existing.id,
        title: payload.title.trim().to_string(),
        description: payload.description.trim().to_string(),
        status: payload.status,
        priority: payload.priority,
        category: payload.category.trim().to_string(),
        due_date: normalize_optional(payload.due_date),
        marker: payload.marker.trim().to_string(),
        created_at: existing.created_at,
        updated_at: now_iso(),
    };
    let conn = store.conn()?;
    conn.execute(
        "UPDATE user_tasks SET title=?2, description=?3, status=?4, priority=?5, category=?6, due_date=?7, marker=?8, updated_at=?9
         WHERE id=?1",
        params![
            record.id,
            record.title,
            record.description,
            record.status,
            record.priority,
            record.category,
            record.due_date,
            record.marker,
            record.updated_at,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(record)
}

#[tauri::command]
pub fn user_task_delete(store: tauri::State<'_, UserTaskStore>, id: String) -> Result<(), String> {
    let conn = store.conn()?;
    conn.execute("DELETE FROM user_tasks WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn user_todo_list(store: tauri::State<'_, UserTaskStore>) -> Result<Vec<TodoRecord>, String> {
    let conn = store.conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, task_id, title, done, due_date, marker, created_at, updated_at
             FROM user_todos ORDER BY updated_at DESC, created_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = stmt
        .query_map([], row_to_todo)
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn user_todo_create(
    store: tauri::State<'_, UserTaskStore>,
    payload: TodoPayload,
) -> Result<TodoRecord, String> {
    let now = now_iso();
    let record = TodoRecord {
        id: next_id("todo"),
        task_id: normalize_optional(payload.task_id),
        title: payload.title.trim().to_string(),
        done: false,
        due_date: normalize_optional(payload.due_date),
        marker: payload.marker.trim().to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    let conn = store.conn()?;
    conn.execute(
        "INSERT INTO user_todos (id, task_id, title, done, due_date, marker, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            record.id,
            record.task_id,
            record.title,
            if record.done { 1i64 } else { 0i64 },
            record.due_date,
            record.marker,
            record.created_at,
            record.updated_at,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(record)
}

#[tauri::command]
pub fn user_todo_update(
    store: tauri::State<'_, UserTaskStore>,
    id: String,
    payload: TodoUpdatePayload,
) -> Result<TodoRecord, String> {
    let existing = get_todo(&store, &id)?;
    let record = TodoRecord {
        id: existing.id,
        task_id: normalize_optional(payload.task_id),
        title: payload.title.trim().to_string(),
        done: payload.done,
        due_date: normalize_optional(payload.due_date),
        marker: payload.marker.trim().to_string(),
        created_at: existing.created_at,
        updated_at: now_iso(),
    };
    let conn = store.conn()?;
    conn.execute(
        "UPDATE user_todos SET task_id=?2, title=?3, done=?4, due_date=?5, marker=?6, updated_at=?7
         WHERE id=?1",
        params![
            record.id,
            record.task_id,
            record.title,
            if record.done { 1i64 } else { 0i64 },
            record.due_date,
            record.marker,
            record.updated_at,
        ],
    )
    .map_err(|error| error.to_string())?;
    Ok(record)
}

#[tauri::command]
pub fn user_todo_delete(store: tauri::State<'_, UserTaskStore>, id: String) -> Result<(), String> {
    let conn = store.conn()?;
    conn.execute("DELETE FROM user_todos WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}
