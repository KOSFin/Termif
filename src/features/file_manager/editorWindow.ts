import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export interface EditorWindowTabSeed {
  path: string;
  mode: "preview" | "edit";
  sessionId?: string;
  serverLabel?: string;
  content?: string;
  dirty?: boolean;
  error?: string;
}

function createEditorWebviewWindow(params: URLSearchParams, title: string) {
  const label = `editor-${Date.now()}-${Math.round(Math.random() * 9999)}`;
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
