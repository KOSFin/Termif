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
  group_id?: string | null;
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

export interface AppSettings {
  appearance: {
    accent_color: string;
    ui_density: string;
    tab_switching_mode: string;
  };
  terminal: {
    default_shell: string;
    font_family: string;
    font_size: number;
    cursor_style: string;
    scrollback_lines: number;
  };
  hotkeys: Array<{ command_id: string; primary: string }>;
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

export interface PersistedUiState {
  tabs: PersistedTab[];
  active_tab_id?: string | null;
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