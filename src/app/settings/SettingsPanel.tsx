import { useEffect, useState, type CSSProperties } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  Palette,
  TerminalSquare,
  Keyboard,
  Globe,
  FolderOpen,
  Activity,
  FlaskConical,
  X,
  Plus,
  Pencil,
  Trash2,
  Search,
  Check
} from "lucide-react";
import type { AppSettings, CustomTheme } from "@/types/models";
import { getShellProfileOptions, platformDefaultShortcut } from "@/platform/platform";
import { ThemeEditor } from "./ThemeEditor";
import { applyTheme as applyThemeEngine, applyAppearanceOverrides } from "@/theme/themeEngine";
import { HotkeyRecorder, buildConflictMap, getProtectedCombos } from "./HotkeyRecorder";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  initialSection?: SettingsSection;
  highlightSetting?: string;
}

export type SettingsSection = "appearance" | "terminal" | "hotkeys" | "ssh" | "file_manager" | "status_bar" | "experimental";

const sections: { key: SettingsSection; label: string; icon: typeof Palette }[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "hotkeys", label: "Hotkeys", icon: Keyboard },
  { key: "ssh", label: "SSH", icon: Globe },
  { key: "file_manager", label: "File Manager", icon: FolderOpen },
  { key: "status_bar", label: "Status Bar", icon: Activity },
  { key: "experimental", label: "Experimental", icon: FlaskConical }
];

