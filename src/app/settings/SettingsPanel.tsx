import { useEffect, useState } from "react";
import type { AppSettings } from "@/types/models";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [draft, setDraft] = useState<AppSettings | null>(props.settings);

  useEffect(() => {
    // Avoid direct setState in effect body; use microtask to prevent cascading renders
    Promise.resolve().then(() => setDraft(props.settings));
  }, [props.settings]);

  if (!props.open || !draft) {
    return null;
  }

  return (
    <div className="settings-overlay" onClick={props.onClose}>
      <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button onClick={props.onClose}>Close</button>
        </div>

        <div className="settings-grid">
          <section>
            <h3>Appearance</h3>
            <label>
              Accent Color
              <input
                value={draft.appearance.accent_color}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          appearance: { ...prev.appearance, accent_color: event.target.value }
                        }
                      : prev
                  )
                }
              />
            </label>
            <label>
              UI Density
              <select
                value={draft.appearance.ui_density}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          appearance: { ...prev.appearance, ui_density: event.target.value }
                        }
                      : prev
                  )
                }
              >
                <option value="compact">Compact</option>
                <option value="comfortable">Comfortable</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Terminal</h3>
            <label>
              Default Shell
              <select
                value={draft.terminal.default_shell}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          terminal: { ...prev.terminal, default_shell: event.target.value }
                        }
                      : prev
                  )
                }
              >
                <option value="powershell">PowerShell</option>
                <option value="cmd">CMD</option>
                <option value="pwsh">PowerShell 7</option>
              </select>
            </label>
            <label>
              Cursor Style
              <select
                value={draft.terminal.cursor_style}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          terminal: { ...prev.terminal, cursor_style: event.target.value }
                        }
                      : prev
                  )
                }
              >
                <option value="bar">Bar</option>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
              </select>
            </label>
          </section>

          <section>
            <h3>Hotkeys</h3>
            {draft.hotkeys.map((binding, index) => (
              <label key={binding.command_id}>
                {binding.command_id}
                <input
                  value={binding.primary}
                  onChange={(event) => {
                    const next = [...draft.hotkeys];
                    next[index] = { ...next[index], primary: event.target.value };
                    setDraft((prev) => (prev ? { ...prev, hotkeys: next } : prev));
                  }}
                />
              </label>
            ))}
          </section>

          <section>
            <h3>SSH</h3>
            <label>
              Connect Timeout (s)
              <input
                type="number"
                value={draft.ssh.connect_timeout_seconds}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          ssh: {
                            ...prev.ssh,
                            connect_timeout_seconds: Number(event.target.value) || 15
                          }
                        }
                      : prev
                  )
                }
              />
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.ssh.strict_host_key_checking}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          ssh: {
                            ...prev.ssh,
                            strict_host_key_checking: event.target.checked
                          }
                        }
                      : prev
                  )
                }
              />
              Strict Host Key Checking
            </label>
          </section>

          <section>
            <h3>File Manager</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.file_manager.show_hidden}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          file_manager: {
                            ...prev.file_manager,
                            show_hidden: event.target.checked
                          }
                        }
                      : prev
                  )
                }
              />
              Show Hidden Files
            </label>
          </section>

          <section>
            <h3>Experimental</h3>
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.experimental.input_overlay_mode}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev
                      ? {
                          ...prev,
                          experimental: {
                            ...prev.experimental,
                            input_overlay_mode: event.target.checked
                          }
                        }
                      : prev
                  )
                }
              />
              Input Overlay Mode
            </label>
          </section>
        </div>

        <div className="settings-footer">
          <button
            onClick={() => {
              void props.onSave(draft);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
