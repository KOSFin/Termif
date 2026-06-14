export type SessionKind = "local" | "ssh" | "ssh_picker";

export interface SessionDto {
  id: string;
  kind: SessionKind;
  title: string;
  shell: string;
  cwd?: string | null;
  ssh_alias?: string | null;
}

export interface FileEntryDto {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified_unix?: number | null;
}

export type SshHostSource = "imported" | "managed";

export interface SshHostEntry {
  id: string;
  alias: string;
  host_name: string;
  user?: string | null;
  port?: number | null;
  identity_file?: string | null;
  password?: string | null;
  group_id?: string | null;
  original_alias?: string | null;
  source: SshHostSource;
}

export interface SshHostGroup {
  id: string;
  name: string;
  order: number;
}

export interface SshHostsPayload {
  imported: SshHostEntry[];
  managed: SshHostEntry[];
  groups: SshHostGroup[];
}

export interface SshConnectOptions {
  alias: string;
  host: string;
  user?: string | null;
  port?: number | null;
  identity_file?: string | null;
  password?: string | null;
}

export interface CustomTheme {
  id: string;
  name: string;
  base_theme: string;
  variables: Record<string, string>;
}

export interface AppSettings {
  appearance: {
    theme?: string;
    theme_mode?: "manual" | "system";
    light_theme?: string;
    dark_theme?: string;
    accent_color: string;
    ui_density: string;
    tab_switching_mode: string;
    custom_themes?: CustomTheme[];
    modal_blur?: number;
    modal_dimming?: number;
    border_radius?: number;
    window_opacity?: number;
    window_blur?: number;
    panel_blur?: number;
    panel_opacity?: number;
    topbar_opacity?: number;
    terminal_opacity?: number;
    terminal_background_image?: string;
    terminal_background_dim?: number;
    /** Per-theme background image overrides (keyed by theme id). Applied when
     *  theme_mode is "system" so each theme in the light/dark pair can have its
     *  own wallpaper. Falls back to terminal_background_image when unset. */
    theme_background_images?: Record<string, string>;
    animations_enabled?: boolean;
  };
  terminal: {
    default_shell: string;
    font_family: string;
    font_size: number;
    cursor_style: string;
    scrollback_lines: number;
    syntax_highlighting: boolean;
    color_scheme?: string;
    custom_colors?: Record<string, string>;
  };
  hotkeys: Array<{ command_id: string; primary: string; alternates?: string[] | null }>;
  ssh: {
    connect_timeout_seconds: number;
    strict_host_key_checking: boolean;
  };
  file_manager: {
    show_hidden: boolean;
    default_sort: string;
  };
  experimental: {
    input_overlay_mode: boolean;
  };
  status_bar: {
    enabled: boolean;
    show_resource_monitor: boolean;
    show_server_time: boolean;
    resource_poll_interval_seconds: number;
  };
}

export interface SystemStats {
  cpu?: number | null;
  ram?: number | null;
  disk?: number | null;
  users?: number | null;
  user_names?: string[] | null;
  server_time_epoch?: number | null;
  server_tz?: string | null;
}

export interface PersistedTab {
  id: string;
  title: string;
  color: string;
  icon: string;
  kind: SessionKind;
  session_id?: string | null;
  ssh_alias?: string | null;
}

export interface PersistedWindowState {
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  maximized?: boolean | null;
}

export interface PersistedUiState {
  tabs: PersistedTab[];
  active_tab_id?: string | null;
  sidebar_visible?: boolean | null;
  selected_sidebar_tool?: "files" | "snippets" | "clipboard" | null;
  sidebar_width?: number | null;
  file_history?: Record<string, string[]> | null;
  file_history_index?: Record<string, number> | null;
  window_tabs?: Record<string, string[]> | null;
  active_tab_by_window?: Record<string, string | null> | null;
  window_states?: Record<string, PersistedWindowState> | null;
}

export interface WindowTabsSnapshot {
  tabs: string[];
  activeTabId?: string | null;
}

export interface AppTab {
  id: string;
  title: string;
  color: string;
  icon: string;
  kind: SessionKind;
  sessionId?: string;
  sshAlias?: string;
  shellProfile?: string;
}
