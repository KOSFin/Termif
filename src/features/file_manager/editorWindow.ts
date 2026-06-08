import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const EDITOR_OPEN_FILE_EVENT = "termif://editor-open-file";
export const EDITOR_POPOUT_HEARTBEAT_KEY = "termif.editorPopoutHeartbeat";

export interface EditorWindowTabSeed {
  path: string;
  mode: "preview" | "edit";
  sessionId?: string;
  serverLabel?: string;
  content?: string;
  dirty?: boolean;
  error?: string;
}

export interface EditorWindowOpenFilePayload {
  path: string;
  mode: "preview" | "edit";
  sessionId?: string;
  serverLabel?: string;
}

export function markEditorPopoutLive() {
  localStorage.setItem(EDITOR_POPOUT_HEARTBEAT_KEY, String(Date.now()));
}

export function clearEditorPopoutLive() {
  localStorage.removeItem(EDITOR_POPOUT_HEARTBEAT_KEY);
}

export function isEditorPopoutLive() {
  const raw = Number(localStorage.getItem(EDITOR_POPOUT_HEARTBEAT_KEY) ?? "0");
  return Number.isFinite(raw) && Date.now() - raw < 5000;
}

export async function requestOpenFileInEditorWindow(payload: EditorWindowOpenFilePayload) {
  await emit(EDITOR_OPEN_FILE_EVENT, payload);
}

function createEditorWebviewWindow(params: URLSearchParams, title: string) {
  const label = `editor-${Date.now()}-${Math.round(Math.random() * 9999)}`;
  markEditorPopoutLive();
  const win = new WebviewWindow(label, {
    url: `/#/editor?${params.toString()}`,
    title,
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560,
  });

  win.once("tauri://error", (event) => {
    console.error("Editor window failed to open:", event);
    clearEditorPopoutLive();
  });
}

export function openEditorWindow(
  path: string,
  mode: "preview" | "edit",
  sessionId?: string,
  serverLabel?: string
) {
  const params = new URLSearchParams({ path, mode });
  if (sessionId) params.set("sessionId", sessionId);
  if (serverLabel) params.set("serverLabel", serverLabel);
  createEditorWebviewWindow(
    params,
    mode === "preview" ? `Preview — ${path.split(/[\\/]/).pop()}` : `Edit — ${path.split(/[\\/]/).pop()}`
  );
}

export function openEditorWorkspaceWindow(tabs: EditorWindowTabSeed[], activeIndex = 0) {
  if (tabs.length === 0) return;
  const params = new URLSearchParams();
  params.set("tabs", JSON.stringify(tabs));
  params.set("active", String(Math.max(0, Math.min(activeIndex, tabs.length - 1))));
  createEditorWebviewWindow(params, tabs.length === 1
    ? `Edit — ${tabs[0].path.split(/[\\/]/).pop()}`
    : `Editor — ${tabs.length} files`);
}
