use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use uuid::Uuid;

use crate::{
    core::{
        errors::TermifError,
        models::{SshHostEntry, SshHostGroup, SshHostSource},
    },
    persistence::Persistence,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, Default)]
pub struct HostState {
    pub groups: Vec<SshHostGroup>,
    pub managed_hosts: Vec<SshHostEntry>,
    #[serde(default)]
    pub imported_alias_overrides: HashMap<String, String>,
    #[serde(default)]
    pub imported_group_overrides: HashMap<String, String>,
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
        host.original_alias = None;

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
        let mut hosts = parse_ssh_config().unwrap_or_default();
        let state = self.state.lock().expect("host state lock poisoned").clone();

        for host in &mut hosts {
            let source_alias = host
                .original_alias
                .as_deref()
                .unwrap_or(host.alias.as_str())
                .to_string();

            if let Some(alias_override) = state.imported_alias_overrides.get(&source_alias) {
                host.alias = alias_override.clone();
            }

            if let Some(group_override) = state.imported_group_overrides.get(&source_alias) {
                host.group_id = Some(group_override.clone());
            }
        }

        hosts
    }

    pub fn set_imported_host_overrides(
        &self,
        source_alias: &str,
        local_alias: Option<String>,
        group_id: Option<String>,
    ) -> Result<(), TermifError> {
        let source_alias = source_alias.trim();
        if source_alias.is_empty() {
            return Err(TermifError::Internal(
                "source alias is required".to_string(),
            ));
        }

        let mut state = self.state.lock().expect("host state lock poisoned");

        if let Some(next_alias) = local_alias.map(|v| v.trim().to_string()) {
            if next_alias.is_empty() || next_alias == source_alias {
                state.imported_alias_overrides.remove(source_alias);
            } else {
                state
                    .imported_alias_overrides
                    .insert(source_alias.to_string(), next_alias);
            }
        } else {
            state.imported_alias_overrides.remove(source_alias);
        }

        if let Some(next_group) = group_id.map(|v| v.trim().to_string()) {
            if next_group.is_empty() {
                state.imported_group_overrides.remove(source_alias);
            } else {
                state
                    .imported_group_overrides
                    .insert(source_alias.to_string(), next_group);
            }
        } else {
            state.imported_group_overrides.remove(source_alias);
        }

        self.persistence.save("hosts.json", &*state)?;
        Ok(())
    }

    pub fn rename_imported_host_in_config(
        &self,
        source_alias: &str,
        new_alias: &str,
    ) -> Result<(), TermifError> {
        let source_alias = source_alias.trim();
        let new_alias = new_alias.trim();
        if source_alias.is_empty() || new_alias.is_empty() {
            return Err(TermifError::Internal(
                "both current alias and new alias are required".to_string(),
            ));
        }

        if source_alias == new_alias {
            return Ok(());
        }

        let path = ssh_config_path()?;
        let content = fs::read_to_string(&path)?;
        let mut changed = 0usize;

        let lines: Vec<String> = content
            .lines()
            .map(|line| {
                if is_exact_host_alias_line(line, source_alias) {
                    changed += 1;
                    rewrite_host_alias_line(line, new_alias)
                } else {
                    line.to_string()
                }
            })
            .collect();

        if changed == 0 {
            return Err(TermifError::Internal(format!(
                "host alias '{}' not found in ~/.ssh/config",
                source_alias
            )));
        }

        if changed > 1 {
            return Err(TermifError::Internal(format!(
                "host alias '{}' is ambiguous in ~/.ssh/config",
                source_alias
            )));
        }

        fs::write(&path, lines.join("\n"))?;

        let mut state = self.state.lock().expect("host state lock poisoned");
        if let Some(alias_override) = state.imported_alias_overrides.remove(source_alias) {
            if alias_override != new_alias {
                state
                    .imported_alias_overrides
                    .insert(new_alias.to_string(), alias_override);
            }
        }
        if let Some(group_override) = state.imported_group_overrides.remove(source_alias) {
            state
                .imported_group_overrides
                .insert(new_alias.to_string(), group_override);
        }
        self.persistence.save("hosts.json", &*state)?;

        Ok(())
    }

    pub fn export_managed_host_to_config(
        &self,
        host_id: &str,
        overwrite_existing: bool,
    ) -> Result<(), TermifError> {
        let state = self.state.lock().expect("host state lock poisoned").clone();
        let host = state
            .managed_hosts
            .iter()
            .find(|entry| entry.id == host_id)
            .cloned()
            .ok_or_else(|| TermifError::Internal("managed host not found".to_string()))?;

        let path = ssh_config_path()?;
        let content = fs::read_to_string(&path).unwrap_or_default();
        let mut lines: Vec<String> = content.lines().map(|line| line.to_string()).collect();

        let mut start_idx: Option<usize> = None;
        for (idx, line) in lines.iter().enumerate() {
            if is_exact_host_alias_line(line, &host.alias) {
                start_idx = Some(idx);
                break;
            }
        }

        let block_lines = render_host_block(&host);

        if let Some(start) = start_idx {
            if !overwrite_existing {
                return Err(TermifError::Internal(format!(
                    "host '{}' already exists in ~/.ssh/config",
                    host.alias
                )));
            }

            let mut end = lines.len();
            for (idx, line) in lines.iter().enumerate().skip(start + 1) {
                if is_host_header_line(line) {
                    end = idx;
                    break;
                }
            }

            lines.splice(start..end, block_lines);
        } else {
            if !lines.is_empty() && !lines.last().is_some_and(|line| line.trim().is_empty()) {
                lines.push(String::new());
            }
            lines.extend(block_lines);
        }

        fs::write(path, lines.join("\n"))?;
        Ok(())
    }
}

