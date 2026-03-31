import { useEffect, useState } from "react";
import {
  Palette,
  TerminalSquare,
  Keyboard,
  Globe,
  FolderOpen,
  FlaskConical,
  X
} from "lucide-react";
import type { AppSettings } from "@/types/models";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}

type SettingsSection = "appearance" | "terminal" | "hotkeys" | "ssh" | "file_manager" | "experimental";

const sections: { key: SettingsSection; label: string; icon: typeof Palette }[] = [
  { key: "appearance", label: "Appearance", icon: Palette },
  { key: "terminal", label: "Terminal", icon: TerminalSquare },
  { key: "hotkeys", label: "Hotkeys", icon: Keyboard },
  { key: "ssh", label: "SSH", icon: Globe },
  { key: "file_manager", label: "File Manager", icon: FolderOpen },
  { key: "experimental", label: "Experimental", icon: FlaskConical }
];

const themes = [
  { id: "charcoal", name: "Charcoal", preview: "#1a1d23" },
  { id: "midnight", name: "Midnight", preview: "#0a0e14" },
  { id: "nord", name: "Nord", preview: "#2e3440" },
  { id: "monokai", name: "Monokai", preview: "#272822" }
];

export function SettingsPanel(props: SettingsPanelProps) {
  const [draft, setDraft] = useState<AppSettings | null>(props.settings);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");

  useEffect(() => {
    Promise.resolve().then(() => setDraft(props.settings));
  }, [props.settings]);

  useEffect(() => {
    if (props.open) setActiveSection("appearance");
  }, [props.open]);

  if (!props.open || !draft) return null;

  const currentTheme = document.documentElement.getAttribute("data-theme") ?? "charcoal";

  const applyTheme = (themeId: string) => {
    document.documentElement.setAttribute("data-theme", themeId);
    setDraft((p) =>
      p ? { ...p, appearance: { ...p.appearance, theme: themeId } } : p
    );
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
                      onClick={() => applyTheme(theme.id)}
                    >
                      <div className="theme-preview" style={{ background: theme.preview }} />
                      <span>{theme.name}</span>
                    </button>
                  ))}
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
            </div>
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
            </div>
          )}

          {activeSection === "hotkeys" && (
            <div className="settings-section">
              {draft.hotkeys.map((binding, index) => (
                <div className="settings-row" key={binding.command_id}>
                  <label>{binding.command_id}</label>
                  <input
                    value={binding.primary}
                    onChange={(e) => {
                      const next = [...draft.hotkeys];
                      next[index] = { ...next[index], primary: e.target.value };
                      setDraft((p) => (p ? { ...p, hotkeys: next } : p));
                    }}
                  />
                </div>
              ))}
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
        </div>
      </div>
    </div>
  );
}
