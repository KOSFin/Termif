import { invoke } from "@tauri-apps/api/core";
import type { PaletteCommand } from "@/app/palette/CommandPalette";
import type { SettingsSection } from "@/app/settings/SettingsPanel";
import { coerceShellProfile, desktopPlatform, getDefaultLocalPath } from "@/platform/platform";
import { useAppStore } from "@/store/useAppStore";
import type { AppSettings, AppTab, FileEntryDto, SshHostEntry } from "@/types/models";

interface AppCommandContext {
  activeTab?: AppTab;
  editorVisible: boolean;
  importedHosts: SshHostEntry[];
  managedHosts: SshHostEntry[];
  selectedFile?: FileEntryDto;
  settings: AppSettings | null;
  tabs: AppTab[];
  activateNextTab: () => void;
  activatePrevTab: () => void;
  closeTab: (tabId: string) => Promise<void>;
  connectHostFromPalette: (alias: string) => void;
  createLocalTab: (shellProfile?: string) => Promise<void>;
  createSshPickerTab: () => string;
  loadCurrentFiles: (options?: { force?: boolean }) => Promise<void>;
  openFile: (path: string, mode: "preview" | "edit", sessionId?: string) => Promise<void>;
  openSettingsAt: (section: SettingsSection, highlight?: string) => void;
  renameTab: (tabId: string, name: string) => void;
  setActiveTab: (tabId: string) => void;
  setEditorVisible: (visible: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setTabColor: (tabId: string, color: string) => void;
  toast: (message: string) => void;
  toggleSidebar: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

export function buildAppCommands(ctx: AppCommandContext): PaletteCommand[] {
  return [
    {
      id: "tab.new_default",
      title: "New Default Terminal",
      category: "Tabs",
      action: () => {
        void ctx.createLocalTab(coerceShellProfile(ctx.settings?.terminal.default_shell));
      },
    },
    {
      id: "tab.new_platform_shell",
      title: `New ${desktopPlatform === "windows" ? "PowerShell" : "Login Shell"} Tab`,
      category: "Tabs",
      action: () => {
        void ctx.createLocalTab(coerceShellProfile(ctx.settings?.terminal.default_shell));
      },
    },
    {
      id: "ssh.open",
      title: "Open SSH Connection",
      category: "SSH",
      action: ctx.createSshPickerTab,
    },
    {
      id: "settings.open",
      title: "Open Settings",
      category: "UI",
      action: () => ctx.setSettingsOpen(true),
    },
    {
      id: "sidebar.toggle",
      title: "Toggle Sidebar",
      category: "UI",
      action: ctx.toggleSidebar,
    },
    {
      id: "tab.close",
      title: "Close Current Tab",
      category: "Tabs",
      action: () => {
        if (ctx.activeTab) void ctx.closeTab(ctx.activeTab.id);
      },
    },
    {
      id: "tab.rename",
      title: "Rename Current Tab",
      category: "Tabs",
      action: () => {
        if (!ctx.activeTab) return;
        const nextName = window.prompt("Rename tab", ctx.activeTab.title)?.trim();
        if (nextName) ctx.renameTab(ctx.activeTab.id, nextName);
      },
    },
    {
      id: "tab.recolor",
      title: "Change Tab Color",
      category: "Tabs",
      action: () => {
        if (!ctx.activeTab) return;
        const color = window.prompt("Hex color", ctx.activeTab.color)?.trim();
        if (color) ctx.setTabColor(ctx.activeTab.id, color);
      },
    },
    {
      id: "tab.next",
      title: "Next Tab",
      category: "Tabs",
      action: ctx.activateNextTab,
    },
    {
      id: "tab.prev",
      title: "Previous Tab",
      category: "Tabs",
      action: ctx.activatePrevTab,
    },
    {
      id: "files.refresh",
      title: "Refresh File Manager",
      category: "Files",
      action: () => {
        void ctx.loadCurrentFiles({ force: true });
      },
    },
    {
      id: "files.new_file",
      title: "Create New File",
      category: "Files",
      action: () => createFileEntry(ctx, false),
    },
    {
      id: "files.new_folder",
      title: "Create New Folder",
      category: "Files",
      action: () => createFileEntry(ctx, true),
    },
    {
      id: "files.open_selected",
      title: "Open Selected File",
      category: "Files",
      action: () => openSelectedFile(ctx, "edit"),
    },
    {
      id: "files.preview_selected",
      title: "Preview Selected File",
      category: "Files",
      action: () => openSelectedFile(ctx, "preview"),
    },
    {
      id: "editor.toggle",
      title: "Toggle Editor Panel",
      category: "UI",
      action: () => ctx.setEditorVisible(!ctx.editorVisible),
    },
    {
      id: "zoom.in",
      title: "Zoom In",
      category: "UI",
      action: ctx.zoomIn,
    },
    {
      id: "zoom.out",
      title: "Zoom Out",
      category: "UI",
      action: ctx.zoomOut,
    },
    {
      id: "zoom.reset",
      title: "Reset Zoom",
      category: "UI",
      action: ctx.zoomReset,
    },
    ...ctx.tabs.map((tab) => ({
      id: `switch.tab.${tab.id}`,
      title: `Switch to: ${tab.title}`,
      category: "Tabs",
      action: () => ctx.setActiveTab(tab.id),
    })),
    ...Array.from(new Map([...ctx.managedHosts, ...ctx.importedHosts].map((host) => [host.alias, host])).values()).map((host) => ({
      id: `ssh.connect.${host.alias}`,
      title: `Connect: ${host.alias} (${host.host_name})`,
      category: "SSH Hosts",
      action: () => ctx.connectHostFromPalette(host.alias),
    })),
    { id: "settings.appearance", title: "Settings: Appearance", category: "Settings", action: () => ctx.openSettingsAt("appearance") },
    { id: "settings.terminal", title: "Settings: Terminal", category: "Settings", action: () => ctx.openSettingsAt("terminal") },
    { id: "settings.hotkeys", title: "Settings: Hotkeys", category: "Settings", action: () => ctx.openSettingsAt("hotkeys") },
    { id: "settings.ssh", title: "Settings: SSH", category: "Settings", action: () => ctx.openSettingsAt("ssh") },
    { id: "settings.file_manager", title: "Settings: File Manager", category: "Settings", action: () => ctx.openSettingsAt("file_manager") },
    { id: "settings.status_bar", title: "Settings: Status Bar", category: "Settings", action: () => ctx.openSettingsAt("status_bar") },
    { id: "setting.font_size", title: "Setting: Font Size", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Font Size") },
    { id: "setting.font_family", title: "Setting: Font Family", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Font Family") },
    { id: "setting.cursor_style", title: "Setting: Cursor Style", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Cursor Style") },
    { id: "setting.color_scheme", title: "Setting: Terminal Color Scheme", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Color Scheme") },
    { id: "setting.default_shell", title: "Setting: Default Shell", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Default Shell") },
    { id: "setting.scrollback", title: "Setting: Scrollback Lines", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Scrollback Lines") },
    { id: "setting.syntax", title: "Setting: Syntax Highlighting", category: "Settings", action: () => ctx.openSettingsAt("terminal", "Syntax Highlighting") },
    { id: "setting.ui_density", title: "Setting: UI Density", category: "Settings", action: () => ctx.openSettingsAt("appearance", "UI Density") },
    { id: "setting.accent", title: "Setting: Accent Color", category: "Settings", action: () => ctx.openSettingsAt("appearance", "Accent Color") },
    { id: "setting.modal_blur", title: "Setting: Modal Blur", category: "Settings", action: () => ctx.openSettingsAt("appearance", "Modal Blur") },
    { id: "setting.modal_dimming", title: "Setting: Modal Dimming", category: "Settings", action: () => ctx.openSettingsAt("appearance", "Modal Dimming") },
    { id: "setting.border_radius", title: "Setting: UI Border Radius", category: "Settings", action: () => ctx.openSettingsAt("appearance", "UI Border Radius") },
    { id: "setting.ssh_timeout", title: "Setting: SSH Timeout", category: "Settings", action: () => ctx.openSettingsAt("ssh", "Connect Timeout") },
    { id: "setting.strict_key", title: "Setting: Strict Host Key Checking", category: "Settings", action: () => ctx.openSettingsAt("ssh", "Strict Host Key Checking") },
    { id: "setting.hidden_files", title: "Setting: Show Hidden Files", category: "Settings", action: () => ctx.openSettingsAt("file_manager", "Show Hidden Files") },
    { id: "setting.statusbar_enabled", title: "Setting: Enable Bottom Status Bar", category: "Settings", action: () => ctx.openSettingsAt("status_bar", "Enable Bottom Status Bar") },
    { id: "setting.statusbar_resources", title: "Setting: Show SSH Resource Monitor", category: "Settings", action: () => ctx.openSettingsAt("status_bar", "Show SSH Resource Monitor") },
    { id: "setting.statusbar_server_time", title: "Setting: Show SSH Server Time", category: "Settings", action: () => ctx.openSettingsAt("status_bar", "Show SSH Server Time") },
    { id: "setting.statusbar_poll", title: "Setting: SSH Poll Interval", category: "Settings", action: () => ctx.openSettingsAt("status_bar", "SSH Poll Interval") },
  ];
}

async function createFileEntry(ctx: AppCommandContext, isDir: boolean): Promise<void> {
  const name = window.prompt(isDir ? "Folder name" : "File name")?.trim();
  if (!name || !ctx.activeTab) return;

  const base = (useAppStore.getState().tabPaths[ctx.activeTab.id] ?? (ctx.activeTab.kind === "ssh" ? "/" : getDefaultLocalPath())).replace(/\/$/, "");
  if (ctx.activeTab.kind === "ssh" && ctx.activeTab.sessionId) {
    await invoke("create_remote_fs_entry", { sessionId: ctx.activeTab.sessionId, path: `${base}/${name}`, isDir });
  } else {
    await invoke("create_fs_entry", { path: `${base}/${name}`, isDir });
  }
  await ctx.loadCurrentFiles({ force: true });
}

function openSelectedFile(ctx: AppCommandContext, mode: "preview" | "edit"): void {
  if (!ctx.selectedFile) {
    ctx.toast("No file selected");
    return;
  }

  void ctx.openFile(
    ctx.selectedFile.path,
    mode,
    ctx.activeTab?.kind === "ssh" ? ctx.activeTab.sessionId : undefined
  );
}
