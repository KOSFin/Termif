mod core;
mod fs;
mod monitoring;
mod persistence;
mod plugins;
mod pty;
mod sessions;
mod settings;
mod ssh;
mod ui_events;

use std::sync::Arc;

use core::models::{
    AppSettings, PersistedUiState, SessionDto, SshHostEntry, SshHostGroup, SystemStatsDto,
};
use tauri::ipc::Channel;
use tauri::Manager;
use tauri::State;

use crate::{
    fs as fs_ops,
    persistence::Persistence,
    pty::{SshConnectOptions, TerminalManager},
    settings::SettingsStore,
    ssh::HostStore,
};

#[derive(Clone)]
struct AppState {
    terminal: TerminalManager,
    monitoring: monitoring::MonitoringStore,
    hosts: Arc<HostStore>,
    settings: Arc<SettingsStore>,
    persistence: Persistence,
}

#[derive(Debug, serde::Serialize)]
struct SshHostsPayload {
    imported: Vec<SshHostEntry>,
    managed: Vec<SshHostEntry>,
    groups: Vec<SshHostGroup>,
}

#[derive(Debug, serde::Deserialize)]
struct SshConnectOptionsInput {
    alias: String,
    host: String,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    password: Option<String>,
}

// ── Terminal commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn create_local_session(
    shell_profile: Option<String>,
    cwd: Option<String>,
    state: State<'_, AppState>,
) -> Result<SessionDto, String> {
    state
        .terminal
        .spawn_local_session(shell_profile, cwd)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_ssh_session(
    host_alias: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionDto, String> {
    let connect_options =
        resolve_ssh_connect_options(&state.hosts, state.settings.get(), &host_alias);

    let session = state
        .terminal
        .spawn_ssh_session(connect_options)
        .await
        .map_err(|e| e.to_string())?;

    state
        .monitoring
        .start_loop(session.id.clone(), state.terminal.clone(), app.clone());

    Ok(session)
}

#[tauri::command]
async fn create_ssh_session_with_options(
    options: SshConnectOptionsInput,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<SessionDto, String> {
    let settings = state.settings.get();
    let connect_options = SshConnectOptions {
        alias: options.alias.trim().to_string(),
        host: options.host.trim().to_string(),
        user: options
            .user
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        port: options.port.unwrap_or(22),
        identity_file: options
            .identity_file
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        password: options
            .password
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty()),
        connect_timeout_seconds: settings.ssh.connect_timeout_seconds,
    };

    if connect_options.alias.is_empty() {
        return Err("alias is required".to_string());
    }

    if connect_options.host.is_empty() {
        return Err("host is required".to_string());
    }

    let session = state
        .terminal
        .spawn_ssh_session(connect_options)
        .await
        .map_err(|e| e.to_string())?;

    state
        .monitoring
        .start_loop(session.id.clone(), state.terminal.clone(), app.clone());

    Ok(session)
}

/// Attach a push Channel to a terminal session.
/// The channel receives PTY output in real time — no polling needed.
/// Any output buffered since session creation is flushed immediately.
#[tauri::command]
fn stream_terminal_output(
    session_id: String,
    on_data: Channel<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .attach_channel(&session_id, on_data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn send_terminal_input(
    session_id: String,
    data: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .send_input(&session_id, data)
        .map_err(|e| e.to_string())
}

/// Legacy polling read — kept for backward compatibility.
#[tauri::command]
fn read_terminal_output(session_id: String, state: State<'_, AppState>) -> Result<String, String> {
    state
        .terminal
        .read_output(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_terminal(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .resize(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn close_terminal_session(session_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.monitoring.stop_loop(&session_id);
    state
        .terminal
        .close_session(&session_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn fetch_remote_status(
    session_id: String,
    _include_resources: bool,
    _include_time: bool,
    state: State<'_, AppState>,
) -> Result<SystemStatsDto, String> {
    let session = state
        .terminal
        .get_session(&session_id)
        .ok_or_else(|| "session not found".to_string())?;

    if session.ssh_alias.is_none() {
        return Err("status is available only for SSH sessions".to_string());
    }

    Ok(state.monitoring.get_latest(&session_id))
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.monitoring.stop_all();
    state.terminal.close_all_sessions();
    app.exit(0);
    Ok(())
}

// ── File system commands ──────────────────────────────────────────────────────

#[tauri::command]
fn list_local_entries(
    path: String,
    show_hidden: bool,
) -> Result<Vec<core::models::FileEntryDto>, String> {
    fs_ops::list_local_entries(&path, show_hidden).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_remote_entries(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<core::models::FileEntryDto>, String> {
    state
        .terminal
        .list_remote_entries(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs_ops::read_text_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs_ops::write_text_file(&path, &content).map_err(|e| e.to_string())
}

/// Read a text file from a remote SSH host.
#[tauri::command]
async fn read_remote_text_file(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    state
        .terminal
        .read_remote_text_file(&session_id, &path)
        .await
        .map_err(|e| e.to_string())
}

/// Write a text file to a remote SSH host.
#[tauri::command]
async fn write_remote_text_file(
    session_id: String,
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .write_remote_text_file(&session_id, &path, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_fs_entry(path: String, is_dir: bool) -> Result<(), String> {
    fs_ops::create_entry(&path, is_dir).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_remote_fs_entry(
    session_id: String,
    path: String,
    is_dir: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .create_remote_fs_entry(&session_id, &path, is_dir)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_fs_entry(from: String, to: String) -> Result<(), String> {
    fs_ops::rename_entry(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
async fn rename_remote_fs_entry(
    session_id: String,
    from: String,
    to: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .rename_remote_fs_entry(&session_id, &from, &to)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_fs_entry(path: String, is_dir: bool) -> Result<(), String> {
    fs_ops::delete_entry(&path, is_dir).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_remote_fs_entry(
    session_id: String,
    path: String,
    is_dir: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .terminal
        .delete_remote_fs_entry(&session_id, &path, is_dir)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_fs_entry(from: String, to: String) -> Result<(), String> {
    fs_ops::copy_entry(&from, &to).map_err(|e| e.to_string())
}

// ── SSH host management ───────────────────────────────────────────────────────

#[tauri::command]
fn load_ssh_hosts(state: State<'_, AppState>) -> SshHostsPayload {
    let imported = state.hosts.import_ssh_config_hosts();
    let managed = state.hosts.list_managed_hosts();
    let groups = state.hosts.list_groups();
    SshHostsPayload {
        imported,
        managed,
        groups,
    }
}

#[tauri::command]
fn save_managed_ssh_host(
    host: SshHostEntry,
    state: State<'_, AppState>,
) -> Result<SshHostEntry, String> {
    state
        .hosts
        .save_managed_host(host)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_managed_ssh_host(host_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .hosts
        .delete_managed_host(&host_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn create_ssh_group(name: String, state: State<'_, AppState>) -> Result<SshHostGroup, String> {
    state.hosts.create_group(name).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_ssh_group(
    group_id: String,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .hosts
        .rename_group(&group_id, name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_ssh_group(group_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .hosts
        .delete_group(&group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_imported_host_overrides(
    source_alias: String,
    local_alias: Option<String>,
    group_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .hosts
        .set_imported_host_overrides(&source_alias, local_alias, group_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_imported_host_in_config(
    source_alias: String,
    new_alias: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .hosts
        .rename_imported_host_in_config(&source_alias, &new_alias)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_managed_host_to_config(
    host_id: String,
    overwrite_existing: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .hosts
        .export_managed_host_to_config(&host_id, overwrite_existing)
        .map_err(|e| e.to_string())
}

// ── Settings & persistence ────────────────────────────────────────────────────

#[tauri::command]
fn load_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.get()
}

#[tauri::command]
fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<(), String> {
    state.settings.set(settings).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_ui_state(state: State<'_, AppState>) -> Result<PersistedUiState, String> {
    state
        .persistence
        .load_or_default("ui_state.json")
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_ui_state(ui_state: PersistedUiState, state: State<'_, AppState>) -> Result<(), String> {
    state
        .persistence
        .save("ui_state.json", &ui_state)
        .map_err(|e| e.to_string())
}

// ── App entry point ───────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let persistence = Persistence::from_app(app.handle())?;
            let hosts = Arc::new(HostStore::new(persistence.clone())?);
            let settings = Arc::new(SettingsStore::new(persistence.clone())?);

            app.manage(AppState {
                terminal: TerminalManager::default(),
                monitoring: monitoring::MonitoringStore::default(),
                hosts,
                settings,
                persistence,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_local_session,
            create_ssh_session,
            create_ssh_session_with_options,
            stream_terminal_output,
            send_terminal_input,
            read_terminal_output,
            resize_terminal,
            close_terminal_session,
            fetch_remote_status,
            exit_app,
            list_local_entries,
            list_remote_entries,
            read_text_file,
            write_text_file,
            read_remote_text_file,
            write_remote_text_file,
            create_fs_entry,
            create_remote_fs_entry,
            rename_fs_entry,
            rename_remote_fs_entry,
            delete_fs_entry,
            delete_remote_fs_entry,
            copy_fs_entry,
            load_ssh_hosts,
            save_managed_ssh_host,
            delete_managed_ssh_host,
            create_ssh_group,
            rename_ssh_group,
            delete_ssh_group,
            set_imported_host_overrides,
            rename_imported_host_in_config,
            export_managed_host_to_config,
            load_settings,
            save_settings,
            load_ui_state,
            save_ui_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Termif");
}

fn resolve_ssh_connect_options(
    hosts: &HostStore,
    settings: AppSettings,
    host_alias: &str,
) -> SshConnectOptions {
    let managed = hosts.list_managed_hosts();
    let imported = hosts.import_ssh_config_hosts();

    let resolved = managed
        .into_iter()
        .chain(imported)
        .find(|host| host.alias == host_alias);

    if let Some(host) = resolved {
        return SshConnectOptions {
            alias: host_alias.to_string(),
            host: host.host_name,
            user: host.user,
            port: host.port.unwrap_or(22),
            identity_file: host.identity_file,
            password: host.password,
            connect_timeout_seconds: settings.ssh.connect_timeout_seconds,
        };
    }

    SshConnectOptions {
        alias: host_alias.to_string(),
        host: host_alias.to_string(),
        user: None,
        port: 22,
        identity_file: None,
        password: None,
        connect_timeout_seconds: settings.ssh.connect_timeout_seconds,
    }
}
