use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, Webview};

#[derive(Clone)]
pub struct BridgeGrant {
    pub token: String,
    pub tab_label: String,
    pub agent_id: String,
    pub expires_at: i64,
    pub port: u16,
}

pub struct BrowserBridgeState {
    pub grants: Arc<Mutex<HashMap<String, BridgeGrant>>>,
    pub stops: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    pub inspects: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl Default for BrowserBridgeState {
    fn default() -> Self {
        Self {
            grants: Arc::new(Mutex::new(HashMap::new())),
            stops: Arc::new(Mutex::new(HashMap::new())),
            inspects: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn random_token() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{:x}{:x}", nanos, std::process::id())
}

fn js_string(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string())
}

fn eval_json(webview: &Webview, expression: &str) -> Result<Value, String> {
    let (sender, receiver) = mpsc::channel();
    webview
        .eval_with_callback(expression, move |result| {
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;
    let raw = receiver
        .recv_timeout(Duration::from_secs(6))
        .map_err(|_| "webview evaluation timed out".to_string())?;
    serde_json::from_str::<Value>(&raw).or_else(|_| Ok(Value::String(raw)))
}

fn arg_string(args: &Value, key: &str) -> String {
    args.get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn arg_number(args: &Value, key: &str, default: f64) -> f64 {
    args.get(key).and_then(Value::as_f64).unwrap_or(default)
}

fn read_op(app: &AppHandle, tab_label: &str, args: &Value) -> Result<Value, String> {
    let webview = app
        .get_webview(tab_label)
        .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
    let limit = arg_number(args, "maxChars", 20000.0) as i64;
    let expression = format!(
        "(() => {{ try {{ const text = document.body ? document.body.innerText : ''; return String(text).slice(0, {}); }} catch (error) {{ return 'ERROR: ' + error.message; }} }})()",
        limit
    );
    Ok(json!({ "ok": true, "text": eval_json(&webview, &expression)? }))
}

fn click_op(app: &AppHandle, tab_label: &str, args: &Value) -> Result<Value, String> {
    let webview = app
        .get_webview(tab_label)
        .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
    let selector = arg_string(args, "selector");
    if selector.is_empty() {
        return Err("selector is required".to_string());
    }
    let expression = format!(
        "(() => {{ try {{ const element = document.querySelector({}); if (!element) return {{ok:false,error:'element not found'}}; element.click(); return {{ok:true}}; }} catch (error) {{ return {{ok:false,error:String(error.message)}}; }} }})()",
        js_string(&selector)
    );
    eval_json(&webview, &expression)
}

fn type_op(app: &AppHandle, tab_label: &str, args: &Value) -> Result<Value, String> {
    let webview = app
        .get_webview(tab_label)
        .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
    let selector = arg_string(args, "selector");
    let text = arg_string(args, "text");
    if selector.is_empty() {
        return Err("selector is required".to_string());
    }
    let expression = format!(
        "(() => {{ try {{ const element = document.querySelector({}); if (!element) return {{ok:false,error:'element not found'}}; const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set; if (setter) setter.call(element, {}); else element.value = {}; element.dispatchEvent(new Event('input', {{bubbles:true}})); element.dispatchEvent(new Event('change', {{bubbles:true}})); return {{ok:true}}; }} catch (error) {{ return {{ok:false,error:String(error.message)}}; }} }})()",
        js_string(&selector),
        js_string(&text),
        js_string(&text)
    );
    eval_json(&webview, &expression)
}

fn scroll_op(app: &AppHandle, tab_label: &str, args: &Value) -> Result<Value, String> {
    let webview = app
        .get_webview(tab_label)
        .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
    let x = arg_number(args, "x", 0.0);
    let y = arg_number(args, "y", 600.0);
    let expression = format!(
        "(() => {{ window.scrollBy({}, {}); return {{ok:true}}; }})()",
        x, y
    );
    eval_json(&webview, &expression)
}

fn wait_op(app: &AppHandle, tab_label: &str, args: &Value) -> Result<Value, String> {
    let selector = arg_string(args, "selector");
    let timeout = arg_number(args, "timeoutMs", 5000.0) as u64;
    let started = SystemTime::now();
    loop {
        let webview = app
            .get_webview(tab_label)
            .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
        let expression = format!(
            "(() => {{ try {{ return !!document.querySelector({}); }} catch (error) {{ return false; }} }})()",
            js_string(&selector)
        );
        if matches!(eval_json(&webview, &expression)?, Value::Bool(true)) {
            return Ok(json!({ "ok": true }));
        }
        if started.elapsed().unwrap_or_default().as_millis() >= timeout as u128 {
            return Ok(json!({ "ok": false, "error": "timeout waiting for selector" }));
        }
        std::thread::sleep(Duration::from_millis(150));
    }
}

fn inspect_state_op(app: &AppHandle, tab_label: &str) -> Result<Value, String> {
    let webview = app
        .get_webview(tab_label)
        .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
    eval_json(
        &webview,
        "(() => window.__opencliInspect ? (window.__opencliInspect.take() || null) : null)()",
    )
}

pub fn call(
    app: &AppHandle,
    state: &BrowserBridgeState,
    tab_label: &str,
    token: &str,
    op: &str,
    args: &Value,
) -> Result<String, String> {
    let grant = state
        .grants
        .lock()
        .map_err(|error| error.to_string())?
        .get(token)
        .cloned()
        .ok_or_else(|| "invalid browser bridge token".to_string())?;
    if grant.tab_label != tab_label {
        return Err("browser bridge token does not match tab".to_string());
    }
    if grant.expires_at <= now_ms() {
        return Err("browser bridge grant expired".to_string());
    }
    let value = match op {
        "navigate" => {
            let url = arg_string(args, "url");
            let parsed = tauri::Url::parse(&url).map_err(|error| error.to_string())?;
            let webview = app
                .get_webview(tab_label)
                .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
            webview
                .navigate(parsed)
                .map_err(|error| error.to_string())?;
            json!({ "ok": true })
        }
        "read" => read_op(app, tab_label, args)?,
        "click" => click_op(app, tab_label, args)?,
        "type" => type_op(app, tab_label, args)?,
        "scroll" => scroll_op(app, tab_label, args)?,
        "waitFor" => wait_op(app, tab_label, args)?,
        "inspectState" => inspect_state_op(app, tab_label)?,
        "snapshot" => {
            let webview = app
                .get_webview(tab_label)
                .ok_or_else(|| format!("browser tab {} not found", tab_label))?;
            let title = eval_json(&webview, "document.title || ''")?;
            json!({ "ok": true, "url": webview.url().map(|url| url.to_string()).unwrap_or_default(), "title": title })
        }
        _ => return Err(format!("unknown browser tool {}", op)),
    };
    serde_json::to_string(&value).map_err(|error| error.to_string())
}

pub fn start(
    app: &AppHandle,
    state: &BrowserBridgeState,
    tab_label: &str,
    agent_id: &str,
) -> Result<BridgeGrant, String> {
    if app.get_webview(tab_label).is_none() {
        return Err(format!("browser tab {} is not open", tab_label));
    }
    let token = random_token();
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    let grant = BridgeGrant {
        token: token.clone(),
        tab_label: tab_label.to_string(),
        agent_id: agent_id.to_string(),
        expires_at: now_ms() + 30 * 60 * 1000,
        port,
    };
    let stop = Arc::new(AtomicBool::new(false));
    state
        .grants
        .lock()
        .map_err(|error| error.to_string())?
        .insert(token.clone(), grant.clone());
    state
        .stops
        .lock()
        .map_err(|error| error.to_string())?
        .insert(token.clone(), stop.clone());

    let app_handle = app.clone();
    let bridge_state = BrowserBridgeState {
        grants: state.grants.clone(),
        stops: state.stops.clone(),
        inspects: state.inspects.clone(),
    };
    let server_token = token.clone();
    let server_label = tab_label.to_string();
    std::thread::spawn(move || {
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())
            .ok();
        while !stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let mut buffer = [0u8; 65536];
                    let size = stream.read(&mut buffer).unwrap_or(0);
                    let request = String::from_utf8_lossy(&buffer[..size]).to_string();
                    let (status, body) = handle_request(
                        &app_handle,
                        &bridge_state,
                        &server_label,
                        &server_token,
                        &request,
                    );
                    let reason = if status == 200 { "OK" } else { "Forbidden" };
                    let response = format!(
                        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n{}",
                        status,
                        reason,
                        body.len(),
                        body
                    );
                    let _ = stream.write_all(response.as_bytes());
                    let _ = stream.flush();
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(150));
                }
                Err(_) => break,
            }
        }
    });
    Ok(grant)
}

