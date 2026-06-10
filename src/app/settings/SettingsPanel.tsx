import { useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Check
} from "lucide-react";
import type { AppSettings, CustomTheme } from "@/types/models";
import { getShellProfileOptions } from "@/platform/platform";
import { ThemeEditor } from "./ThemeEditor";
import { applyTheme as applyThemeEngine, applyAppearanceOverrides, applyAppearanceTheme } from "@/theme/themeEngine";
import { HotkeyRecorder, buildConflictMap, getProtectedCombos } from "./HotkeyRecorder";
import { getHotkeyRows, rangeProgressStyle, sections, themes, type SettingsSection } from "./SettingsPanel.model";
import { SettingsNav } from "./SettingsNav";

interface SettingsPanelProps {
  open: boolean;
  settings: AppSettings | null;
  onClose: () => void;
  onSave: (settings: AppSettings) => Promise<void>;
  initialSection?: SettingsSection;
  highlightSetting?: string;
}

export type { SettingsSection } from "./SettingsPanel.model";

export function SettingsPanel(props: SettingsPanelProps) {
  const { open, settings, onClose, onSave, initialSection, highlightSetting } = props;
  const [draft, setDraft] = useState<AppSettings | null>(settings);
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
    Promise.resolve().then(() => setDraft(settings));
  }, [settings]);

  useEffect(() => {
    if (open) {
      setActiveSection(initialSection ?? "appearance");
      setThemeEditorOpen(false);
      setEditingTheme(null);
      setSearchQuery("");

      if (highlightSetting) {
        window.setTimeout(() => {
          const targetId = `setting-${highlightSetting.replace(/\s+/g, "-").toLowerCase()}`;
          const element = document.getElementById(targetId);
          if (!element) return;
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          element.classList.add("highlight-flash");
          window.setTimeout(() => element.classList.remove("highlight-flash"), 2000);
        }, 120);
      }
    }
  }, [open, initialSection, highlightSetting]);

  useEffect(() => {
    if (draft?.appearance) {
      applyAppearanceTheme(draft.appearance);
      applyAppearanceOverrides(draft.appearance);
    }
  }, [draft?.appearance]);

  useEffect(() => {
    if (!open || !draft || draft === settings) return;
    const timer = window.setTimeout(() => {
      void onSave(draft);
      setSavedPulse(true);
      window.setTimeout(() => setSavedPulse(false), 1200);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, open, onSave, settings]);

  useEffect(() => {
    if (!open || themeEditorOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, themeEditorOpen]);

  if (!open || !draft) return null;

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
  const themeOptions = [
    ...themes.map((theme) => ({ id: theme.id, name: theme.name })),
    ...customThemes.map((theme) => ({ id: theme.id, name: theme.name })),
  ];
  const shellOptions = getShellProfileOptions();

  const handleApplyTheme = (themeId: string) => {
    applyThemeEngine(themeId, customThemes);
    setDraft((p) =>
      p ? { ...p, appearance: { ...p.appearance, theme: themeId, theme_mode: "manual" } } : p
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

  const chooseThemeBackgroundImage = async (themeId: string) => {
    const selected = await openDialog({
      multiple: false,
      directory: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
      ],
    });
    if (typeof selected !== "string") return;
    setDraft((p) =>
      p
        ? {
            ...p,
            appearance: {
              ...p.appearance,
              theme_background_images: { ...(p.appearance.theme_background_images ?? {}), [themeId]: selected },
            },
          }
        : p
    );
  };

  const clearThemeBackgroundImage = (themeId: string) => {
    setDraft((p) => {
      if (!p) return p;
      const next = { ...(p.appearance.theme_background_images ?? {}) };
      delete next[themeId];
      return { ...p, appearance: { ...p.appearance, theme_background_images: next } };
    });
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
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <SettingsNav
          activeSection={activeSection}
          searchQuery={searchQuery}
          normalizedQuery={q}
          matches={matches}
          onSectionChange={setActiveSection}
          onSearchQueryChange={setSearchQuery}
        />

        <div className="settings-content">
          <div className="settings-content-header">
            <h2>{q ? "Search Results" : sections.find((s) => s.key === activeSection)?.label}</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {savedPulse ? (
                <div className="settings-saved-indicator">
                  <Check size={12} strokeWidth={2} /> Saved
                </div>
              ) : null}
              <button onClick={onClose} className="ghost">
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </div>

          {showSection("appearance") && (
            <div className="settings-section">
              <div id="setting-theme-mode" className="settings-row" style={{ display: matches("appearance", "theme", "system theme", "automatic theme") ? undefined : "none" }}>
                <label>Theme Mode</label>
                <select
                  value={draft.appearance.theme_mode ?? "manual"}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, theme_mode: e.target.value as "manual" | "system" } } : p
                    )
                  }
                >
                  <option value="manual">Manual</option>
                  <option value="system">System</option>
                </select>
              </div>

              {(draft.appearance.theme_mode ?? "manual") === "system" ? (
                <div className="settings-row theme-system-row" style={{ display: matches("appearance", "theme", "system theme", "light theme", "dark theme") ? undefined : "none" }}>
                  <label>System Theme Pair</label>
                  <div className="theme-system-selects">
                    <select
                      value={draft.appearance.light_theme ?? "paper"}
                      aria-label="Light theme"
                      onChange={(e) =>
                        setDraft((p) =>
                          p ? { ...p, appearance: { ...p.appearance, light_theme: e.target.value } } : p
                        )
                      }
                    >
                      {themeOptions.map((theme) => (
                        <option key={theme.id} value={theme.id}>Light: {theme.name}</option>
                      ))}
                    </select>
                    <select
                      value={draft.appearance.dark_theme ?? "charcoal"}
                      aria-label="Dark theme"
                      onChange={(e) =>
                        setDraft((p) =>
                          p ? { ...p, appearance: { ...p.appearance, dark_theme: e.target.value } } : p
                        )
                      }
                    >
                      {themeOptions.map((theme) => (
                        <option key={theme.id} value={theme.id}>Dark: {theme.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : null}

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
              <div id="setting-app-blur" className="settings-row" style={{ display: matches("app blur", "window blur", "glass", "transparency", "desktop") ? undefined : "none" }}>
                <label>App Background Blur</label>
                <input
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  value={draft.appearance.window_blur ?? 8}
                  style={rangeProgressStyle(draft.appearance.window_blur ?? 8, 0, 24)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, window_blur: Number(e.target.value) } } : p
                    )
                  }
                />
              </div>
              <div id="setting-panel-blur" className="settings-row" style={{ display: matches("panel blur", "sidebar blur", "file manager blur", "glass", "transparency") ? undefined : "none" }}>
                <label>Panel Blur</label>
                <input
                  type="range"
                  min="0"
                  max="28"
                  step="1"
                  value={draft.appearance.panel_blur ?? 12}
                  style={rangeProgressStyle(draft.appearance.panel_blur ?? 12, 0, 28)}
                  onChange={(e) =>
                    setDraft((p) =>
                      p ? { ...p, appearance: { ...p.appearance, panel_blur: Number(e.target.value) } } : p
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
              {(draft.appearance.theme_mode ?? "manual") === "system" && (
                <div id="setting-per-theme-background" className="settings-row settings-row-stack" style={{ display: matches("app background image", "wallpaper", "background image", "per theme background", "theme image") ? undefined : "none" }}>
                  <label>Per-Theme Background (System mode)</label>
                  <div className="settings-hint">Each theme in your light/dark pair can use its own image. If unset, the App Background Image above is used.</div>
                  {Array.from(new Set([draft.appearance.light_theme ?? "paper", draft.appearance.dark_theme ?? "charcoal"])).map((themeId) => {
                    const themeName = themes.find((t) => t.id === themeId)?.name
                      ?? (draft.appearance.custom_themes ?? []).find((t) => t.id === themeId)?.name
                      ?? themeId;
                    const value = draft.appearance.theme_background_images?.[themeId] ?? "";
                    return (
                      <div key={themeId} className="settings-file-picker-row per-theme-bg-row">
                        <span className="per-theme-bg-name">{themeName}</span>
                        <input
                          value={value}
                          placeholder="Use default image"
                          onChange={(e) =>
                            setDraft((p) =>
                              p
                                ? {
                                    ...p,
                                    appearance: {
                                      ...p.appearance,
                                      theme_background_images: { ...(p.appearance.theme_background_images ?? {}), [themeId]: e.target.value },
                                    },
                                  }
                                : p
                            )
                          }
                        />
                        <button type="button" onClick={() => void chooseThemeBackgroundImage(themeId)}>Browse</button>
                        {value.trim() ? (
                          <button type="button" className="ghost" onClick={() => clearThemeBackgroundImage(themeId)}>Clear</button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
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
                  min={1}
                  max={120}
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
