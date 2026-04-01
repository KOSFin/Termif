use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    Local,
    Ssh,
    SshPicker,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDto {
    pub id: String,
    pub kind: SessionKind,
    pub title: String,
    pub shell: String,
    pub cwd: Option<String>,
    pub ssh_alias: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntryDto {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_unix: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SystemStatsDto {
    pub cpu: Option<f32>,
    pub ram: Option<f32>,
    pub disk: Option<f32>,
    pub users: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostEntry {
    pub id: String,
    pub alias: String,
    pub host_name: String,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    pub group_id: Option<String>,
    pub source: SshHostSource,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SshHostSource {
    Imported,
    Managed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostGroup {
    pub id: String,
    pub name: String,
    pub order: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub appearance: AppearanceSettings,
    pub terminal: TerminalSettings,
    pub hotkeys: Vec<HotkeyBinding>,
    pub ssh: SshSettings,
    pub file_manager: FileManagerSettings,
    pub experimental: ExperimentalSettings,
    #[serde(default)]
    pub status_bar: StatusBarSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: AppearanceSettings {
                accent_color: "#61a0ff".to_string(),
                ui_density: "comfortable".to_string(),
                tab_switching_mode: "mru".to_string(),
            },
            terminal: TerminalSettings {
                default_shell: "powershell".to_string(),
                font_family: "Cascadia Code".to_string(),
                font_size: 13,
                cursor_style: "bar".to_string(),
                scrollback_lines: 20_000,
            },
            hotkeys: vec![
                HotkeyBinding {
                    command_id: "palette.open".to_string(),
                    primary: "Ctrl+Shift+P".to_string(),
                },
                HotkeyBinding {
                    command_id: "tab.new_default".to_string(),
                    primary: "Ctrl+T".to_string(),
                },
            ],
            ssh: SshSettings {
                connect_timeout_seconds: 15,
                strict_host_key_checking: true,
            },
            file_manager: FileManagerSettings {
                show_hidden: false,
                default_sort: "name".to_string(),
            },
            experimental: ExperimentalSettings {
                input_overlay_mode: false,
            },
            status_bar: StatusBarSettings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceSettings {
    pub accent_color: String,
    pub ui_density: String,
    #[serde(default = "default_tab_switching_mode")]
    pub tab_switching_mode: String,
}

fn default_tab_switching_mode() -> String {
    "mru".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSettings {
    pub default_shell: String,
    pub font_family: String,
    pub font_size: u16,
    pub cursor_style: String,
    pub scrollback_lines: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub command_id: String,
    pub primary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshSettings {
    pub connect_timeout_seconds: u16,
    pub strict_host_key_checking: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileManagerSettings {
    pub show_hidden: bool,
    pub default_sort: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentalSettings {
    pub input_overlay_mode: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct StatusBarSettings {
    pub enabled: bool,
    pub show_resource_monitor: bool,
    pub show_server_time: bool,
    pub resource_poll_interval_seconds: u16,
}

impl Default for StatusBarSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            show_resource_monitor: true,
            show_server_time: true,
            resource_poll_interval_seconds: 8,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedUiState {
    pub tabs: Vec<PersistedTab>,
    pub active_tab_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedTab {
    pub id: String,
    pub title: String,
    pub color: String,
    pub icon: String,
    pub kind: SessionKind,
    pub session_id: Option<String>,
    pub ssh_alias: Option<String>,
}
