import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

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
}

export interface RevealInFileManagerPayload {
  path: string;
  sessionId?: string;
  targetWindow: string;
}

export function formatWindowDisplayTitle(label: string, activeTitle?: string | null) {
  if (label === MAIN_WINDOW_LABEL) {
    return activeTitle ? `${activeTitle} — Termif` : "Termif";
  }
  return activeTitle ? `${activeTitle} — Termif` : "Detached Window";
}

export function makeTerminalWindowLabel() {
  return `terminal-${Date.now()}-${Math.round(Math.random() * 9999)}`;
}

export function openTerminalWorkspaceWindow(label: string, title?: string, placement?: WindowPlacement) {
  const win = new WebviewWindow(label, {
    url: "/#/terminal-window",
    title: title ?? "Termif",
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    ...(placement?.x !== undefined && placement?.y !== undefined
      ? { x: placement.x, y: placement.y }
      : {}),
  });

  win.once("tauri://error", (event) => {
    console.error("Terminal window failed to open:", event);
  });

  return win;
}
