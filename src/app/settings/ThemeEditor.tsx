import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { CustomTheme } from "@/types/models";
import {
  THEME_VARIABLES,
  BUILT_IN_THEMES,
  BUILT_IN_THEME_IDS,
  applyTheme,
  type ThemeVariable,
} from "@/theme/themeEngine";

interface ThemeEditorProps {
  existingTheme?: CustomTheme | null;
  customThemes: CustomTheme[];
  currentThemeId: string;
  onSave: (theme: CustomTheme) => void;
  onDelete?: (themeId: string) => void;
  onClose: () => void;
}

const CATEGORIES: { key: ThemeVariable["category"]; label: string }[] = [
  { key: "backgrounds", label: "Backgrounds" },
  { key: "borders", label: "Borders" },
  { key: "text", label: "Text" },
  { key: "accents", label: "Accents" },
  { key: "semantic", label: "Semantic" },
];

function hexToInput(value: string): string {
  // Convert rgba/color values to hex for input[type=color]
  if (value.startsWith("#") && (value.length === 7 || value.length === 4)) {
    return value;
  }
  if (value.startsWith("rgba")) {
    // Extract base color from rgba, approximate to hex
    const match = value.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, "0");
      const g = parseInt(match[2]).toString(16).padStart(2, "0");
      const b = parseInt(match[3]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
  }
  return "#000000";
}

export function ThemeEditor({ existingTheme, customThemes, currentThemeId, onSave, onDelete, onClose }: ThemeEditorProps) {
  const [name, setName] = useState(existingTheme?.name ?? "");
  const [baseTheme, setBaseTheme] = useState(existingTheme?.base_theme ?? "charcoal");
  const [variables, setVariables] = useState<Record<string, string>>(() => {
    if (existingTheme) {
      const base = BUILT_IN_THEMES[existingTheme.base_theme] ?? BUILT_IN_THEMES.charcoal;
      return { ...base, ...existingTheme.variables };
    }
    return { ...(BUILT_IN_THEMES.charcoal) };
  });

  // Live preview: apply changes as user edits
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", baseTheme);
    for (const [key, value] of Object.entries(variables)) {
      document.documentElement.style.setProperty(key, value);
    }
    return () => {
      // Revert on unmount
    };
  }, [variables, baseTheme]);

  const handleBaseChange = (newBase: string) => {
    setBaseTheme(newBase);
    const baseVals = BUILT_IN_THEMES[newBase] ?? BUILT_IN_THEMES.charcoal;
    // Keep user overrides, fill missing from new base
    setVariables((prev) => {
      const merged: Record<string, string> = {};
      for (const v of THEME_VARIABLES) {
        merged[v.key] = prev[v.key] ?? baseVals[v.key] ?? "";
      }
      return merged;
    });
  };

  const handleResetToBase = () => {
    const baseVals = BUILT_IN_THEMES[baseTheme] ?? BUILT_IN_THEMES.charcoal;
    setVariables({ ...baseVals });
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    // Compute only the overrides (diff from base)
    const baseVals = BUILT_IN_THEMES[baseTheme] ?? BUILT_IN_THEMES.charcoal;
    const overrides: Record<string, string> = {};
    for (const v of THEME_VARIABLES) {
      if (variables[v.key] && variables[v.key] !== baseVals[v.key]) {
        overrides[v.key] = variables[v.key];
      }
    }

    const theme: CustomTheme = {
      id: existingTheme?.id ?? crypto.randomUUID(),
      name: trimmed,
      base_theme: baseTheme,
      variables: overrides,
    };
    onSave(theme);
  };

  const handleClose = () => {
    // Revert to the theme that was active before editing
    applyTheme(currentThemeId, customThemes);
    onClose();
  };

  const setVar = (key: string, value: string) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-panel modal-panel-lg" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "calc(100vh - 60px)" }}>
        <div className="modal-header">
          <h3>{existingTheme ? "Edit Theme" : "Create Theme"}</h3>
          <button className="ghost" onClick={handleClose}><X size={14} strokeWidth={2} /></button>
        </div>

        <div className="modal-body" style={{ overflowY: "auto", gap: "16px" }}>
          <div className="theme-editor-row">
            <label>Theme Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Custom Theme"
                autoFocus
              />
            </label>
          </div>

          <div className="theme-editor-row">
            <label>Base Theme
              <select value={baseTheme} onChange={(e) => handleBaseChange(e.target.value)}>
                {BUILT_IN_THEME_IDS.map((id) => (
                  <option key={id} value={id}>{id.charAt(0).toUpperCase() + id.slice(1)}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="ghost" onClick={handleResetToBase} style={{ fontSize: "12px" }}>
              Reset to base
            </button>
          </div>

          {CATEGORIES.map((cat) => {
            const vars = THEME_VARIABLES.filter((v) => v.category === cat.key);
            return (
              <div key={cat.key} className="theme-editor-category">
                <div className="theme-editor-category-title">{cat.label}</div>
                <div className="theme-editor-category-grid">
                  {vars.map((v) => {
                    const value = variables[v.key] ?? "";
                    const isRgba = value.startsWith("rgba");
                    return (
                      <div key={v.key} className="theme-editor-color-row">
                        <input
                          type="color"
                          value={hexToInput(value)}
                          onChange={(e) => setVar(v.key, e.target.value)}
                          className="theme-editor-color-picker"
                        />
                        <div className="theme-editor-color-info">
                          <span className="theme-editor-color-label">{v.label}</span>
                          <input
                            className="theme-editor-color-hex"
                            value={value}
                            onChange={(e) => setVar(v.key, e.target.value)}
                            placeholder="#000000"
                          />
                        </div>
                        {isRgba && (
                          <span className="theme-editor-rgba-badge">rgba</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="modal-footer">
          {existingTheme && onDelete && (
            <button
              className="danger"
              onClick={() => { onDelete(existingTheme.id); }}
              style={{ marginRight: "auto" }}
            >
              Delete
            </button>
          )}
          <button className="ghost" onClick={handleClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={!name.trim()}>
            {existingTheme ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