fn handle_request(
    app: &AppHandle,
    state: &BrowserBridgeState,
    tab_label: &str,
    token: &str,
    request: &str,
) -> (u16, String) {
    let first_line = request.lines().next().unwrap_or("");
    let parts: Vec<&str> = first_line.split_whitespace().collect();
    let method = parts.first().copied().unwrap_or("");
    let path = parts.get(1).copied().unwrap_or("");
    let body_start = request.find("\r\n\r\n").map(|index| index + 4).unwrap_or(0);
    let body = if body_start <= request.len() {
        &request[body_start..]
    } else {
        ""
    };
    let tools = json!({
        "tools": [
            {"name":"browser.navigate","description":"Navigate the shared browser tab","input":{"url":"string"}},
            {"name":"browser.read","description":"Read visible page text","input":{"maxChars":"number"}},
            {"name":"browser.click","description":"Click an element by CSS selector","input":{"selector":"string"}},
            {"name":"browser.type","description":"Type text into an element","input":{"selector":"string","text":"string"}},
            {"name":"browser.scroll","description":"Scroll the page","input":{"x":"number","y":"number"}},
            {"name":"browser.waitFor","description":"Wait for a selector","input":{"selector":"string","timeoutMs":"number"}},
            {"name":"browser.inspectState","description":"Take the last inspected element context","input":{}},
            {"name":"browser.snapshot","description":"Get page URL and title","input":{}}
        ]
    });
    if path == "/tools" && method == "GET" {
        return (200, tools.to_string());
    }
    if path != "/call" || method != "POST" {
        return (
            404,
            json!({ "ok": false, "error": "not found" }).to_string(),
        );
    }
    let payload: Value = match serde_json::from_str(body) {
        Ok(value) => value,
        Err(error) => {
            return (
                400,
                json!({ "ok": false, "error": error.to_string() }).to_string(),
            )
        }
    };
    let name = payload
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let args = payload
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));
    match call(app, state, tab_label, token, &name, &args) {
        Ok(result) => (200, result),
        Err(error) => (400, json!({ "ok": false, "error": error }).to_string()),
    }
}

pub fn stop(state: &BrowserBridgeState, token: &str) -> Result<(), String> {
    if let Ok(stops) = state.stops.lock() {
        if let Some(flag) = stops.get(token) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    if let Ok(inspects) = state.inspects.lock() {
        if let Some(flag) = inspects.get(token) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    let mut grants = state.grants.lock().map_err(|error| error.to_string())?;
    grants.remove(token);
    Ok(())
}

pub fn stop_for_tab(state: &BrowserBridgeState, tab_label: &str) -> Result<usize, String> {
    let tokens: Vec<String> = state
        .grants
        .lock()
        .map_err(|error| error.to_string())?
        .values()
        .filter(|grant| grant.tab_label == tab_label)
        .map(|grant| grant.token.clone())
        .collect();
    for token in &tokens {
        stop(state, token)?;
    }
    Ok(tokens.len())
}

