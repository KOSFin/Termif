import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function openEditorWindow(
  path: string,
  mode: "preview" | "edit",
  sessionId?: string
) {
  const params = new URLSearchParams({ path, mode });
  if (sessionId) params.set("sessionId", sessionId);

  const label = `editor-${Date.now()}-${Math.round(Math.random() * 9999)}`;
  const win = new WebviewWindow(label, {
    url: `/#/editor?${params.toString()}`,
    title: mode === "preview" ? `Preview — ${path.split(/[\\/]/).pop()}` : `Edit — ${path.split(/[\\/]/).pop()}`,
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560,
  });

  win.once("tauri://error", (event) => {
    console.error("Editor window failed to open:", event);
  });
}
