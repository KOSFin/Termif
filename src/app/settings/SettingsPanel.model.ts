import type { CSSProperties } from "react";
import { Activity, FlaskConical, FolderOpen, Globe, Keyboard, Palette, TerminalSquare } from "lucide-react";
import type { AppSettings } from "@/types/models";
import { platformDefaultShortcut } from "@/platform/platform";

export type SettingsSection = "appearance" | "terminal" | "hotkeys" | "ssh" | "file_manager" | "status_bar" | "experimental";

export const sections: { key: SettingsSection; label: string; icon: typeof Palette }[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "hotkeys", label: "Hotkeys", icon: Keyboard },
  { key: "ssh", label: "SSH", icon: Globe },
  { key: "file_manager", label: "File Manager", icon: FolderOpen },
  { key: "status_bar", label: "Status Bar", icon: Activity },
  { key: "experimental", label: "Experimental", icon: FlaskConical }
];

export const themes = [
  { id: "charcoal", name: "Charcoal", preview: "#1a1d23" },
  { id: "midnight", name: "Midnight", preview: "#0a0e14" },
  { id: "nord", name: "Nord", preview: "#2e3440" },
  { id: "monokai", name: "Monokai", preview: "#272822" },
  { id: "amethyst", name: "Amethyst", preview: "#21192f" },
  { id: "ember", name: "Ember", preview: "#211d1a" },
  { id: "lagoon", name: "Lagoon", preview: "#172529" },
  { id: "paper", name: "Paper", preview: "#fffdf7" }
];

export const hotkeyCatalog: Array<{ id: string; description: string; defaults: string[]; section?: string }> = [
  { id: "palette.open", description: "Open command palette", defaults: ["Ctrl+Shift+P"], section: "General" },
  { id: "sidebar.toggle", description: "Toggle file sidebar", defaults: ["Ctrl+B"], section: "General" },
  { id: "tab.new_default", description: "New terminal tab", defaults: ["Ctrl+T"], section: "Tabs" },
  { id: "tab.close", description: "Close current tab", defaults: ["Ctrl+W"], section: "Tabs" },
  { id: "tab.duplicate", description: "Duplicate current tab", defaults: [], section: "Tabs" },
  { id: "tab.rename", description: "Rename current tab", defaults: [], section: "Tabs" },
  { id: "settings.open", description: "Open settings", defaults: ["Ctrl+,"], section: "General" },
  { id: "tab.switcher.next", description: "Tab switcher next", defaults: ["Ctrl+Tab"], section: "Tabs" },
  { id: "tab.switcher.prev", description: "Tab switcher previous", defaults: ["Ctrl+Shift+Tab"], section: "Tabs" },
  { id: "files.refresh", description: "Refresh file manager", defaults: ["F5", "Ctrl+R"], section: "Files" },
  { id: "editor.toggle", description: "Toggle editor panel", defaults: ["Ctrl+E"], section: "Editor" },
  { id: "editor.save", description: "Save current file", defaults: ["Ctrl+S"], section: "Editor" },
  { id: "zoom.in", description: "Zoom in", defaults: ["Ctrl+=", "Ctrl+Num+"], section: "View" },
  { id: "zoom.out", description: "Zoom out", defaults: ["Ctrl+-", "Ctrl+Num-"], section: "View" },
  { id: "zoom.reset", description: "Reset zoom", defaults: ["Ctrl+0"], section: "View" },
  { id: "terminal.text_in", description: "Increase terminal text size", defaults: ["Ctrl+Shift+="], section: "Terminal" },
  { id: "terminal.text_out", description: "Decrease terminal text size", defaults: ["Ctrl+Shift+-"], section: "Terminal" },
  { id: "terminal.text_reset", description: "Reset terminal text size", defaults: ["Ctrl+Shift+0"], section: "Terminal" },
  { id: "fullscreen.toggle", description: "Toggle fullscreen", defaults: ["F11"], section: "View" },
  { id: "terminal.copy", description: "Copy from terminal", defaults: ["Ctrl+Shift+C", "Ctrl+Insert"], section: "Terminal" },
  { id: "terminal.paste", description: "Paste to terminal", defaults: ["Ctrl+Shift+V", "Shift+Insert"], section: "Terminal" },
  { id: "terminal.clear", description: "Clear terminal", defaults: ["Ctrl+L"], section: "Terminal" },
  { id: "clipboard.copy", description: "Copy (system)", defaults: ["Ctrl+C"], section: "General" },
  { id: "clipboard.paste", description: "Paste (system)", defaults: ["Ctrl+V"], section: "General" },
  { id: "clipboard.cut", description: "Cut (system)", defaults: ["Ctrl+X"], section: "General" },
  { id: "files.create_file", description: "Create new file", defaults: ["Alt+N"], section: "Files" },
  { id: "files.create_folder", description: "Create new folder", defaults: ["Alt+Shift+N"], section: "Files" },
  { id: "files.delete", description: "Delete file/folder", defaults: ["Delete"], section: "Files" },
  { id: "files.rename", description: "Rename file/folder", defaults: ["F2"], section: "Files" },
  { id: "select.all", description: "Select all", defaults: ["Ctrl+A"], section: "General" },
  { id: "sidebar.files", description: "Show files panel", defaults: ["Ctrl+Shift+E"], section: "General" },
  { id: "sidebar.snippets", description: "Show snippets panel", defaults: ["Ctrl+Shift+S"], section: "General" },
  { id: "ui.escape", description: "Close overlays", defaults: ["Escape"], section: "General" },
  { id: "tab.index.1", description: "Jump to tab 1", defaults: ["Alt+1"], section: "Tabs" },
  { id: "tab.index.2", description: "Jump to tab 2", defaults: ["Alt+2"], section: "Tabs" },
  { id: "tab.index.3", description: "Jump to tab 3", defaults: ["Alt+3"], section: "Tabs" },
  { id: "tab.index.4", description: "Jump to tab 4", defaults: ["Alt+4"], section: "Tabs" },
  { id: "tab.index.5", description: "Jump to tab 5", defaults: ["Alt+5"], section: "Tabs" },
  { id: "tab.index.6", description: "Jump to tab 6", defaults: ["Alt+6"], section: "Tabs" },
  { id: "tab.index.7", description: "Jump to tab 7", defaults: ["Alt+7"], section: "Tabs" },
  { id: "tab.index.8", description: "Jump to tab 8", defaults: ["Alt+8"], section: "Tabs" },
  { id: "tab.index.9", description: "Jump to tab 9", defaults: ["Alt+9"], section: "Tabs" },
];

export function getHotkeyRows(bindings: AppSettings["hotkeys"]) {
  const map = new Map(bindings.map((binding) => [binding.command_id, binding]));
  return hotkeyCatalog.map((item) => {
    const saved = map.get(item.id);
    const primary = saved ? saved.primary : item.defaults[0] ?? "";
    const alternates = saved ? saved.alternates ?? [] : item.defaults.slice(1);
    return {
      command_id: item.id,
      description: item.description,
      primary: saved ? primary : platformDefaultShortcut(primary, item.id),
      alternates: saved ? alternates : alternates.map((combo) => platformDefaultShortcut(combo, item.id)),
    };
  });
}

export function rangeProgressStyle(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return { "--range-progress": `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties;
}
