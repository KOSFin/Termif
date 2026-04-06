import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

interface HotkeyRecorderProps {
  commandId: string;
  description: string;
  combos: string[];
  conflicts: Map<string, string[]>;
  protectedCombos: Set<string>;
  onChange: (combos: string[]) => void;
}

const PROTECTED_SYSTEM_COMBOS = new Set([
  "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A", "Ctrl+Z", "Ctrl+Y",
  "Ctrl+S", "Ctrl+F", "Alt+F4",
]);

export function getProtectedCombos(): Set<string> {
  return PROTECTED_SYSTEM_COMBOS;
}

export function buildConflictMap(
  allBindings: Array<{ command_id: string; combos: string[] }>
): Map<string, string[]> {
  const comboToCommands = new Map<string, string[]>();
  for (const entry of allBindings) {
    for (const combo of entry.combos) {
      const normalized = combo.trim();
      if (!normalized) continue;
      const existing = comboToCommands.get(normalized) ?? [];
      existing.push(entry.command_id);
      comboToCommands.set(normalized, existing);
    }
  }
  // Only keep entries with conflicts (assigned to 2+ commands)
  const conflicts = new Map<string, string[]>();
  for (const [combo, commands] of comboToCommands) {
    if (commands.length > 1) {
      conflicts.set(combo, commands);
    }
  }
  return conflicts;
}

function eventToCombo(e: KeyboardEvent): string {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.shiftKey) mods.push("Shift");
  if (e.altKey) mods.push("Alt");

  const key = codeToKey(e.code);
  if (!key) return "";

  // Don't create combos for bare modifier keys
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return "";

  const prefix = mods.length > 0 ? `${mods.join("+")}+` : "";
  return `${prefix}${key}`;
}

function codeToKey(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);

  const mapped: Record<string, string> = {
    Tab: "Tab", Escape: "Escape", Comma: ",", Period: ".",
    Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Slash: "/", Backquote: "`",
    F1: "F1", F2: "F2", F3: "F3", F4: "F4", F5: "F5", F6: "F6",
    F7: "F7", F8: "F8", F9: "F9", F10: "F10", F11: "F11", F12: "F12",
    Equal: "=", Minus: "-", Space: "Space", Enter: "Enter",
    Backspace: "Backspace", Delete: "Delete", Insert: "Insert",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
    NumpadAdd: "Num+", NumpadSubtract: "Num-", NumpadMultiply: "Num*",
    NumpadDivide: "Num/", NumpadEnter: "NumEnter",
    Numpad0: "Num0", Numpad1: "Num1", Numpad2: "Num2", Numpad3: "Num3",
    Numpad4: "Num4", Numpad5: "Num5", Numpad6: "Num6", Numpad7: "Num7",
    Numpad8: "Num8", Numpad9: "Num9",
    ContextMenu: "ContextMenu", PrintScreen: "PrintScreen",
    ScrollLock: "ScrollLock", Pause: "Pause",
  };

  return mapped[code] ?? null;
}

export function HotkeyRecorder({ commandId, description, combos, conflicts, protectedCombos, onChange }: HotkeyRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [liveCombo, setLiveCombo] = useState("");
  const recorderRef = useRef<HTMLDivElement>(null);

  const hasConflict = combos.some((c) => conflicts.has(c));
  const hasProtectedConflict = combos.some((c) => protectedCombos.has(c));

  const startRecording = useCallback(() => {
    setRecording(true);
    setLiveCombo("");
  }, []);

  const removeCombo = useCallback((index: number) => {
    onChange(combos.filter((_, i) => i !== index));
  }, [combos, onChange]);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const combo = eventToCombo(e);
      if (combo) setLiveCombo(combo);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (liveCombo) {
        // Don't add duplicates
        if (!combos.includes(liveCombo)) {
          onChange([...combos, liveCombo]);
        }
        setLiveCombo("");
        setRecording(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recording, liveCombo, combos, onChange]);

  // Cancel recording on click outside
  useEffect(() => {
    if (!recording) return;
    const onClick = (e: MouseEvent) => {
      if (recorderRef.current && !recorderRef.current.contains(e.target as Node)) {
        setRecording(false);
        setLiveCombo("");
      }
    };
    window.addEventListener("mousedown", onClick, true);
    return () => window.removeEventListener("mousedown", onClick, true);
  }, [recording]);

  const getComboConflictInfo = (combo: string): string | null => {
    const conflicting = conflicts.get(combo);
    if (conflicting && conflicting.length > 1) {
      const others = conflicting.filter((id) => id !== commandId);
      if (others.length > 0) return `Conflicts with: ${others.join(", ")}`;
    }
    if (protectedCombos.has(combo)) return "System shortcut - may not work as expected";
    return null;
  };

  return (
    <div
      ref={recorderRef}
      className={`hotkey-recorder${hasConflict || hasProtectedConflict ? " has-conflict" : ""}`}
    >
      <div className="hotkey-recorder-info">
        <span className="hotkey-recorder-desc">{description}</span>
        <span className="hotkey-recorder-id">{commandId}</span>
      </div>
      <div className="hotkey-recorder-chips">
        {combos.map((combo, index) => {
          const conflictInfo = getComboConflictInfo(combo);
          return (
            <span
              key={`${combo}-${index}`}
              className={`hotkey-chip${conflictInfo ? " conflict" : ""}`}
              title={conflictInfo ?? combo}
            >
              {combo}
              <button
                className="hotkey-chip-remove"
                onClick={(e) => { e.stopPropagation(); removeCombo(index); }}
              >
                <X size={10} strokeWidth={2.5} />
              </button>
            </span>
          );
        })}
        {recording ? (
          <span className="hotkey-chip recording">
            {liveCombo || "Press keys..."}
          </span>
        ) : (
          <button className="hotkey-add-btn" onClick={startRecording} title="Add shortcut">
            <Plus size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
