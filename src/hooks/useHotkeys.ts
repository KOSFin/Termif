import { useEffect } from "react";

export interface HotkeyHandlers {
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  onNewTab: () => void;
  onOpenSettings: () => void;
  onCloseTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onTabByIndex: (index: number) => void;
  onRefreshFiles: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToggleEditor: () => void;
  onTabSwitcherOpen: (direction: 1 | -1) => void;
  onTabSwitcherClose: () => void;
  onEscape: () => void;
}

/**
 * Global hotkeys using event.code (physical key position) so shortcuts
 * work correctly with ANY keyboard layout — Russian, German, etc.
 */
export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const code = e.code;

      // ── Ctrl+Tab / Ctrl+Shift+Tab — tab switcher ──────────────────
      if (ctrl && code === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        handlers.onTabSwitcherOpen(shift ? -1 : 1);
        return;
      }

      // ── Escape — close palette / settings / tab switcher ──────────
      if (code === "Escape") {
        e.preventDefault();
        handlers.onEscape();
        return;
      }

      // ── Ctrl+Shift+P — command palette ────────────────────────────
      if (ctrl && shift && code === "KeyP") {
        e.preventDefault();
        handlers.onOpenPalette();
        return;
      }

      // ── Ctrl+B — toggle sidebar ───────────────────────────────────
      if (ctrl && code === "KeyB") {
        e.preventDefault();
        handlers.onToggleSidebar();
        return;
      }

      // ── Ctrl+T — new tab ──────────────────────────────────────────
      if (ctrl && code === "KeyT") {
        e.preventDefault();
        handlers.onNewTab();
        return;
      }

      // ── Ctrl+W — close current tab ────────────────────────────────
      if (ctrl && code === "KeyW") {
        e.preventDefault();
        handlers.onCloseTab();
        return;
      }

      // ── Ctrl+, — settings ─────────────────────────────────────────
      if (ctrl && code === "Comma") {
        e.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      // ── F5 / Ctrl+R — refresh file manager ────────────────────────
      if (code === "F5" || (ctrl && code === "KeyR")) {
        e.preventDefault();
        handlers.onRefreshFiles();
        return;
      }

      // ── Ctrl+= / Ctrl+Plus — zoom in ─────────────────────────────
      if (ctrl && (code === "Equal" || code === "NumpadAdd")) {
        e.preventDefault();
        handlers.onZoomIn();
        return;
      }

      // ── Ctrl+- / Ctrl+Minus — zoom out ───────────────────────────
      if (ctrl && (code === "Minus" || code === "NumpadSubtract")) {
        e.preventDefault();
        handlers.onZoomOut();
        return;
      }

      // ── Ctrl+0 — reset zoom ──────────────────────────────────────
      if (ctrl && code === "Digit0") {
        e.preventDefault();
        handlers.onZoomReset();
        return;
      }

      // ── Ctrl+E — toggle editor panel ──────────────────────────────
      if (ctrl && !shift && code === "KeyE") {
        e.preventDefault();
        handlers.onToggleEditor();
        return;
      }

      // ── Alt+1..9 — jump to tab by index ───────────────────────────
      if (e.altKey && !ctrl) {
        const digitMatch = code.match(/^Digit([1-9])$/);
        if (digitMatch) {
          e.preventDefault();
          handlers.onTabByIndex(parseInt(digitMatch[1], 10) - 1);
          return;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // When Ctrl is released while tab switcher is open, confirm selection
      if (e.key === "Control" || e.code === "ControlLeft" || e.code === "ControlRight") {
        handlers.onTabSwitcherClose();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [handlers]);
}
