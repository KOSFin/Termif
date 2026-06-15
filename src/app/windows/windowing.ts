import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Effect, EffectState } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { desktopPlatform } from "@/platform/platform";

export const MAIN_WINDOW_LABEL = "main";
export const UI_STATE_SYNC_EVENT = "termif://ui-state-sync";
export const TAB_DRAG_EVENT = "termif://tab-drag";
export const TAB_DROP_EVENT = "termif://tab-drop";
export const REVEAL_IN_FILE_MANAGER_EVENT = "termif://reveal-in-file-manager";

export interface UiStateSyncPayload<T> {
  uiState: T;
  sourceWindow: string;
}

export interface WindowPlacement {
  x?: number;
  y?: number;
}

export interface WindowGeometry extends WindowPlacement {
  width?: number;
  height?: number;
  maximized?: boolean;
}

export interface TabDragPayload {
  sourceWindow: string;
  tabId: string;
  screenX: number;
  screenY: number;
  phase: "start" | "move" | "end";
}

export interface TabDropPayload {
  sourceWindow: string;
  tabId: string;
  screenX: number;
  screenY: number;
  targetWindow?: string;
}

export interface RevealInFileManagerPayload {
  path: string;
  sessionId?: string;
  targetWindow: string;
}

export function formatWindowDisplayTitle(label: string, activeTitle?: string | null) {
  return activeTitle ? `${activeTitle} — Termif` : "Termif";
}

export function makeTerminalWindowLabel() {
  return `terminal-${Date.now()}-${Math.round(Math.random() * 9999)}`;
}

export function getTerminalWindowOptions(title?: string, geometry?: WindowGeometry) {
  return {
    url: "/#/terminal-window",
    title: title ?? "Termif",
    width: geometry?.width ?? 1100,
    height: geometry?.height ?? 760,
    minWidth: 760,
    minHeight: 560,
    resizable: true,
    transparent: true,
    focus: true,
    center: geometry?.x === undefined || geometry?.y === undefined,
    decorations: false,
    ...(desktopPlatform === "macos"
      ? {
          titleBarStyle: "overlay" as const,
          hiddenTitle: true,
          trafficLightPosition: new LogicalPosition(14, 16),
          windowEffects: {
            effects: [Effect.WindowBackground],
            state: EffectState.Active,
          },
        }
      : {}),
    ...(geometry?.x !== undefined && geometry?.y !== undefined
      ? { x: geometry.x, y: geometry.y }
      : {}),
    ...(geometry?.maximized ? { maximized: true } : {}),
  };
}

export function openTerminalWorkspaceWindow(label: string, title?: string, placement?: WindowGeometry) {
  const win = new WebviewWindow(label, {
    ...getTerminalWindowOptions(title, placement),
  });

  win.once("tauri://error", (event) => {
    console.error("Terminal window failed to open:", event);
  });

  return win;
}
