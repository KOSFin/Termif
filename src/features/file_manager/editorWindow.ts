import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function openEditorWindow(path: string, mode: "preview" | "edit") {
  const encodedPath = encodeURIComponent(path);
  const label = `editor-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const window = new WebviewWindow(label, {
    url: `/#/editor?path=${encodedPath}&mode=${mode}`,
    title: mode === "preview" ? `Preview - ${path}` : `Edit - ${path}`,
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 560
  });

  window.once("tauri://error", (event) => {
    // Keep feedback clear when a new window fails to open.
    console.error("Failed to open editor window", event);
  });
}
