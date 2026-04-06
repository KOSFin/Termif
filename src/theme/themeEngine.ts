import type { CustomTheme } from "@/types/models";

export interface ThemeVariable {
  key: string;
  label: string;
  category: "backgrounds" | "borders" | "text" | "accents" | "semantic";
}

export const THEME_VARIABLES: ThemeVariable[] = [
  // Backgrounds
  { key: "--bg",          label: "Background",        category: "backgrounds" },
  { key: "--bg-elev-1",   label: "Elevated 1",        category: "backgrounds" },
  { key: "--bg-elev-2",   label: "Elevated 2",        category: "backgrounds" },
  { key: "--bg-panel",    label: "Panel",             category: "backgrounds" },
  { key: "--bg-surface",  label: "Surface",           category: "backgrounds" },
  { key: "--bg-hover",    label: "Hover",             category: "backgrounds" },
  { key: "--bg-active",   label: "Active",            category: "backgrounds" },
  // Borders
  { key: "--stroke",      label: "Border",            category: "borders" },
  { key: "--stroke-soft", label: "Border Soft",       category: "borders" },
  // Text
  { key: "--text",        label: "Text",              category: "text" },
  { key: "--text-muted",  label: "Text Muted",        category: "text" },
  { key: "--text-bright", label: "Text Bright",       category: "text" },
  // Accents
  { key: "--accent",      label: "Accent",            category: "accents" },
  { key: "--accent-hover",label: "Accent Hover",      category: "accents" },
  { key: "--accent-dim",  label: "Accent Dim",        category: "accents" },
  { key: "--accent-2",    label: "Accent Secondary",  category: "accents" },
  // Semantic
  { key: "--danger",      label: "Danger",            category: "semantic" },
  { key: "--danger-dim",  label: "Danger Dim",        category: "semantic" },
  { key: "--warning",     label: "Warning",           category: "semantic" },
];

export const BUILT_IN_THEMES: Record<string, Record<string, string>> = {
  charcoal: {
    "--bg": "#1a1d23", "--bg-elev-1": "#21252b", "--bg-elev-2": "#282c34",
    "--bg-panel": "#1e2127", "--bg-surface": "#2c313a", "--bg-hover": "#2c313a",
    "--bg-active": "#333842", "--stroke": "#3a3f4b", "--stroke-soft": "#2e333d",
    "--text": "#abb2bf", "--text-muted": "#636d83", "--text-bright": "#e6e8ee",
    "--accent": "#61afef", "--accent-hover": "#74bef4", "--accent-dim": "rgba(97, 175, 239, 0.12)",
    "--accent-2": "#98c379", "--danger": "#e06c75", "--danger-dim": "rgba(224, 108, 117, 0.12)",
    "--warning": "#e5c07b",
  },
  midnight: {
    "--bg": "#0a0e14", "--bg-elev-1": "#111620", "--bg-elev-2": "#181d27",
    "--bg-panel": "#0e1219", "--bg-surface": "#151a24", "--bg-hover": "#1c2230",
    "--bg-active": "#222939", "--stroke": "#1e2733", "--stroke-soft": "#171d27",
    "--text": "#d4dae6", "--text-muted": "#6b7a8d", "--text-bright": "#eef1f8",
    "--accent": "#4a8fe7", "--accent-hover": "#5a9ef2", "--accent-dim": "rgba(74, 143, 231, 0.12)",
    "--accent-2": "#3dba84", "--danger": "#e05468", "--danger-dim": "rgba(224, 84, 104, 0.12)",
    "--warning": "#e0a84a",
  },
  nord: {
    "--bg": "#2e3440", "--bg-elev-1": "#3b4252", "--bg-elev-2": "#434c5e",
    "--bg-panel": "#353b49", "--bg-surface": "#3b4252", "--bg-hover": "#434c5e",
    "--bg-active": "#4c566a", "--stroke": "#4c566a", "--stroke-soft": "#434c5e",
    "--text": "#d8dee9", "--text-muted": "#8691a8", "--text-bright": "#eceff4",
    "--accent": "#88c0d0", "--accent-hover": "#8fbcbb", "--accent-dim": "rgba(136, 192, 208, 0.15)",
    "--accent-2": "#a3be8c", "--danger": "#bf616a", "--danger-dim": "rgba(191, 97, 106, 0.12)",
    "--warning": "#ebcb8b",
  },
  monokai: {
    "--bg": "#272822", "--bg-elev-1": "#2d2e27", "--bg-elev-2": "#383930",
    "--bg-panel": "#2a2b24", "--bg-surface": "#333428", "--bg-hover": "#3e3f37",
    "--bg-active": "#494a40", "--stroke": "#49483e", "--stroke-soft": "#3b3c33",
    "--text": "#f8f8f2", "--text-muted": "#8f908a", "--text-bright": "#ffffff",
    "--accent": "#66d9ef", "--accent-hover": "#79e0f5", "--accent-dim": "rgba(102, 217, 239, 0.12)",
    "--accent-2": "#a6e22e", "--danger": "#f92672", "--danger-dim": "rgba(249, 38, 114, 0.12)",
    "--warning": "#e6db74",
  },
};

export const BUILT_IN_THEME_IDS = Object.keys(BUILT_IN_THEMES);

const ALL_CSS_VARS = THEME_VARIABLES.map((v) => v.key);

export function clearCustomOverrides(): void {
  ALL_CSS_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
}

export function applyTheme(themeId: string, customThemes: CustomTheme[] = []): void {
  clearCustomOverrides();

  const custom = customThemes.find((t) => t.id === themeId);
  if (custom) {
    document.documentElement.setAttribute("data-theme", custom.base_theme);
    for (const [key, value] of Object.entries(custom.variables)) {
      document.documentElement.style.setProperty(key, value);
    }
  } else {
    document.documentElement.setAttribute("data-theme", themeId);
  }
}

export function getThemeValues(themeId: string, customThemes: CustomTheme[] = []): Record<string, string> {
  const custom = customThemes.find((t) => t.id === themeId);
  if (custom) {
    const base = BUILT_IN_THEMES[custom.base_theme] ?? BUILT_IN_THEMES.charcoal;
    return { ...base, ...custom.variables };
  }
  return BUILT_IN_THEMES[themeId] ?? BUILT_IN_THEMES.charcoal;
}

export function isBuiltInTheme(themeId: string): boolean {
  return themeId in BUILT_IN_THEMES;
}
