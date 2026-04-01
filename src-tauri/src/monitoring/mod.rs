use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{AppHandle, Emitter};

use crate::{core::models::SystemStatsDto, pty::TerminalManager};

const MONITORING_EVENT_PREFIX: &str = "monitoring-";
const MONITORING_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Clone, Default)]
pub struct MonitoringStore {
    latest: Arc<Mutex<HashMap<String, SystemStatsDto>>>,
    tasks: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
}

impl MonitoringStore {
    pub fn start_loop(
        &self,
        connection_id: String,
        terminal: TerminalManager,
        app_handle: AppHandle,
    ) {
        self.stop_loop(&connection_id);

        let latest = Arc::clone(&self.latest);
        let loop_connection_id = connection_id.clone();
        let task = tauri::async_runtime::spawn(async move {
            monitoring_loop(loop_connection_id, terminal, app_handle, latest).await;
        });

        self.tasks
            .lock()
            .expect("monitoring tasks lock poisoned")
            .insert(connection_id, task);
    }

    pub fn stop_loop(&self, connection_id: &str) {
        if let Some(task) = self
            .tasks
            .lock()
            .expect("monitoring tasks lock poisoned")
            .remove(connection_id)
        {
            task.abort();
        }

        self.latest
            .lock()
            .expect("monitoring latest lock poisoned")
            .remove(connection_id);
    }

    pub fn stop_all(&self) {
        let tasks = {
            let mut lock = self.tasks.lock().expect("monitoring tasks lock poisoned");
            lock.drain().map(|(_, task)| task).collect::<Vec<_>>()
        };

        for task in tasks {
            task.abort();
        }

        self.latest
            .lock()
            .expect("monitoring latest lock poisoned")
            .clear();
    }

    pub fn get_latest(&self, connection_id: &str) -> SystemStatsDto {
        self.latest
            .lock()
            .expect("monitoring latest lock poisoned")
            .get(connection_id)
            .cloned()
            .unwrap_or_default()
    }
}

async fn monitoring_loop(
    connection_id: String,
    terminal: TerminalManager,
    app_handle: AppHandle,
    latest: Arc<Mutex<HashMap<String, SystemStatsDto>>>,
) {
    let mut ticker = tokio::time::interval(MONITORING_INTERVAL);

    loop {
        ticker.tick().await;

        if let Ok(stats) = terminal.fetch_system_stats(&connection_id).await {
            {
                let mut lock = latest.lock().expect("monitoring latest lock poisoned");
                lock.insert(connection_id.clone(), stats.clone());
            }

            let event_name = format!("{}{}", MONITORING_EVENT_PREFIX, connection_id);
            let _ = app_handle.emit(&event_name, &stats);
        }
    }
}
