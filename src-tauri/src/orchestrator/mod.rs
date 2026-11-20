pub mod browser_bridge;
pub mod commands;
pub mod git;
pub mod store;

use crate::PtyState;
use browser_bridge::BrowserBridgeState;
use store::OrchestratorStore;
use tauri::{AppHandle, Manager};

pub fn init(app: &AppHandle) {
    let root = match app.path().app_data_dir() {
        Ok(path) => path.join("orchestrator"),
        Err(error) => {
            eprintln!("orchestrator app data error: {}", error);
            return;
        }
    };
    if let Err(error) = std::fs::create_dir_all(&root) {
        eprintln!("orchestrator directory error: {}", error);
        return;
    }
    match OrchestratorStore::open(root.join("orchestrator.sqlite")) {
        Ok(store) => {
            app.manage(store);
        }
        Err(error) => {
            eprintln!("orchestrator store error: {}", error);
            return;
        }
    }
    app.manage(BrowserBridgeState::default());
    let result = tauri::async_runtime::block_on(commands::orchestrator_recover(
        app.clone(),
        app.state::<OrchestratorStore>(),
        app.state::<PtyState>(),
        app.state::<BrowserBridgeState>(),
    ));
    if let Err(error) = result {
        eprintln!("orchestrator recovery error: {}", error);
    }
}
