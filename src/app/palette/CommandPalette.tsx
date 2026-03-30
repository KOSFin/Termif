import { useMemo, useState } from "react";

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return props.commands;
    }
    return props.commands.filter((cmd) => cmd.title.toLowerCase().includes(q) || cmd.category.toLowerCase().includes(q));
  }, [props.commands, query]);

  if (!props.open) {
    return null;
  }

  return (
    <div className="palette-overlay" onClick={props.onClose}>
      <div className="palette-panel" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type a command"
        />
        <div className="palette-list">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              onClick={() => {
                cmd.action();
                props.onClose();
                setQuery("");
              }}
            >
              <span>{cmd.title}</span>
              <small>{cmd.category}</small>
            </button>
          ))}
          {filtered.length === 0 ? <div className="palette-empty">No command found</div> : null}
        </div>
      </div>
    </div>
  );
}
