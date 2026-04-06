import { useEffect, useState } from "react";
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
  Trash2
} from "lucide-react";
import type { AppSettings, CustomTheme } from "@/types/models";
import { ThemeEditor } from "./ThemeEditor";
import { applyTheme as applyThemeEngine } from "@/theme/themeEngine";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}

type SettingsSection = "appearance" | "terminal" | "hotkeys" | "ssh" | "file_manager" | "status_bar" | "experimental";

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
  { id: "monokai", name: "Monokai", preview: "#272822" }
];

const hotkeyCatalog: Array<{ id: string; description: string; defaults: string[] }> = [
  { id: "palette.open", description: "Open command palette", defaults: ["Ctrl+Shift+P"] },
  { id: "sidebar.toggle", description: "Toggle file sidebar", defaults: ["Ctrl+B"] },
  { id: "tab.new_default", description: "New terminal tab", defaults: ["Ctrl+T"] },
  { id: "tab.close", description: "Close current tab", defaults: ["Ctrl+W"] },
  { id: "settings.open", description: "Open settings", defaults: ["Ctrl+,"] },
  { id: "tab.switcher.next", description: "Tab switcher next", defaults: ["Ctrl+Tab"] },
  { id: "tab.switcher.prev", description: "Tab switcher previous", defaults: ["Ctrl+Shift+Tab"] },
  { id: "files.refresh", description: "Refresh file manager", defaults: ["F5", "Ctrl+R"] },
  { id: "editor.toggle", description: "Toggle editor panel", defaults: ["Ctrl+E"] },
  { id: "zoom.in", description: "Zoom in", defaults: ["Ctrl+=", "Ctrl+Num+"] },
  { id: "zoom.out", description: "Zoom out", defaults: ["Ctrl+-", "Ctrl+Num-"] },
  { id: "zoom.reset", description: "Reset zoom", defaults: ["Ctrl+0"] },
  { id: "ui.escape", description: "Close overlays", defaults: ["Escape"] },
  { id: "tab.index.1", description: "Jump to tab 1", defaults: ["Alt+1"] },
  { id: "tab.index.2", description: "Jump to tab 2", defaults: ["Alt+2"] },
  { id: "tab.index.3", description: "Jump to tab 3", defaults: ["Alt+3"] },
  { id: "tab.index.4", description: "Jump to tab 4", defaults: ["Alt+4"] },
  { id: "tab.index.5", description: "Jump to tab 5", defaults: ["Alt+5"] },
  { id: "tab.index.6", description: "Jump to tab 6", defaults: ["Alt+6"] },
  { id: "tab.index.7", description: "Jump to tab 7", defaults: ["Alt+7"] },
  { id: "tab.index.8", description: "Jump to tab 8", defaults: ["Alt+8"] },
  { id: "tab.index.9", description: "Jump to tab 9", defaults: ["Alt+9"] },
];

function getHotkeyRows(bindings: Array<{ command_id: string; primary: string; alternates?: string[] | null }>) {
  const map = new Map(bindings.map((binding) => [binding.command_id, binding]));
  return hotkeyCatalog.map((item) => {
    const saved = map.get(item.id);
    return {
      command_id: item.id,
      description: item.description,
      primary: saved?.primary ?? item.defaults[0],
      alternates: saved?.alternates ?? item.defaults.slice(1),
    };
  });
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [draft, setDraft] = useState<AppSettings | null>(props.settings);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<CustomTheme | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => setDraft(props.settings));
  }, [props.settings]);

  useEffect(() => {
    if (props.open) {
      setActiveSection("appearance");
      setThemeEditorOpen(false);
      setEditingTheme(null);
    }
  }, [props.open]);

  if (!props.open || !draft) return null;

  const hotkeyRows = getHotkeyRows(draft.hotkeys);

  const currentTheme = draft.appearance?.theme ?? "charcoal";
  const customThemes = draft.appearance?.custom_themes ?? [];

  const handleApplyTheme = (themeId: string) => {
    applyThemeEngine(themeId, customThemes);
    setDraft((p) =>
      p ? { ...p, appearance: { ...p.appearance, theme: themeId } } : p
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
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                className={`settings-nav-item ${activeSection === s.key ? "active" : ""}`}
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
            <h2>{sections.find((s) => s.key === activeSection)?.label}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => void props.onSave(draft)} className="primary">Save</button>
              <button onClick={props.onClose} className="ghost">
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {activeSection === "appearance" && (
            <div className="settings-section">
              <div className="settings-row">
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
              <div className="custom-themes-section">
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

              <div className="settings-row">
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
              <div className="settings-row">
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
              <div className="settings-row">
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

          {activeSection === "terminal" && (
            <div className="settings-section">
              <div className="settings-row">
                <label>Default Shell</label>
                <select
                  value={draft.terminal.default_shell}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, default_shell: e.target.value } } : p
                    )
                  }
                >
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">CMD</option>
                  <option value="pwsh">PowerShell 7</option>
                </select>
              </div>
              <div className="settings-row">
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
              <div className="settings-row">
                <label>Font Size</label>
                <input
                  type="number"
                  value={draft.terminal.font_size}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, terminal: { ...p.terminal, font_size: Number(e.target.value) || 13 } } : p
                    )
                  }
                />
              </div>
              <div className="settings-row">
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
              <div className="settings-row">
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
              <div className="settings-row-toggle">
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

          {activeSection === "hotkeys" && (
            <div className="settings-section">
              <div className="settings-hotkeys-title">Command Bindings</div>
              <div className="settings-hotkeys-list">
                {hotkeyRows.map((row) => (
                  <div key={row.command_id} className="settings-hotkeys-item">
                    <div className="settings-hotkey-desc-wrap">
                      <span className="settings-hotkey-desc">{row.description}</span>
                      <span className="settings-hotkey-id">{row.command_id}</span>
                    </div>
                    <div className="settings-hotkeys-inputs">
                      <input
                        value={row.primary}
                        onChange={(e) => {
                          const next = draft.hotkeys.filter((item) => item.command_id !== row.command_id);
                          next.push({ command_id: row.command_id, primary: e.target.value, alternates: row.alternates });
                          setDraft((p) => (p ? { ...p, hotkeys: next } : p));
                        }}
                        placeholder="Primary combo"
                      />
                      <input
                        value={(row.alternates ?? []).join(", ")}
                        onChange={(e) => {
                          const alternates = e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean);
                          const next = draft.hotkeys.filter((item) => item.command_id !== row.command_id);
                          next.push({ command_id: row.command_id, primary: row.primary, alternates });
                          setDraft((p) => (p ? { ...p, hotkeys: next } : p));
                        }}
                        placeholder="Additional combos, comma separated"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSection === "ssh" && (
            <div className="settings-section">
              <div className="settings-row">
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
              <hr className="settings-divider" />
              <div className="settings-row-toggle">
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

          {activeSection === "file_manager" && (
            <div className="settings-section">
              <div className="settings-row-toggle">
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

          {activeSection === "experimental" && (
            <div className="settings-section">
              <div className="settings-row-toggle">
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

          {activeSection === "status_bar" && (
            <div className="settings-section">
              <div className="settings-row-toggle">
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

              <div className="settings-row-toggle">
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

              <div className="settings-row-toggle">
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

              <div className="settings-row">
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
