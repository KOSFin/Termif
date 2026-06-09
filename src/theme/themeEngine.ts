import { convertFileSrc } from "@tauri-apps/api/core";
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
  amethyst: {
    "--bg": "#171221", "--bg-elev-1": "#21192f", "--bg-elev-2": "#2b2140",
    "--bg-panel": "#1d162b", "--bg-surface": "#2f2445", "--bg-hover": "#382a52",
    "--bg-active": "#453160", "--stroke": "#55416f", "--stroke-soft": "#3c2d55",
    "--text": "#d8d0e8", "--text-muted": "#8f80a8", "--text-bright": "#fff7ff",
    "--accent": "#b98cff", "--accent-hover": "#c9a4ff", "--accent-dim": "rgba(185, 140, 255, 0.15)",
    "--accent-2": "#47d6b4", "--danger": "#ff6f91", "--danger-dim": "rgba(255, 111, 145, 0.13)",
    "--warning": "#f3c96b",
  },
  ember: {
    "--bg": "#161412", "--bg-elev-1": "#211d1a", "--bg-elev-2": "#2b2621",
    "--bg-panel": "#1d1916", "--bg-surface": "#302923", "--bg-hover": "#3a3129",
    "--bg-active": "#473a30", "--stroke": "#554538", "--stroke-soft": "#382f28",
    "--text": "#e4d8ca", "--text-muted": "#948579", "--text-bright": "#fff6ee",
    "--accent": "#ff9f43", "--accent-hover": "#ffb15f", "--accent-dim": "rgba(255, 159, 67, 0.14)",
    "--accent-2": "#4fd1c5", "--danger": "#ff6b6b", "--danger-dim": "rgba(255, 107, 107, 0.13)",
    "--warning": "#ffd166",
  },
  lagoon: {
    "--bg": "#101a1d", "--bg-elev-1": "#172529", "--bg-elev-2": "#1f3035",
    "--bg-panel": "#142126", "--bg-surface": "#24383d", "--bg-hover": "#2b454a",
    "--bg-active": "#345259", "--stroke": "#3f6268", "--stroke-soft": "#2a454b",
    "--text": "#cce1df", "--text-muted": "#789694", "--text-bright": "#f4fffd",
    "--accent": "#44d7c8", "--accent-hover": "#62e4d7", "--accent-dim": "rgba(68, 215, 200, 0.14)",
    "--accent-2": "#d7b24c", "--danger": "#ff6b82", "--danger-dim": "rgba(255, 107, 130, 0.13)",
    "--warning": "#f2c76b",
  },
  paper: {
    "--bg": "#f3f1eb", "--bg-elev-1": "#fffdf7", "--bg-elev-2": "#ebe7dd",
    "--bg-panel": "#faf7ef", "--bg-surface": "#e7e1d6", "--bg-hover": "#ded8cc",
    "--bg-active": "#d4cbbc", "--stroke": "#c7bcac", "--stroke-soft": "#ded5c6",
    "--text": "#2f2b26", "--text-muted": "#756b61", "--text-bright": "#14110f",
    "--accent": "#2f7d8c", "--accent-hover": "#246f7d", "--accent-dim": "rgba(47, 125, 140, 0.14)",
    "--accent-2": "#b45f36", "--danger": "#b84242", "--danger-dim": "rgba(184, 66, 66, 0.13)",
    "--warning": "#9a741e",
  },
};

export const BUILT_IN_THEME_IDS = Object.keys(BUILT_IN_THEMES);

const ALL_CSS_VARS = THEME_VARIABLES.map((v) => v.key);

export function clearCustomOverrides(): void {
  ALL_CSS_VARS.forEach((v) => document.documentElement.style.removeProperty(v));
}

export function applyAppearanceOverrides(appearance?: {
  theme?: string;
  theme_mode?: "manual" | "system";
  light_theme?: string;
  dark_theme?: string;
  custom_themes?: CustomTheme[];
  modal_blur?: number;
  modal_dimming?: number;
  border_radius?: number;
  window_opacity?: number;
  accent_color?: string;
  panel_opacity?: number;
  topbar_opacity?: number;
  terminal_opacity?: number;
  terminal_background_image?: string;
  terminal_background_dim?: number;
}): void {
  if (!appearance) return;

  if (appearance.modal_blur !== undefined) {
    document.documentElement.style.setProperty("--modal-blur", `${appearance.modal_blur}px`);
  } else {
    document.documentElement.style.removeProperty("--modal-blur");
  }

  if (appearance.modal_dimming !== undefined) {
    document.documentElement.style.setProperty("--modal-dimming", `${appearance.modal_dimming}`);
  } else {
    document.documentElement.style.removeProperty("--modal-dimming");
  }

  if (appearance.border_radius !== undefined) {
    document.documentElement.style.setProperty("--ui-radius", `${appearance.border_radius}px`);
  } else {
    document.documentElement.style.removeProperty("--ui-radius");
  }

  if (appearance.accent_color) {
    document.documentElement.style.setProperty("--accent", appearance.accent_color);
  }

  setNumberVar("--panel-opacity", appearance.panel_opacity, 1);
  setNumberVar("--window-opacity", appearance.window_opacity, 1);
  setNumberVar("--topbar-opacity", appearance.topbar_opacity, 0.88);
  setNumberVar("--terminal-opacity", appearance.terminal_opacity, 1);
  const bgImage = appearance.terminal_background_image?.trim();
  if (bgImage) {
    document.documentElement.style.setProperty("--terminal-bg-image", `url("${toCssImageUrl(bgImage)}")`);
    setNumberVar("--terminal-bg-dim", appearance.terminal_background_dim, 0.35);
  } else {
    document.documentElement.style.removeProperty("--terminal-bg-image");
    document.documentElement.style.setProperty("--terminal-bg-dim", "0");
  }
}

let systemThemeCleanup: (() => void) | undefined;

export function resolveEffectiveThemeId(appearance?: {
  theme?: string;
  theme_mode?: "manual" | "system";
  light_theme?: string;
  dark_theme?: string;
}): string {
  if (appearance?.theme_mode !== "system") {
    return appearance?.theme ?? "charcoal";
  }

  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  return prefersDark
    ? appearance.dark_theme ?? appearance.theme ?? "charcoal"
    : appearance.light_theme ?? "paper";
}

export function applyAppearanceTheme(appearance?: {
  theme?: string;
  theme_mode?: "manual" | "system";
  light_theme?: string;
  dark_theme?: string;
  custom_themes?: CustomTheme[];
}): void {
  applyTheme(resolveEffectiveThemeId(appearance), appearance?.custom_themes ?? []);
}

export function watchSystemTheme(appearance?: {
  theme?: string;
  theme_mode?: "manual" | "system";
  light_theme?: string;
  dark_theme?: string;
  custom_themes?: CustomTheme[];
}): void {
  systemThemeCleanup?.();
  systemThemeCleanup = undefined;

  if (appearance?.theme_mode !== "system" || !window.matchMedia) return;

  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => applyAppearanceTheme(appearance);
  query.addEventListener("change", onChange);
  systemThemeCleanup = () => query.removeEventListener("change", onChange);
}

function setNumberVar(name: string, value: number | undefined, fallback: number): void {
  const next = value ?? fallback;
  document.documentElement.style.setProperty(name, String(next));
}

function toCssImageUrl(value: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  const escaped = normalized.replace(/"/g, "%22");
  if (/^(https?|data|asset):/i.test(normalized)) return normalized;
  if (/^file:/i.test(normalized)) return convertFileSrc(normalized);
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/")) return convertFileSrc(normalized);
  return encodeURI(escaped);
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
