import { useEffect } from "react";

export interface HotkeyBindingEntry {
  command_id: string;
  primary: string;
  alternates?: string[] | null;
}

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

const defaultBindings: Record<string, string[]> = {
  "palette.open": ["Ctrl+Shift+P"],
  "sidebar.toggle": ["Ctrl+B"],
  "tab.new_default": ["Ctrl+T"],
  "tab.close": ["Ctrl+W"],
  "settings.open": ["Ctrl+,"],
  "tab.switcher.next": ["Ctrl+Tab"],
  "tab.switcher.prev": ["Ctrl+Shift+Tab"],
  "files.refresh": ["F5", "Ctrl+R"],
  "zoom.in": ["Ctrl+=", "Ctrl+Num+"],
  "zoom.out": ["Ctrl+-", "Ctrl+Num-"],
  "zoom.reset": ["Ctrl+0"],
  "editor.toggle": ["Ctrl+E"],
  "ui.escape": ["Escape"],
  "tab.index.1": ["Alt+1"],
  "tab.index.2": ["Alt+2"],
  "tab.index.3": ["Alt+3"],
  "tab.index.4": ["Alt+4"],
  "tab.index.5": ["Alt+5"],
  "tab.index.6": ["Alt+6"],
  "tab.index.7": ["Alt+7"],
  "tab.index.8": ["Alt+8"],
  "tab.index.9": ["Alt+9"],
};

/**
 * Global hotkeys using event.code (physical key position) so shortcuts
 * work correctly with ANY keyboard layout — Russian, German, etc.
 */
export function useHotkeys(handlers: HotkeyHandlers, configuredBindings?: HotkeyBindingEntry[]) {
  useEffect(() => {
    const customMap = new Map<string, string[]>();
    for (const entry of configuredBindings ?? []) {
      const combos = [entry.primary, ...(entry.alternates ?? [])]
        .map((item) => normalizeCombo(item))
        .filter((item): item is string => !!item);
      if (combos.length > 0) {
        customMap.set(entry.command_id, combos);
      }
    }

    const getBindings = (commandId: string): string[] => {
      return customMap.get(commandId) ?? defaultBindings[commandId] ?? [];
    };

    const matchesAny = (e: KeyboardEvent, commandId: string) => {
      const candidates = getEventComboCandidates(e);
      const bindings = getBindings(commandId);
      return bindings.some((binding) => candidates.includes(binding));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (matchesAny(e, "tab.switcher.next")) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onTabSwitcherOpen(1);
        return;
      }

      if (matchesAny(e, "tab.switcher.prev")) {
        e.preventDefault();
        e.stopPropagation();
        handlers.onTabSwitcherOpen(-1);
        return;
      }

      if (matchesAny(e, "ui.escape")) {
        e.preventDefault();
        handlers.onEscape();
        return;
      }

      if (matchesAny(e, "palette.open")) {
        e.preventDefault();
        handlers.onOpenPalette();
        return;
      }

      if (matchesAny(e, "sidebar.toggle")) {
        e.preventDefault();
        handlers.onToggleSidebar();
        return;
      }

      if (matchesAny(e, "tab.new_default")) {
        e.preventDefault();
        handlers.onNewTab();
        return;
      }

      if (matchesAny(e, "tab.close")) {
        e.preventDefault();
        handlers.onCloseTab();
        return;
      }

      if (matchesAny(e, "settings.open")) {
        e.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      if (matchesAny(e, "files.refresh")) {
        e.preventDefault();
        handlers.onRefreshFiles();
        return;
      }

      if (matchesAny(e, "zoom.in")) {
        e.preventDefault();
        handlers.onZoomIn();
        return;
      }

      if (matchesAny(e, "zoom.out")) {
        e.preventDefault();
        handlers.onZoomOut();
        return;
      }

      if (matchesAny(e, "zoom.reset")) {
        e.preventDefault();
        handlers.onZoomReset();
        return;
      }

      if (matchesAny(e, "editor.toggle")) {
        e.preventDefault();
        handlers.onToggleEditor();
        return;
      }

      for (let i = 1; i <= 9; i += 1) {
        if (matchesAny(e, `tab.index.${i}`)) {
          e.preventDefault();
          handlers.onTabByIndex(i - 1);
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
  }, [configuredBindings, handlers]);
}

function normalizeCombo(combo?: string): string | null {
  if (!combo) return null;
  const raw = combo.trim();
  if (!raw) return null;

  return raw
    .replace(/\s+/g, "")
    .replace(/Control/gi, "Ctrl")
    .replace(/Command/gi, "Meta")
    .replace(/Option/gi, "Alt")
    .replace(/Num\+/gi, "Num+")
    .replace(/Num\-/gi, "Num-");
}

function getEventComboCandidates(e: KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");

  const key = toComboKey(e.code);
  if (!key) return [];

  const prefix = mods.length > 0 ? `${mods.join("+")}+` : "";
  return [normalizeCombo(`${prefix}${key}`) ?? ""].filter(Boolean);
}

function toComboKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }

  const mapped: Record<string, string> = {
    Tab: "Tab",
    Escape: "Escape",
    Comma: ",",
    F5: "F5",
    Equal: "=",
    Minus: "-",
    NumpadAdd: "Num+",
    NumpadSubtract: "Num-",
  };

  return mapped[code] ?? null;
}
