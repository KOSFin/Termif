import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface PaletteCommand {
  id: string;
  title: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return props.commands;
    return props.commands.filter(
      (cmd) => cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q)
    );
  }, [props.commands, query]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset state when opened
  useEffect(() => {
    if (props.open) {
      setQuery("");
      setSelectedIndex(0);
    }
  }, [props.open]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const execute = useCallback(
    (cmd: PaletteCommand) => {
      cmd.action();
      props.onClose();
      setQuery("");
    },
    [props]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIndex];
        if (cmd) execute(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        props.onClose();
      }
    },
    [filtered, selectedIndex, execute, props]
  );

  if (!props.open) return null;

  return (
    <div className="palette-overlay" onClick={props.onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
        />
        <div className="palette-list" ref={listRef}>
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              className={i === selectedIndex ? "selected" : ""}
              onClick={() => execute(cmd)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span>{cmd.title}</span>
              <small>{cmd.category}</small>
            </button>
          ))}
          {filtered.length === 0 ? <div className="palette-empty">No commands found</div> : null}
        </div>
      </div>
    </div>
  );
}
