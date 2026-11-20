use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

const TABLES: [&str; 8] = [
    "runs",
    "tasks",
    "agents",
    "workspaces",
    "assignments",
    "approvals",
    "messages",
    "events",
];

pub struct OrchestratorStore {
    conn: Mutex<Connection>,
}

impl OrchestratorStore {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
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
             CREATE TABLE IF NOT EXISTS runs (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS tasks (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS agents (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS workspaces (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS assignments (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS approvals (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS messages (
               id TEXT PRIMARY KEY, run_id TEXT NOT NULL, state TEXT NOT NULL,
               data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS events (
               seq INTEGER PRIMARY KEY, run_id TEXT NOT NULL, task_id TEXT NOT NULL,
               state TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL,
               updated_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_tasks_run ON tasks(run_id);
             CREATE INDEX IF NOT EXISTS idx_events_run ON events(run_id);",
        )
        .map_err(|error| error.to_string())
    }

    fn validate_table(table: &str) -> Result<&'static str, String> {
        TABLES
            .iter()
            .find(|candidate| **candidate == table)
            .copied()
            .ok_or_else(|| format!("unknown orchestrator table {}", table))
    }

    pub fn upsert(
        &self,
        table: &str,
        id: &str,
        run_id: &str,
        state: &str,
        data: &Value,
    ) -> Result<Value, String> {
        let table = Self::validate_table(table)?;
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        let serialized = serde_json::to_string(data).map_err(|error| error.to_string())?;
        let timestamp = now();
        if table == "events" {
            let seq = data
                .get("sequence")
                .and_then(Value::as_i64)
                .ok_or_else(|| "event missing sequence".to_string())?;
            let task_id = data
                .get("taskId")
                .and_then(Value::as_str)
                .unwrap_or("");
            conn.execute(
                "INSERT INTO events(seq, run_id, task_id, state, data, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(seq) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                params![seq, run_id, task_id, state, serialized, timestamp, timestamp],
            )
            .map_err(|error| error.to_string())?;
            return Ok(data.clone());
        }
        conn.execute(
            &format!(
                "INSERT INTO {table}(id, run_id, state, data, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET state=excluded.state, data=excluded.data,
                 updated_at=excluded.updated_at"
            ),
            params![id, run_id, state, serialized, timestamp, timestamp],
        )
        .map_err(|error| error.to_string())?;
        Ok(data.clone())
    }

    pub fn get(&self, table: &str, id: &str) -> Result<Option<Value>, String> {
        let table = Self::validate_table(table)?;
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        let sql = if table == "events" {
            "SELECT data FROM events WHERE seq = ?1".to_string()
        } else {
            format!("SELECT data FROM {table} WHERE id = ?1")
        };
        let mut statement = conn.prepare(&sql).map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![id], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        for row in rows {
            let raw = row.map_err(|error| error.to_string())?;
            return serde_json::from_str(&raw).map(Some).map_err(|error| error.to_string());
        }
        Ok(None)
    }

    pub fn remove(&self, table: &str, id: &str) -> Result<(), String> {
        let table = Self::validate_table(table)?;
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        let sql = if table == "events" {
            "DELETE FROM events WHERE seq = ?1".to_string()
        } else {
            format!("DELETE FROM {table} WHERE id = ?1")
        };
        conn.execute(&sql, params![id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn next_sequence(&self, _run_id: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        let value: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM events",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        Ok(value)
    }

    pub fn snapshot(&self) -> Result<Value, String> {
        let mut result = json!({
            "runs": [], "tasks": [], "agents": [], "workspaces": [],
            "assignments": [], "events": [], "approvals": [], "messages": []
        });
        let conn = self.conn.lock().map_err(|error| error.to_string())?;
        for table in TABLES {
            let sql = if table == "events" {
                "SELECT data FROM events ORDER BY seq ASC".to_string()
            } else {
                format!("SELECT data FROM {table} ORDER BY created_at ASC")
            };
            let mut statement = conn.prepare(&sql).map_err(|error| error.to_string())?;
            let rows = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|error| error.to_string())?;
            let mut values = Vec::new();
            for row in rows {
                let raw = row.map_err(|error| error.to_string())?;
                let value: Value =
                    serde_json::from_str(&raw).map_err(|error| error.to_string())?;
                values.push(value);
            }
            if let Some(array) = result.get_mut(table).and_then(Value::as_array_mut) {
                *array = values;
            }
        }
        Ok(result)
    }

    pub fn reconcile(&self, live_sessions: &HashSet<String>) -> Result<usize, String> {
        let mut tasks: Vec<(String, Value)> = Vec::new();
        {
            let conn = self.conn.lock().map_err(|error| error.to_string())?;
            let mut statement = conn
                .prepare("SELECT id, data FROM tasks")
                .map_err(|error| error.to_string())?;
            let rows = statement
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|error| error.to_string())?;
            for row in rows {
                let (id, raw) = row.map_err(|error| error.to_string())?;
                let value: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
                tasks.push((id, value));
            }
        }
        let mut changed = 0;
        for (id, mut task) in tasks {
            let status = task
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if !["running", "assigned", "validating", "waiting", "needs_input"].contains(&status.as_str())
            {
                continue;
            }
            let session = task
                .get("ownerSessionId")
                .and_then(Value::as_str)
                .unwrap_or("");
            if live_sessions.contains(session) {
                continue;
            }
            task["status"] = json!("failed");
            task["blocker"] = json!("Recovered after process or app restart");
            task["updatedAt"] = json!(now());
            let run_id = task
                .get("runId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            self.upsert("tasks", &id, &run_id, "failed", &task)?;
            changed += 1;
        }
        Ok(changed)
    }
}

pub fn now() -> String {
    chrono_like_timestamp()
}

fn chrono_like_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let days = seconds.div_euclid(86_400);
    let remainder = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year,
        month,
        day,
        remainder / 3_600,
        (remainder % 3_600) / 60,
        remainder % 60
    )
}