const themes = [
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

function getHotkeyRows(bindings: Array<{ command_id: string; primary: string; alternates?: string[] | null }>) {
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

function rangeProgressStyle(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return { "--range-progress": `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [draft, setDraft] = useState<AppSettings | null>(props.settings);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedPulse, setSavedPulse] = useState(false);

  const q = searchQuery.toLowerCase().trim();

  const showSection = (section: SettingsSection) => q !== "" || activeSection === section;

  const matches = (...texts: string[]) => {
    if (!q) return true;
    return texts.some((text) => text.toLowerCase().includes(q));
  };

  useEffect(() => {
    Promise.resolve().then(() => setDraft(props.settings));
  }, [props.settings]);

  useEffect(() => {
    if (props.open) {
      setActiveSection(props.initialSection ?? "appearance");
      setThemeEditorOpen(false);
      setEditingTheme(null);
      setSearchQuery("");

      if (props.highlightSetting) {
        window.setTimeout(() => {
          const targetId = `setting-${props.highlightSetting?.replace(/\s+/g, "-").toLowerCase()}`;
          const element = document.getElementById(targetId);
          if (!element) return;
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("highlight-flash");
          window.setTimeout(() => element.classList.remove("highlight-flash"), 2000);
        }, 120);
      }
    }
  }, [props.open, props.initialSection, props.highlightSetting]);

  useEffect(() => {
    if (draft?.appearance) {
      applyAppearanceOverrides(draft.appearance);
    }
  }, [draft?.appearance]);

  useEffect(() => {
    if (!props.open || !draft || draft === props.settings) return;
    const timer = window.setTimeout(() => {
      void props.onSave(draft);
      setSavedPulse(true);
      window.setTimeout(() => setSavedPulse(false), 1200);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, props.open, props.onSave, props.settings]);

  useEffect(() => {
    if (!props.open || themeEditorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [props.open, props.onClose, themeEditorOpen]);

  if (!props.open || !draft) return null;

  const hotkeyRows = getHotkeyRows(draft.hotkeys);
  const conflicts = buildConflictMap(
    hotkeyRows.map((item) => ({
      command_id: item.command_id,
      combos: [item.primary, ...(item.alternates ?? [])].filter((combo) => combo.trim() !== "")
    }))
  );
  const protectedCombos = getProtectedCombos();
  const hasConflicts = conflicts.size > 0;

  const currentTheme = draft.appearance?.theme ?? "charcoal";
  const customThemes = draft.appearance?.custom_themes ?? [];
  const shellOptions = getShellProfileOptions();

  const handleApplyTheme = (themeId: string) => {
    applyThemeEngine(themeId, customThemes);
    setDraft((p) =>
      p ? { ...p, appearance: { ...p.appearance, theme: themeId } } : p
    );
  };

  const chooseTerminalBackgroundImage = async () => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
      ],
    });
    if (typeof selected !== "string") return;
    setDraft((p) =>
      p ? { ...p, appearance: { ...p.appearance, terminal_background_image: selected } } : p
    );
  };

  const handleSaveCustomTheme = (theme: CustomTheme) => {
    setDraft((p) => {
      if (!p) return p;
      const existing = p.appearance.custom_themes ?? [];
      const idx = existing.findIndex((t) => t.id === theme.id);
      const next = idx >= 0
        ? existing.map((t) => t.id === theme.id ? theme : t)
        : [...existing, theme];
      return { ...p, appearance: { ...p.appearance, theme: theme.id, custom_themes: next } };
    });
    applyThemeEngine(theme.id, [...customThemes.filter(t => t.id !== theme.id), theme]);
    setThemeEditorOpen(false);
    setEditingTheme(null);
  };

  const handleDeleteCustomTheme = (themeId: string) => {
    setDraft((p) => {
      if (!p) return p;
      const next = (p.appearance.custom_themes ?? []).filter((t) => t.id !== themeId);
      const newActiveTheme = p.appearance.theme === themeId ? "charcoal" : p.appearance.theme;
      return { ...p, appearance: { ...p.appearance, theme: newActiveTheme, custom_themes: next } };
    });
    if (currentTheme === themeId) {
      applyThemeEngine("charcoal", []);
    }
    setThemeEditorOpen(false);
    setEditingTheme(null);
  };

  return (
    <div className="settings-overlay" onClick={props.onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-header">Settings</div>
          <div className="settings-search-wrap" style={{ margin: "0 8px 10px" }}>
            <Search size={13} strokeWidth={2} />
            <input
              className="settings-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all settings..."
            />
          </div>
          {sections.map((s) => {
            const Icon = s.icon;
            const navMatch = matches(s.label, s.key.replace("_", " "));
            return (
              <button
                key={s.key}
                className={`settings-nav-item ${activeSection === s.key ? "active" : ""}${q && navMatch ? " search-match" : ""}`}
                onClick={() => setActiveSection(s.key)}
              >
                <Icon size={15} strokeWidth={1.8} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          <div className="settings-content-header">
            <h2>{q ? "Search Results" : sections.find((s) => s.key === activeSection)?.label}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {savedPulse ? (
                <div className="settings-saved-indicator">
                  <Check size={12} strokeWidth={2} /> Saved
                </div>
              ) : null}
              <button onClick={props.onClose} className="ghost">
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {showSection("appearance") && (
            <div className="settings-section">
              <div id="setting-color-theme" className="settings-row" style={{ display: matches("appearance", "theme", "color theme") ? undefined : "none" }}>
                <label>Color Theme</label>
                <div className="theme-grid">
                  {themes.map((theme) => (
                    <button
                      key={theme.id}
                      className={`theme-card ${currentTheme === theme.id ? "active" : ""}`}
                      onClick={() => handleApplyTheme(theme.id)}
                    >
                      <div className="theme-preview" style={{ background: theme.preview }} />
                      <span>{theme.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Themes */}
              <div className="custom-themes-section" style={{ display: matches("custom theme", "theme editor", "appearance") ? undefined : "none" }}>
                <div className="custom-themes-section-title">Custom Themes</div>
                <div className="theme-grid">
                  {(draft.appearance.custom_themes ?? []).map((ct) => (
                    <button
                      key={ct.id}
                      className={`custom-theme-card ${currentTheme === ct.id ? "active" : ""}`}
                      onClick={() => handleApplyTheme(ct.id)}
                    >
                      <div className="theme-preview" style={{ background: ct.variables["--bg"] ?? "#333" }} />
                      <span>{ct.name}</span>
                      <div className="custom-theme-card-actions">
                        <button onClick={(e) => { e.stopPropagation(); setEditingTheme(ct); setThemeEditorOpen(true); }} title="Edit">
                          <Pencil size={10} strokeWidth={2} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteCustomTheme(ct.id); }} title="Delete">
                          <Trash2 size={10} strokeWidth={2} />
                        </button>
                      </div>
                    </button>
                  ))}
                  <button className="create-theme-btn" onClick={() => { setEditingTheme(null); setThemeEditorOpen(true); }}>
                    <Plus size={18} strokeWidth={1.5} />
                    <span>Create Theme</span>
                  </button>
                </div>
              </div>

              <div id="setting-accent-color" className="settings-row" style={{ display: matches("accent", "accent color") ? undefined : "none" }}>
                <label>Accent Color</label>
                <input
                  value={draft.appearance.accent_color}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, accent_color: e.target.value } } : p
                    )
                  }
                />
              </div>
              <div id="setting-ui-density" className="settings-row" style={{ display: matches("ui density", "density", "compact", "comfortable") ? undefined : "none" }}>
                <label>UI Density</label>
                <select
                  value={draft.appearance.ui_density}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, ui_density: e.target.value } } : p
                    )
                  }
                >
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </select>
              </div>
              <div id="setting-modal-blur" className="settings-row" style={{ display: matches("modal blur", "blur", "appearance") ? undefined : "none" }}>
                <label>Modal Background Blur</label>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={draft.appearance.modal_blur ?? 4}
                  style={rangeProgressStyle(draft.appearance.modal_blur ?? 4, 0, 20)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, modal_blur: Number(e.target.value) } } : p
                    )
                  }
                />
              </div>
              <div id="setting-modal-dimming" className="settings-row" style={{ display: matches("modal dimming", "dimming", "backdrop") ? undefined : "none" }}>
                <label>Modal Background Dimming</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draft.appearance.modal_dimming ?? 0.55}
                  style={rangeProgressStyle(draft.appearance.modal_dimming ?? 0.55, 0, 1)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, modal_dimming: Number(e.target.value) } } : p
                    )
                  }
                />
              </div>
              <div id="setting-ui-border-radius" className="settings-row" style={{ display: matches("border radius", "radius", "rounded") ? undefined : "none" }}>
                <label>UI Border Radius</label>
                <input
                  type="number"
                  min="0"
                  max="24"
                  value={draft.appearance.border_radius ?? 8}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, border_radius: Number(e.target.value) || 0 } } : p
                    )
                  }
                />
              </div>
              <div id="setting-app-opacity" className="settings-row" style={{ display: matches("app opacity", "window opacity", "glass", "transparency", "desktop") ? undefined : "none" }}>
                <label>App Opacity</label>
                <input
                  type="range"
                  min="0.35"
                  max="1"
                  step="0.01"
                  value={draft.appearance.window_opacity ?? 1}
                  style={rangeProgressStyle(draft.appearance.window_opacity ?? 1, 0.35, 1)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, window_opacity: Number(e.target.value) } } : p
                    )
                  }
                />
              </div>
              <div id="setting-app-background-image" className="settings-row" style={{ display: matches("app background image", "wallpaper", "background image", "terminal personalization") ? undefined : "none" }}>
                <label>App Background Image</label>
                <div className="settings-file-picker-row">
                  <input
                    value={draft.appearance.terminal_background_image ?? ""}
                    placeholder="/path/to/image.png"
                    onChange={(e) =>
                      setDraft((p) =>
                        p ? { ...p, appearance: { ...p.appearance, terminal_background_image: e.target.value } } : p
                      )
                    }
                  />
                  <button type="button" onClick={() => void chooseTerminalBackgroundImage()}>
                    Browse
                  </button>
                  {(draft.appearance.terminal_background_image ?? "").trim() ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setDraft((p) =>
                          p ? { ...p, appearance: { ...p.appearance, terminal_background_image: "" } } : p
                        )
                      }
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
              <div id="setting-app-background-dimming" className="settings-row" style={{ display: matches("app background dim", "wallpaper dim", "background image", "terminal personalization") ? undefined : "none" }}>
                <label>App Background Dimming</label>
                <input
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.01"
                  value={draft.appearance.terminal_background_dim ?? 0.35}
                  style={rangeProgressStyle(draft.appearance.terminal_background_dim ?? 0.35, 0, 0.9)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, terminal_background_dim: Number(e.target.value) } } : p
                    )
                  }
                />
              </div>
              <div className="settings-row" style={{ display: matches("tab switching", "ctrl+tab", "mru", "positional") ? undefined : "none" }}>
                <label>Tab Switching Order (Ctrl+Tab)</label>
                <select
                  value={draft.appearance.tab_switching_mode ?? "mru"}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, tab_switching_mode: e.target.value } } : p
                    )
                  }
                >
                  <option value="mru">Most Recently Used</option>
                  <option value="positional">Positional (left to right)</option>
                </select>
              </div>
            </div>
          )}

          {themeEditorOpen && (
            <ThemeEditor
              existingTheme={editingTheme}
              customThemes={draft.appearance.custom_themes ?? []}
              currentThemeId={currentTheme}
              onSave={handleSaveCustomTheme}
              onDelete={handleDeleteCustomTheme}
              onClose={() => { setThemeEditorOpen(false); setEditingTheme(null); }}
            />
          )}

          {showSection("terminal") && (
            <div className="settings-section">
              <div id="setting-default-shell" className="settings-row" style={{ display: matches("default shell", "shell", "powershell", "cmd", "zsh", "bash", "fish") ? undefined : "none" }}>
                <label>Default Shell</label>
                <select
                  value={draft.terminal.default_shell}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, default_shell: e.target.value } } : p
                    )
                  }
                >
                  {shellOptions.map((shell) => (
                    <option key={shell.id} value={shell.id}>{shell.label}</option>
                  ))}
                </select>
              </div>
              <div id="setting-font-family" className="settings-row" style={{ display: matches("font family", "terminal font") ? undefined : "none" }}>
                <label>Font Family</label>
                <input
                  value={draft.terminal.font_family}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, font_family: e.target.value } } : p
                    )
                  }
                />
              </div>
              <div id="setting-font-size" className="settings-row" style={{ display: matches("font size", "terminal font", "console text size") ? undefined : "none" }}>
                <label>Terminal Text Size</label>
                <input
                  type="number"
                  min="8"
                  max="40"
                  value={draft.terminal.font_size}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, font_size: Number(e.target.value) || 13 } } : p
                    )
                  }
                />
              </div>
              <div id="setting-cursor-style" className="settings-row" style={{ display: matches("cursor", "cursor style") ? undefined : "none" }}>
                <label>Cursor Style</label>
                <select
                  value={draft.terminal.cursor_style}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, cursor_style: e.target.value } } : p
                    )
                  }
                >
                  <option value="bar">Bar</option>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                </select>
              </div>
              <div id="setting-scrollback-lines" className="settings-row" style={{ display: matches("scrollback", "history", "lines") ? undefined : "none" }}>
                <label>Scrollback Lines</label>
                <input
                  type="number"
                  value={draft.terminal.scrollback_lines}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, terminal: { ...p.terminal, scrollback_lines: Number(e.target.value) || 20000 } }
                        : p
                    )
                  }
                />
              </div>
              <div id="setting-syntax-highlighting" className="settings-row-toggle">
                <span>Enable Shell Syntax Highlighting</span>
                <input
                  type="checkbox"
                  checked={draft.terminal.syntax_highlighting}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, terminal: { ...p.terminal, syntax_highlighting: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>
            </div>
          )}

          {showSection("hotkeys") && (
            <div className="settings-section">
              <div className="settings-hotkeys-title" style={{ display: matches("hotkey", "shortcut", "keybind") ? undefined : "none" }}>
                Command Bindings
                {hasConflicts ? <span className="hotkey-conflict-badge">Conflicts: {conflicts.size}</span> : null}
              </div>
              <div className="settings-hotkeys-list">
                {hotkeyRows
                  .filter((row) => {
                    const combos = [row.primary, ...(row.alternates ?? [])].filter(Boolean);
                    return matches("hotkey", row.description, row.command_id, ...combos);
                  })
                  .map((row) => {
                    const combos = [row.primary, ...(row.alternates ?? [])].filter(Boolean);
                    return (
                      <HotkeyRecorder
                        key={row.command_id}
                        commandId={row.command_id}
                        description={row.description}
                        combos={combos}
                        conflicts={conflicts}
                        protectedCombos={protectedCombos}
                        onChange={(nextCombos) => {
                          const normalized = nextCombos.map((combo) => combo.trim()).filter(Boolean);
                          const next = draft.hotkeys.filter((item) => item.command_id !== row.command_id);
                          next.push({
                            command_id: row.command_id,
                            primary: normalized[0] ?? "",
                            alternates: normalized.slice(1),
                          });
                          setDraft((p) => (p ? { ...p, hotkeys: next } : p));
                        }}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {showSection("ssh") && (
            <div className="settings-section">
              <div id="setting-connect-timeout" className="settings-row" style={{ display: matches("ssh", "timeout", "connect") ? undefined : "none" }}>
                <label>Connect Timeout (seconds)</label>
                <input
                  type="number"
                  value={draft.ssh.connect_timeout_seconds}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, ssh: { ...p.ssh, connect_timeout_seconds: Number(e.target.value) || 15 } }
                        : p
                    )
                  }
                />
              </div>
              <hr className="settings-divider" style={{ display: matches("strict", "host key", "ssh") ? undefined : "none" }} />
              <div id="setting-strict-host-key-checking" className="settings-row-toggle" style={{ display: matches("strict", "host key", "checking") ? undefined : "none" }}>
                <span>Strict Host Key Checking</span>
                <input
                  type="checkbox"
                  checked={draft.ssh.strict_host_key_checking}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, ssh: { ...p.ssh, strict_host_key_checking: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>
            </div>
          )}

          {showSection("file_manager") && (
            <div className="settings-section">
              <div id="setting-show-hidden-files" className="settings-row-toggle" style={{ display: matches("file manager", "hidden", "show hidden") ? undefined : "none" }}>
                <span>Show Hidden Files</span>
                <input
                  type="checkbox"
                  checked={draft.file_manager.show_hidden}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, file_manager: { ...p.file_manager, show_hidden: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>
            </div>
          )}

          {showSection("experimental") && (
            <div className="settings-section">
              <div className="settings-row-toggle" style={{ display: matches("experimental", "input overlay") ? undefined : "none" }}>
                <span>Input Overlay Mode</span>
                <input
                  type="checkbox"
                  checked={draft.experimental.input_overlay_mode}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, experimental: { ...p.experimental, input_overlay_mode: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>
            </div>
          )}

          {showSection("status_bar") && (
            <div className="settings-section">
              <div id="setting-enable-bottom-status-bar" className="settings-row-toggle" style={{ display: matches("status bar", "enable", "bottom") ? undefined : "none" }}>
                <span>Enable Bottom Status Bar</span>
                <input
                  type="checkbox"
                  checked={draft.status_bar.enabled}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, status_bar: { ...p.status_bar, enabled: e.target.checked } } : p
                    )
                  }
                />
              </div>

              <div id="setting-show-ssh-resource-monitor" className="settings-row-toggle" style={{ display: matches("resource", "cpu", "ram", "disk", "monitor") ? undefined : "none" }}>
                <span>Show SSH Resource Monitor</span>
                <input
                  type="checkbox"
                  checked={draft.status_bar.show_resource_monitor}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, status_bar: { ...p.status_bar, show_resource_monitor: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>

              <div id="setting-show-ssh-server-time" className="settings-row-toggle" style={{ display: matches("server time", "clock", "status") ? undefined : "none" }}>
                <span>Show SSH Server Time</span>
                <input
                  type="checkbox"
                  checked={draft.status_bar.show_server_time}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? { ...p, status_bar: { ...p.status_bar, show_server_time: e.target.checked } }
                        : p
                    )
                  }
                />
              </div>

              <div id="setting-ssh-poll-interval" className="settings-row" style={{ display: matches("poll interval", "status refresh", "seconds") ? undefined : "none" }}>
                <label>SSH Poll Interval (seconds)</label>
                <input
                  type="number"
                  min={3}
                  value={draft.status_bar.resource_poll_interval_seconds}
                  onChange={(e) =>
                    setDraft((p) =>
                      p
                        ? {
                            ...p,
                            status_bar: {
                              ...p.status_bar,
                              resource_poll_interval_seconds: Math.max(3, Number(e.target.value) || 8)
                            }
                          }
                        : p
                    )
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
