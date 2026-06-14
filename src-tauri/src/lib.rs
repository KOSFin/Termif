mod core;
mod fs;
mod monitoring;
mod persistence;
mod platform;
mod plugins;
mod pty;
mod sessions;
mod settings;
mod ssh;
mod ui_events;

use std::{
    fs as std_fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use core::models::{
    AppSettings, PersistedUiState, SessionDto, SshHostEntry, SshHostGroup, SystemStatsDto,
};
use tauri::ipc::Channel;
use tauri::State;
use tauri::{Emitter, Manager};

use crate::{
    fs as fs_ops,
    persistence::Persistence,
    pty::{SshConnectOptions, TerminalManager},
    settings::SettingsStore,
    ssh::{GroupDeleteHosts, HostStore},
};

#[derive(Clone)]
struct AppState {
    terminal: TerminalManager,
    monitoring: monitoring::MonitoringStore,
    hosts: Arc<HostStore>,
    settings: Arc<SettingsStore>,
    persistence: Persistence,
    launch_requests: Arc<Mutex<Vec<LaunchRequest>>>,
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

#[derive(Clone, Debug, serde::Serialize)]
struct LaunchPathsPayload {
    requests: Vec<LaunchRequest>,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
struct LaunchRequest {
    path: String,
    target: LaunchTarget,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
enum LaunchTarget {
    Tab,
    Window,
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
        strict_host_key_checking: settings.ssh.strict_host_key_checking,
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
fn get_terminal_session(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<SessionDto, String> {
    state
        .terminal
        .get_session(&session_id)
        .ok_or_else(|| "session not found".to_string())
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

#[tauri::command]
fn consume_launch_paths(state: State<'_, AppState>) -> Result<Vec<LaunchRequest>, String> {
    let mut guard = state
        .launch_requests
        .lock()
        .map_err(|_| "launch requests lock poisoned".to_string())?;
    Ok(std::mem::take(&mut *guard))
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
fn get_home_dir() -> Result<String, String> {
    crate::platform::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_mtime(path: String) -> Result<Option<u64>, String> {
    fs_ops::get_file_mtime(&path).map_err(|e| e.to_string())
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

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    fs_ops::reveal_path(&path).map_err(|e| e.to_string())
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

/// Open an external https:// URL in the user's default browser.
/// Restricted to https and a conservative character set so it can never be
/// abused as a generic command/file launcher (notably via the Windows shell).
#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") || trimmed.len() > 2048 {
        return Err("Only https URLs are allowed".to_string());
    }
    // Allow only characters that legitimately appear in a URL. This rejects
    // whitespace, quotes, and every shell/cmd metacharacter (& | ^ % < > etc.).
    let allowed = |c: char| c.is_ascii_alphanumeric() || "-._~:/?#[]@!$&'()*+,;=%".contains(c);
    if trimmed.contains(['&', '|', '^', '<', '>', '"', '\'', '`', ' '])
        || !trimmed.chars().all(allowed)
    {
        return Err("URL contains invalid characters".to_string());
    }

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", trimmed])
        .spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(trimmed).spawn();

    #[cfg(all(unix, not(target_os = "macos")))]
    let result = std::process::Command::new("xdg-open").arg(trimmed).spawn();

    result.map(|_| ()).map_err(|e| e.to_string())
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
fn delete_ssh_group(
    group_id: String,
    hosts_action: Option<String>,
    target_group_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let action = match hosts_action.as_deref() {
        Some("cascade") => GroupDeleteHosts::Cascade,
        Some("move") => GroupDeleteHosts::MoveTo(target_group_id.unwrap_or_default()),
        // Default (and "ungroup") preserves the previous behaviour.
        _ => GroupDeleteHosts::Ungroup,
    };
    state
        .hosts
        .delete_group_with_hosts(&group_id, action)
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
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let requests = resolve_launch_requests(&argv, Some(cwd.as_str()));
            if requests.is_empty() {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                return;
            }

            if let Some(state) = app.try_state::<AppState>() {
                if let Ok(mut pending) = state.launch_requests.lock() {
                    pending.extend(requests.clone());
                }
            }

            let _ = app.emit("termif://launch-paths", LaunchPathsPayload { requests });
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            let launch_requests = Arc::new(Mutex::new(resolve_launch_requests(
                &std::env::args().collect::<Vec<_>>(),
                std::env::current_dir()
                    .ok()
                    .and_then(|path| path.to_str().map(|value| value.to_string()))
                    .as_deref(),
            )));

            let persistence = Persistence::from_app(app.handle())?;
            let hosts = Arc::new(HostStore::new(persistence.clone())?);
            let settings = Arc::new(SettingsStore::new(persistence.clone())?);

            app.manage(AppState {
                terminal: TerminalManager::default(),
                monitoring: monitoring::MonitoringStore::default(),
                hosts,
                settings,
                persistence,
                launch_requests,
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
            get_terminal_session,
            fetch_remote_status,
            exit_app,
            consume_launch_paths,
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
            reveal_path,
            get_file_mtime,
            get_home_dir,
            load_ssh_hosts,
            save_managed_ssh_host,
            delete_managed_ssh_host,
            open_external_url,
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
        .build(tauri::generate_context!())
        .expect("error building Termif")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| {
                        if url.scheme() == "file" {
                            url.to_file_path()
                                .ok()
                                .map(|p| p.to_string_lossy().to_string())
                        } else {
                            None
                        }
                    })
                    .collect();

                if !paths.is_empty() {
                    let requests: Vec<LaunchRequest> = paths
                        .into_iter()
                        .filter_map(|path| {
                            normalize_launch_path(&path, None).map(|p| LaunchRequest {
                                path: p,
                                target: LaunchTarget::Tab,
                            })
                        })
                        .collect();

                    if !requests.is_empty() {
                        if let Some(state) = app.try_state::<AppState>() {
                            if let Ok(mut pending) = state.launch_requests.lock() {
                                pending.extend(requests.clone());
                            }
                        }
                        let _ = app.emit("termif://launch-paths", LaunchPathsPayload { requests });
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }

            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

fn resolve_launch_requests(argv: &[String], cwd: Option<&str>) -> Vec<LaunchRequest> {
    let mut target = LaunchTarget::Tab;
    let mut requests = Vec::new();

    for arg in argv.iter().skip(1) {
        match arg.as_str() {
            "--new-window" => {
                target = LaunchTarget::Window;
                continue;
            }
            "--new-tab" => {
                target = LaunchTarget::Tab;
                continue;
            }
            _ => {}
        }

        if arg.starts_with('-') {
            continue;
        }

        if let Some(path) = normalize_launch_path(arg, cwd) {
            requests.push(LaunchRequest {
                path,
                target: target.clone(),
            });
            target = LaunchTarget::Tab;
        }
    }

    requests
}

fn normalize_launch_path(raw: &str, cwd: Option<&str>) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    let candidate = PathBuf::from(trimmed);
    let path = if candidate.is_absolute() {
        candidate
    } else if let Some(base) = cwd {
        Path::new(base).join(candidate)
    } else {
        candidate
    };

    let metadata = std_fs::metadata(&path).ok()?;
    let resolved = if metadata.is_dir() {
        path
    } else {
        path.parent()?.to_path_buf()
    };

    Some(resolved.to_string_lossy().to_string())
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
            strict_host_key_checking: settings.ssh.strict_host_key_checking,
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
        strict_host_key_checking: settings.ssh.strict_host_key_checking,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_launch_path, resolve_launch_requests, LaunchTarget};
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    struct TempPath {
        path: PathBuf,
    }

    impl TempPath {
        fn new(prefix: &str) -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time went backwards")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("termif-{prefix}-{stamp}"));
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TempPath {
        fn drop(&mut self) {
            let _ = fs::remove_file(&self.path);
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn normalizes_absolute_launch_directories_and_files() {
        let fixture = TempPath::new("launch-absolute");
        let dir = fixture.path().join("workspace");
        let file = dir.join("notes.txt");
        fs::create_dir_all(&dir).expect("create dir");
        fs::write(&file, "ok").expect("write file");

        assert_eq!(
            normalize_launch_path(dir.to_string_lossy().as_ref(), None),
            Some(dir.to_string_lossy().to_string())
        );
        assert_eq!(
            normalize_launch_path(file.to_string_lossy().as_ref(), None),
            Some(dir.to_string_lossy().to_string())
        );
    }

    #[test]
    fn normalizes_relative_launch_paths_against_cwd() {
        let fixture = TempPath::new("launch-relative");
        let cwd = fixture.path().join("cwd");
        let dir = cwd.join("project");
        let file = dir.join("README.md");
        fs::create_dir_all(&dir).expect("create dir");
        fs::write(&file, "ok").expect("write file");

        assert_eq!(
            normalize_launch_path("project", Some(cwd.to_string_lossy().as_ref())),
            Some(dir.to_string_lossy().to_string())
        );
        assert_eq!(
            normalize_launch_path("project/README.md", Some(cwd.to_string_lossy().as_ref())),
            Some(dir.to_string_lossy().to_string())
        );
    }

    #[test]
    fn ignores_empty_missing_and_flag_like_launch_values() {
        let fixture = TempPath::new("launch-ignore");
        fs::create_dir_all(fixture.path()).expect("create dir");

        assert_eq!(normalize_launch_path("", None), None);
        assert_eq!(normalize_launch_path("   ", None), None);
        assert_eq!(
            normalize_launch_path(
                "--new-window",
                Some(fixture.path().to_string_lossy().as_ref())
            ),
            None
        );
        assert_eq!(
            normalize_launch_path(
                "missing-dir",
                Some(fixture.path().to_string_lossy().as_ref())
            ),
            None
        );
    }

    #[test]
    fn resolves_launch_requests_with_window_and_tab_targets() {
        let fixture = TempPath::new("launch-requests");
        let cwd = fixture.path().join("cwd");
        let project = cwd.join("project");
        let project_b = cwd.join("project-b");
        let nested = project.join("nested");
        fs::create_dir_all(&nested).expect("create nested dir");
        fs::create_dir_all(&project_b).expect("create project b dir");

        let argv = vec![
            "termif".to_string(),
            "--new-window".to_string(),
            "project".to_string(),
            "--new-tab".to_string(),
            "project-b".to_string(),
            "--ignored-flag".to_string(),
            "project/nested".to_string(),
        ];

        let requests = resolve_launch_requests(&argv, Some(cwd.to_string_lossy().as_ref()));
        assert_eq!(requests.len(), 3);
        assert_eq!(requests[0].path, project.to_string_lossy().to_string());
        assert!(matches!(requests[0].target, LaunchTarget::Window));
        assert_eq!(requests[1].path, project_b.to_string_lossy().to_string());
        assert!(matches!(requests[1].target, LaunchTarget::Tab));
        assert_eq!(requests[2].path, nested.to_string_lossy().to_string());
        assert!(matches!(requests[2].target, LaunchTarget::Tab));
    }
}
