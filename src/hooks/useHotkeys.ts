import { useEffect } from "react";

interface HotkeyHandlers {
  onOpenPalette: () => void;
  onToggleSidebar: () => void;
  onNewTab: () => void;
  onOpenSettings: () => void;
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;

      if (ctrl && event.shiftKey && key === "p") {
        event.preventDefault();
        handlers.onOpenPalette();
      }

      if (ctrl && key === "b") {
        event.preventDefault();
        handlers.onToggleSidebar();
      }

      if (ctrl && key === "t") {
        event.preventDefault();
        handlers.onNewTab();
      }

      if (ctrl && key === ",") {
        event.preventDefault();
        handlers.onOpenSettings();
      }
    };

    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [handlers]);
}
