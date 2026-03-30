import { useEffect, useState } from "react";
import {
  PaletteIcon,
  TerminalIcon,
  KeyboardIcon,
  GlobeIcon,
  FolderSimpleIcon,
  FlaskIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { AppSettings } from "@/types/models";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}

type SettingsSection = "appearance" | "terminal" | "hotkeys" | "ssh" | "file_manager" | "experimental";

const sections: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
  { key: "appearance", label: "Appearance", icon: <PaletteIcon size={15} /> },
  { key: "terminal", label: "Terminal", icon: <TerminalIcon size={15} /> },
  { key: "hotkeys", label: "Hotkeys", icon: <KeyboardIcon size={15} /> },
  { key: "ssh", label: "SSH", icon: <GlobeIcon size={15} /> },
  { key: "file_manager", label: "File Manager", icon: <FolderSimpleIcon size={15} /> },
  { key: "experimental", label: "Experimental", icon: <FlaskIcon size={15} /> }
];

const accentPresets = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#5fb4d4", "#d47ea8", "#7cb87a"];

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle-switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className="toggle-knob" />
    </button>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-picker">
      <div className="color-picker-swatches">
        {accentPresets.map((color) => (
          <button
            key={color}
            type="button"
            className={`color-picker-swatch ${value === color ? "active" : ""}`}
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
      <div className="color-picker-input-row">
        <div className="color-picker-preview" style={{ background: value }} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#4a8fe7"
          maxLength={7}
        />
      </div>
    </div>
  );
}

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

  return (
    <div className="settings-overlay" onClick={props.onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-header">Settings</div>
          {sections.map((s) => (
            <button
              key={s.key}
              className={`settings-nav-item ${activeSection === s.key ? "active" : ""}`}
              onClick={() => setActiveSection(s.key)}
            >
              <span className="settings-nav-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <div className="settings-content-header">
            <h2>{sections.find((s) => s.key === activeSection)?.label}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => void props.onSave(draft)} className="primary">Save</button>
              <button onClick={props.onClose} className="ghost">
                <XIcon size={14} />
              </button>
            </div>
          </div>

          {activeSection === "appearance" && (
            <div className="settings-section">
              <div className="settings-row">
                <label>Accent Color</label>
                <ColorPicker
                  value={draft.appearance.accent_color}
                  onChange={(v) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, accent_color: v } } : p
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
                <ToggleSwitch
                  checked={draft.ssh.strict_host_key_checking}
                  onChange={(v) =>
                    setDraft((p) =>
                      p
                        ? { ...p, ssh: { ...p.ssh, strict_host_key_checking: v } }
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
                <ToggleSwitch
                  checked={draft.file_manager.show_hidden}
                  onChange={(v) =>
                    setDraft((p) =>
                      p
                        ? { ...p, file_manager: { ...p.file_manager, show_hidden: v } }
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
                <ToggleSwitch
                  checked={draft.experimental.input_overlay_mode}
                  onChange={(v) =>
                    setDraft((p) =>
                      p
                        ? { ...p, experimental: { ...p.experimental, input_overlay_mode: v } }
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
