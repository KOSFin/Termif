mod core;
mod fs;
mod persistence;
mod plugins;
mod pty;
mod sessions;
mod settings;
mod ssh;
mod ui_events;

use std::sync::Arc;

use core::models::{AppSettings, PersistedUiState, SessionDto, SshHostEntry, SshHostGroup};
use tauri::ipc::Channel;
use tauri::Manager;
use tauri::State;

use crate::{
    fs as fs_ops, persistence::Persistence, pty::TerminalManager, settings::SettingsStore,
    ssh::HostStore,
};

#[derive(Clone)]
struct AppState {
    terminal: TerminalManager,
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
fn create_ssh_session(
    host_alias: String,
    state: State<'_, AppState>,
) -> Result<SessionDto, String> {
    state
        .terminal
        .spawn_ssh_session(host_alias)
        .map_err(|e| e.to_string())
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
    state
        .terminal
        .close_session(&session_id)
        .map_err(|e| e.to_string())
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
fn list_remote_entries(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<Vec<core::models::FileEntryDto>, String> {
    let session = state
        .terminal
        .get_session(&session_id)
        .ok_or_else(|| "session not found".to_string())?;

    let alias = session
        .ssh_alias
        .ok_or_else(|| "remote listing is available only for SSH sessions".to_string())?;

    fs_ops::list_remote_entries_ssh(&alias, &path).map_err(|e| e.to_string())
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
fn read_remote_text_file(
    session_id: String,
    path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let session = state
        .terminal
        .get_session(&session_id)
        .ok_or_else(|| "session not found".to_string())?;

    let alias = session
        .ssh_alias
        .ok_or_else(|| "remote file ops require an SSH session".to_string())?;

    fs_ops::read_remote_text_file(&alias, &path).map_err(|e| e.to_string())
}

/// Write a text file to a remote SSH host.
#[tauri::command]
fn write_remote_text_file(
    session_id: String,
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let session = state
        .terminal
        .get_session(&session_id)
        .ok_or_else(|| "session not found".to_string())?;

    let alias = session
        .ssh_alias
        .ok_or_else(|| "remote file ops require an SSH session".to_string())?;

    fs_ops::write_remote_text_file(&alias, &path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_fs_entry(path: String, is_dir: bool) -> Result<(), String> {
    fs_ops::create_entry(&path, is_dir).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_fs_entry(from: String, to: String) -> Result<(), String> {
    fs_ops::rename_entry(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_fs_entry(path: String, is_dir: bool) -> Result<(), String> {
    fs_ops::delete_entry(&path, is_dir).map_err(|e| e.to_string())
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
fn delete_ssh_group(group_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state
        .hosts
        .delete_group(&group_id)
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
                hosts,
                settings,
                persistence,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_local_session,
            create_ssh_session,
            stream_terminal_output,
            send_terminal_input,
            read_terminal_output,
            resize_terminal,
            close_terminal_session,
            list_local_entries,
            list_remote_entries,
            read_text_file,
            write_text_file,
            read_remote_text_file,
            write_remote_text_file,
            create_fs_entry,
            rename_fs_entry,
            delete_fs_entry,
            copy_fs_entry,
            load_ssh_hosts,
            save_managed_ssh_host,
            delete_managed_ssh_host,
            create_ssh_group,
            delete_ssh_group,
            load_settings,
            save_settings,
            load_ui_state,
            save_ui_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Termif");
}
