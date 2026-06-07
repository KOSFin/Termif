import type { EditorDock } from "@/store/useAppStore";

interface DockDropOverlayProps {
  target: EditorDock;
}

export function DockDropOverlay({ target }: DockDropOverlayProps) {
  return (
    <div className="dock-drop-overlay" aria-hidden="true">
      <div className={`dock-drop-target dock-left${target === "left" ? " active" : ""}`} />
      <div className={`dock-drop-target dock-top${target === "top" ? " active" : ""}`} />
      <div className={`dock-drop-target dock-right${target === "right" ? " active" : ""}`} />
      <div className={`dock-drop-target dock-bottom${target === "bottom" ? " active" : ""}`} />
    </div>
  );
}
