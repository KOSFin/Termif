use std::collections::HashMap;

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
    pub user_names: Option<Vec<String>>,
    pub server_time_epoch: Option<i64>,
    pub server_tz: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshHostEntry {
    pub id: String,
    pub alias: String,
    pub host_name: String,
    pub user: Option<String>,
    pub port: Option<u16>,
    pub identity_file: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
    pub group_id: Option<String>,
    #[serde(default)]
    pub original_alias: Option<String>,
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
                theme: "charcoal".to_string(),
                theme_mode: ThemeMode::Manual,
                light_theme: "paper".to_string(),
                dark_theme: "charcoal".to_string(),
                accent_color: "#61a0ff".to_string(),
                ui_density: "comfortable".to_string(),
                tab_switching_mode: "mru".to_string(),
                custom_themes: Vec::new(),
                modal_blur: 4,
                modal_dimming: 0.55,
                border_radius: 8,
                window_opacity: 1.0,
                window_blur: default_window_blur(),
                panel_blur: default_panel_blur(),
                panel_opacity: 1.0,
                topbar_opacity: 0.88,
                terminal_opacity: 1.0,
                terminal_background_image: String::new(),
                terminal_background_dim: 0.35,
                theme_background_images: std::collections::HashMap::new(),
            },
            terminal: TerminalSettings {
                default_shell: crate::platform::default_shell_profile().to_string(),
                font_family: default_terminal_font().to_string(),
                font_size: 13,
                cursor_style: "bar".to_string(),
                scrollback_lines: 20_000,
                syntax_highlighting: false,
                color_scheme: Some(default_terminal_color_scheme().to_string()),
                custom_colors: None,
            },
            hotkeys: vec![
                HotkeyBinding {
                    command_id: "palette.open".to_string(),
                    primary: "Ctrl+Shift+P".to_string(),
                    alternates: Vec::new(),
                },
                HotkeyBinding {
                    command_id: "tab.new_default".to_string(),
                    primary: "Ctrl+T".to_string(),
                    alternates: Vec::new(),
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
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
    pub theme_mode: ThemeMode,
    #[serde(default = "default_light_theme")]
    pub light_theme: String,
    #[serde(default = "default_dark_theme")]
    pub dark_theme: String,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default = "default_ui_density")]
    pub ui_density: String,
    #[serde(default = "default_tab_switching_mode")]
    pub tab_switching_mode: String,
    #[serde(default)]
    pub custom_themes: Vec<CustomTheme>,
    #[serde(default = "default_modal_blur")]
    pub modal_blur: u8,
    #[serde(default = "default_modal_dimming")]
    pub modal_dimming: f32,
    #[serde(default = "default_border_radius")]
    pub border_radius: u8,
    #[serde(default = "default_window_opacity")]
    pub window_opacity: f32,
    #[serde(default = "default_window_blur")]
    pub window_blur: u8,
    #[serde(default = "default_panel_blur")]
    pub panel_blur: u8,
    #[serde(default = "default_panel_opacity")]
    pub panel_opacity: f32,
    #[serde(default = "default_topbar_opacity")]
    pub topbar_opacity: f32,
    #[serde(default = "default_terminal_opacity")]
    pub terminal_opacity: f32,
    #[serde(default)]
    pub terminal_background_image: String,
    #[serde(default = "default_terminal_background_dim")]
    pub terminal_background_dim: f32,
    /// Per-theme background image overrides keyed by theme id. Applied in
    /// system theme mode so each theme can have its own wallpaper.
    #[serde(default)]
    pub theme_background_images: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    #[default]
    Manual,
    System,
}

fn default_theme() -> String {
    "charcoal".to_string()
}

fn default_light_theme() -> String {
    "paper".to_string()
}

fn default_dark_theme() -> String {
    "charcoal".to_string()
}

fn default_accent_color() -> String {
    "#61a0ff".to_string()
}

fn default_ui_density() -> String {
    "comfortable".to_string()
}

fn default_tab_switching_mode() -> String {
    "mru".to_string()
}

fn default_modal_blur() -> u8 {
    4
}

fn default_modal_dimming() -> f32 {
    0.55
}

fn default_border_radius() -> u8 {
    8
}

fn default_window_opacity() -> f32 {
    1.0
}

fn default_window_blur() -> u8 {
    8
}

fn default_panel_blur() -> u8 {
    12
}

fn default_panel_opacity() -> f32 {
    1.0
}

fn default_topbar_opacity() -> f32 {
    0.88
}

fn default_terminal_opacity() -> f32 {
    1.0
}

fn default_terminal_background_dim() -> f32 {
    0.35
}

fn default_terminal_font() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "\"SF Mono\", Menlo, Monaco, Consolas, \"Liberation Mono\", monospace"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "\"Cascadia Code\", \"Fira Code\", \"JetBrains Mono\", Consolas, \"Liberation Mono\", monospace"
    }
}

fn default_terminal_color_scheme() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "macos_dark"
    }

    #[cfg(not(target_os = "macos"))]
    {
        "one_dark"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomTheme {
    pub id: String,
    pub name: String,
    pub base_theme: String,
    pub variables: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSettings {
    pub default_shell: String,
    pub font_family: String,
    pub font_size: u16,
    pub cursor_style: String,
    pub scrollback_lines: usize,
    #[serde(default)]
    pub syntax_highlighting: bool,
    #[serde(default)]
    pub color_scheme: Option<String>,
    #[serde(default)]
    pub custom_colors: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HotkeyBinding {
    pub command_id: String,
    pub primary: String,
    #[serde(default)]
    pub alternates: Vec<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedUiState {
    pub tabs: Vec<PersistedTab>,
    pub active_tab_id: Option<String>,
    #[serde(default = "default_sidebar_visible")]
    pub sidebar_visible: bool,
    #[serde(default)]
    pub selected_sidebar_tool: Option<String>,
    #[serde(default = "default_sidebar_width")]
    pub sidebar_width: f32,
    #[serde(default)]
    pub file_history: std::collections::HashMap<String, Vec<String>>,
    #[serde(default)]
    pub file_history_index: std::collections::HashMap<String, usize>,
    #[serde(default)]
    pub window_tabs: std::collections::HashMap<String, Vec<String>>,
    #[serde(default)]
    pub active_tab_by_window: std::collections::HashMap<String, Option<String>>,
    #[serde(default)]
    pub window_states: std::collections::HashMap<String, PersistedWindowState>,
}

fn default_sidebar_visible() -> bool {
    true
}

fn default_sidebar_width() -> f32 {
    280.0
}

impl Default for PersistedUiState {
    fn default() -> Self {
        Self {
            tabs: Vec::new(),
            active_tab_id: None,
            sidebar_visible: true,
            selected_sidebar_tool: None,
            sidebar_width: default_sidebar_width(),
            file_history: std::collections::HashMap::new(),
            file_history_index: std::collections::HashMap::new(),
            window_tabs: std::collections::HashMap::new(),
            active_tab_by_window: std::collections::HashMap::new(),
            window_states: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersistedWindowState {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub maximized: Option<bool>,
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
