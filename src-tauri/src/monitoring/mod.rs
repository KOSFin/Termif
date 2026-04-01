use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

use tauri::{AppHandle, Emitter};

use crate::{
    core::{errors::TermifError, models::SystemStatsDto},
};

const REACH_SEP: &str = "===REACH_SEP===";
const MONITORING_EVENT_PREFIX: &str = "monitoring-";
const MONITORING_INTERVAL: Duration = Duration::from_secs(3);
const SSH_MONITORING_SCRIPT: &str = "grep '^cpu ' /proc/stat 2>/dev/null; sleep 0.5; grep '^cpu ' /proc/stat 2>/dev/null; echo '===REACH_SEP==='; cat /proc/meminfo; echo '===REACH_SEP==='; df -P /; echo '===REACH_SEP==='; w -hs || who";

#[derive(Clone, Default)]
pub struct MonitoringStore {
    latest: Arc<Mutex<HashMap<String, SystemStatsDto>>>,
    tasks: Arc<Mutex<HashMap<String, tauri::async_runtime::JoinHandle<()>>>>,
}

impl MonitoringStore {
    pub fn start_loop(&self, connection_id: String, handle: String, app_handle: AppHandle) {
        self.stop_loop(&connection_id);

        let latest = Arc::clone(&self.latest);
        let loop_connection_id = connection_id.clone();
        let task = tauri::async_runtime::spawn(async move {
            monitoring_loop(loop_connection_id, handle, app_handle, latest).await;
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

    pub fn get_latest(&self, connection_id: &str) -> SystemStatsDto {
        self.latest
            .lock()
            .expect("monitoring latest lock poisoned")
            .get(connection_id)
            .cloned()
            .unwrap_or_default()
    }
}

pub async fn monitoring_loop(
    connection_id: String,
    handle: String,
    app_handle: AppHandle,
    latest: Arc<Mutex<HashMap<String, SystemStatsDto>>>,
) {
    let mut ticker = tokio::time::interval(MONITORING_INTERVAL);

    loop {
        ticker.tick().await;

        if let Ok(stats) = collect_system_stats(&handle).await {
            {
                let mut lock = latest.lock().expect("monitoring latest lock poisoned");
                lock.insert(connection_id.clone(), stats.clone());
            }

            let event_name = format!("{}{}", MONITORING_EVENT_PREFIX, connection_id);
            let _ = app_handle.emit(&event_name, &stats);
        }
    }
}

async fn collect_system_stats(handle: &str) -> Result<SystemStatsDto, TermifError> {
    let output = tokio::process::Command::new("ssh")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=4")
        .arg(handle)
        .arg(SSH_MONITORING_SCRIPT)
        .output()
        .await?;

    if !output.status.success() {
        return Err(TermifError::Internal(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    Ok(parse_system_stats(&String::from_utf8_lossy(&output.stdout)))
}

fn parse_system_stats(output: &str) -> SystemStatsDto {
    let sections: Vec<&str> = output.split(REACH_SEP).collect();
    let cpu_section = sections.first().copied().unwrap_or_default();
    let meminfo_section = sections.get(1).copied().unwrap_or_default();
    let disk_section = sections.get(2).copied().unwrap_or_default();
    let users_section = sections.get(3).copied().unwrap_or_default();

    SystemStatsDto {
        cpu: parse_cpu_percent(cpu_section),
        ram: parse_ram_percent(meminfo_section),
        disk: parse_disk_percent(disk_section),
        users: parse_users_count(users_section),
    }
}

fn parse_cpu_percent(cpu_section: &str) -> Option<f32> {
    let mut samples = cpu_section
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("cpu "))
        .filter_map(parse_cpu_snapshot);

    let first = samples.next()?;
    let second = samples.next()?;

    let total_delta = second.total.saturating_sub(first.total);
    if total_delta == 0 {
        return None;
    }

    let idle_delta = second.idle.saturating_sub(first.idle);
    let busy_delta = total_delta.saturating_sub(idle_delta);
    let percent = (busy_delta as f32 / total_delta as f32) * 100.0;
    Some(percent.clamp(0.0, 100.0))
}

fn parse_ram_percent(meminfo_section: &str) -> Option<f32> {
    let mut mem_total_kb: Option<u64> = None;
    let mut mem_available_kb: Option<u64> = None;

    for line in meminfo_section.lines() {
        let Some((key, raw)) = line.split_once(':') else {
            continue;
        };
        let value_kb = raw
            .split_whitespace()
            .next()
            .and_then(|v| v.parse::<u64>().ok());

        match key.trim() {
            "MemTotal" => mem_total_kb = value_kb,
            "MemAvailable" => mem_available_kb = value_kb,
            _ => {}
        }
    }

    let total = mem_total_kb?;
    let available = mem_available_kb?;
    if total == 0 {
        return None;
    }

    let used = total.saturating_sub(available);
    Some(((used as f32 / total as f32) * 100.0).clamp(0.0, 100.0))
}

fn parse_disk_percent(disk_section: &str) -> Option<f32> {
    for line in disk_section.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if line.starts_with("Filesystem") {
            continue;
        }

        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }

        if cols[5] == "/" {
            return parse_percent_value(cols[4]);
        }
    }

    None
}

fn parse_users_count(users_section: &str) -> Option<u32> {
    Some(users_section.lines().filter(|line| !line.trim().is_empty()).count() as u32)
}

fn parse_percent_value(raw: &str) -> Option<f32> {
    raw.trim_end_matches('%').parse::<f32>().ok()
}

#[derive(Debug, Clone, Copy)]
struct CpuSnapshot {
    total: u64,
    idle: u64,
}

fn parse_cpu_snapshot(line: &str) -> Option<CpuSnapshot> {
    let mut cols = line.split_whitespace();
    let head = cols.next()?;
    if head != "cpu" {
        return None;
    }

    let values: Vec<u64> = cols.filter_map(|x| x.parse::<u64>().ok()).collect();
    if values.len() < 4 {
        return None;
    }

    let idle = values.get(3).copied().unwrap_or(0) + values.get(4).copied().unwrap_or(0);
    let total = values.iter().sum();

    Some(CpuSnapshot { total, idle })
}