fn parse_ssh_config() -> Result<Vec<SshHostEntry>, TermifError> {
    let ssh_config = ssh_config_path()?;
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
                password: None,
                group_id: None,
                original_alias: current_alias.clone(),
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

fn ssh_config_path() -> Result<PathBuf, TermifError> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|e| TermifError::Internal(e.to_string()))?;

    let ssh_dir = home.join(".ssh");
    if !ssh_dir.exists() {
        fs::create_dir_all(&ssh_dir)?;
    }

    Ok(ssh_dir.join("config"))
}

fn is_host_header_line(line: &str) -> bool {
    line.trim_start().to_ascii_lowercase().starts_with("host ")
}

fn is_exact_host_alias_line(line: &str, alias: &str) -> bool {
    let trimmed = line.trim_start();
    let mut parts = trimmed.split_whitespace();
    let key = parts.next().unwrap_or_default();
    if !key.eq_ignore_ascii_case("host") {
        return false;
    }

    let values: Vec<&str> = parts.collect();
    values.len() == 1 && values[0] == alias
}

fn rewrite_host_alias_line(line: &str, next_alias: &str) -> String {
    let indent = line
        .chars()
        .take_while(|ch| ch.is_whitespace())
        .collect::<String>();
    format!("{}Host {}", indent, next_alias)
}

fn render_host_block(host: &SshHostEntry) -> Vec<String> {
    let mut lines = vec![format!("Host {}", host.alias)];
    lines.push(format!("  HostName {}", host.host_name));

    if let Some(user) = host.user.as_deref().filter(|v| !v.trim().is_empty()) {
        lines.push(format!("  User {}", user.trim()));
    }

    if let Some(port) = host.port.filter(|value| *value > 0) {
        lines.push(format!("  Port {}", port));
    }

    if let Some(identity) = host
        .identity_file
        .as_deref()
        .filter(|v| !v.trim().is_empty())
    {
        lines.push(format!("  IdentityFile {}", identity.trim()));
    }

    lines
}
