use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
};

use uuid::Uuid;

use crate::{
    core::{
        errors::TermifError,
        models::{SshHostEntry, SshHostGroup, SshHostSource, SshRemoteStatusDto},
    },
    persistence::Persistence,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct HostState {
    pub groups: Vec<SshHostGroup>,
    pub managed_hosts: Vec<SshHostEntry>,
}

#[derive(Clone)]
pub struct HostStore {
    persistence: Persistence,
    state: Arc<Mutex<HostState>>,
}

impl HostStore {
    pub fn new(persistence: Persistence) -> Result<Self, TermifError> {
        let state: HostState = persistence.load_or_default("hosts.json")?;
        Ok(Self {
            persistence,
            state: Arc::new(Mutex::new(state)),
        })
    }

    pub fn list_groups(&self) -> Vec<SshHostGroup> {
        self.state
            .lock()
            .expect("host state lock poisoned")
            .groups
            .clone()
    }

    pub fn list_managed_hosts(&self) -> Vec<SshHostEntry> {
        self.state
            .lock()
            .expect("host state lock poisoned")
            .managed_hosts
            .clone()
    }

    pub fn save_managed_host(&self, mut host: SshHostEntry) -> Result<SshHostEntry, TermifError> {
        if host.id.is_empty() {
            host.id = Uuid::new_v4().to_string();
        }
        host.source = SshHostSource::Managed;

        let mut state = self.state.lock().expect("host state lock poisoned");
        if let Some(existing) = state.managed_hosts.iter_mut().find(|x| x.id == host.id) {
            *existing = host.clone();
        } else {
            state.managed_hosts.push(host.clone());
        }
        self.persistence.save("hosts.json", &*state)?;
        Ok(host)
    }

    pub fn delete_managed_host(&self, host_id: &str) -> Result<(), TermifError> {
        let mut state = self.state.lock().expect("host state lock poisoned");
        state.managed_hosts.retain(|x| x.id != host_id);
        self.persistence.save("hosts.json", &*state)?;
        Ok(())
    }

    pub fn create_group(&self, name: String) -> Result<SshHostGroup, TermifError> {
        let mut state = self.state.lock().expect("host state lock poisoned");
        let group = SshHostGroup {
            id: Uuid::new_v4().to_string(),
            name,
            order: state.groups.len() as i32,
        };
        state.groups.push(group.clone());
        self.persistence.save("hosts.json", &*state)?;
        Ok(group)
    }

    pub fn rename_group(&self, group_id: &str, name: String) -> Result<(), TermifError> {
        let next_name = name.trim();
        if next_name.is_empty() {
            return Err(TermifError::Internal(
                "group name cannot be empty".to_string(),
            ));
        }

        let mut state = self.state.lock().expect("host state lock poisoned");
        let group = state
            .groups
            .iter_mut()
            .find(|g| g.id == group_id)
            .ok_or_else(|| TermifError::Internal("group not found".to_string()))?;

        group.name = next_name.to_string();
        self.persistence.save("hosts.json", &*state)?;
        Ok(())
    }

    pub fn delete_group(&self, group_id: &str) -> Result<(), TermifError> {
        let mut state = self.state.lock().expect("host state lock poisoned");
        state.groups.retain(|g| g.id != group_id);
        for host in &mut state.managed_hosts {
            if host.group_id.as_deref() == Some(group_id) {
                host.group_id = None;
            }
        }
        self.persistence.save("hosts.json", &*state)?;
        Ok(())
    }

    pub fn import_ssh_config_hosts(&self) -> Vec<SshHostEntry> {
        parse_ssh_config().unwrap_or_default()
    }
}

fn parse_ssh_config() -> Result<Vec<SshHostEntry>, TermifError> {
    let home = std::env::var("USERPROFILE")
        .map(PathBuf::from)
        .map_err(|e| TermifError::Internal(e.to_string()))?;
    let ssh_config = home.join(".ssh").join("config");
    if !ssh_config.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(ssh_config)?;
    let mut current_alias: Option<String> = None;
    let mut host_map: HashMap<String, SshHostEntry> = HashMap::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let mut parts = line.split_whitespace();
        let key = parts.next().unwrap_or_default().to_lowercase();
        let value = parts.collect::<Vec<_>>().join(" ");

        if key == "host" {
            if value.contains('*') || value.contains('?') {
                current_alias = None;
                continue;
            }
            current_alias = Some(value.clone());
            host_map.entry(value.clone()).or_insert(SshHostEntry {
                id: format!("imported-{}", value),
                alias: value.clone(),
                host_name: value,
                user: None,
                port: None,
                identity_file: None,
                group_id: None,
                source: SshHostSource::Imported,
            });
            continue;
        }

        if let Some(alias) = &current_alias {
            if let Some(host) = host_map.get_mut(alias) {
                match key.as_str() {
                    "hostname" => host.host_name = value,
                    "user" => host.user = Some(value),
                    "port" => host.port = value.parse::<u16>().ok(),
                    "identityfile" => host.identity_file = Some(value),
                    _ => {}
                }
            }
        }
    }

    Ok(host_map.into_values().collect())
}

pub fn fetch_remote_status(
    alias: &str,
    include_resources: bool,
    include_time: bool,
) -> Result<SshRemoteStatusDto, TermifError> {
    if !include_resources && !include_time {
        return Ok(SshRemoteStatusDto::default());
    }

    let mut script_parts: Vec<&str> = Vec::new();
    if include_time {
        script_parts.push("TS=$(date +%s 2>/dev/null); [ -n \"$TS\" ] && echo \"ts=$TS\"");
    }
    if include_resources {
        script_parts.push("LOAD=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null); [ -n \"$LOAD\" ] && echo \"load=$LOAD\"");
        script_parts.push(
            "MT=$(grep -i '^MemTotal:' /proc/meminfo 2>/dev/null | awk '{print $2}'); [ -n \"$MT\" ] && echo \"mem_total_kb=$MT\""
        );
        script_parts.push(
            "MA=$(grep -i '^MemAvailable:' /proc/meminfo 2>/dev/null | awk '{print $2}'); [ -n \"$MA\" ] && echo \"mem_avail_kb=$MA\""
        );
    }

    let script = script_parts.join("; ");

    let output = Command::new("ssh")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=4")
        .arg(alias)
        .arg(script)
        .output()?;

    if !output.status.success() {
        return Err(TermifError::Internal(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut status = SshRemoteStatusDto::default();
    let mut mem_total_kb: Option<u64> = None;
    let mut mem_avail_kb: Option<u64> = None;

    for line in stdout.lines() {
        if let Some((key, value)) = line.split_once('=') {
            let v = value.trim();
            match key.trim() {
                "ts" => status.server_epoch_seconds = v.parse::<u64>().ok(),
                "load" => status.load_1m = v.parse::<f32>().ok(),
                "mem_total_kb" => mem_total_kb = v.parse::<u64>().ok(),
                "mem_avail_kb" => mem_avail_kb = v.parse::<u64>().ok(),
                _ => {}
            }
        }
    }

    if let (Some(total_kb), Some(avail_kb)) = (mem_total_kb, mem_avail_kb) {
        if total_kb > 0 {
            let used_kb = total_kb.saturating_sub(avail_kb);
            status.memory_total_mb = Some(total_kb / 1024);
            status.memory_used_mb = Some(used_kb / 1024);
            status.memory_percent = Some((used_kb as f32 / total_kb as f32) * 100.0);
        }
    }

    Ok(status)
}
