import { useMemo, useState, type CSSProperties } from "react";
import { PlusIcon, CaretDownIcon, XIcon, TerminalIcon, GlobeIcon, CopyIcon, PencilIcon, PaletteIcon, TrashIcon } from "@phosphor-icons/react";
import type { AppTab } from "@/types/models";

interface TabStripProps {
  tabs: AppTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onNewDefault: () => void;
  onNewShell: (shell: string) => void;
  onNewSsh: () => void;
  onRename: (tabId: string, name: string) => void;
  onColor: (tabId: string, color: string) => void;
  onDuplicate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

const palette = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#6b7a8d"];

export function TabStrip(props: TabStripProps) {
  const [contextTabId, setContextTabId] = useState<string>();
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number }>();
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);

  const contextTab = useMemo(
    () => props.tabs.find((tab) => tab.id === contextTabId),
    [contextTabId, props.tabs]
  );

  const closeContext = () => {
    setContextTabId(undefined);
    setContextPosition(undefined);
  };

  return (
    <div className="tabstrip">
      <div className="tabstrip-left">
        {props.tabs.map((tab) => {
          const active = tab.id === props.activeTabId;
          const isSSH = tab.kind === "ssh" || tab.kind === "ssh_picker";
          return (
            <button
              key={tab.id}
              className={`tab ${active ? "active" : ""}`}
              style={{ "--tab-color": tab.color } as CSSProperties}
              onClick={() => props.onSelectTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextTabId(tab.id);
                setContextPosition({ x: event.clientX, y: event.clientY });
              }}
            >
              <span className="tab-type-icon">
                {isSSH ? <GlobeIcon size={13} weight="bold" /> : <TerminalIcon size={13} weight="bold" />}
              </span>
              <span className="tab-title">{tab.title}</span>
              <span
                className="tab-close"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(tab.id);
                }}
              >
                <XIcon size={11} weight="bold" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="tabstrip-actions">
        <div className="newtab-group">
          <button className="tab-action newtab-btn" onClick={props.onNewDefault} title="New tab">
            <PlusIcon size={14} weight="bold" />
          </button>
          <div className="newtab-divider" />
          <button
            className="tab-action newtab-dropdown-btn"
            title="New tab options"
            onClick={() => setNewTabMenuOpen((v) => !v)}
          >
            <CaretDownIcon size={11} weight="bold" />
          </button>
        </div>
        {newTabMenuOpen ? (
          <div className="newtab-dropdown" onMouseLeave={() => setNewTabMenuOpen(false)}>
            <button onClick={() => { props.onNewDefault(); setNewTabMenuOpen(false); }}>
              <TerminalIcon size={14} /> Default Terminal
            </button>
            <button onClick={() => { props.onNewShell("powershell"); setNewTabMenuOpen(false); }}>
              <TerminalIcon size={14} /> PowerShell
            </button>
            <button onClick={() => { props.onNewShell("cmd"); setNewTabMenuOpen(false); }}>
              <TerminalIcon size={14} /> CMD
            </button>
            <button onClick={() => { props.onNewShell("pwsh"); setNewTabMenuOpen(false); }}>
              <TerminalIcon size={14} /> PowerShell 7
            </button>
            <button onClick={() => { props.onNewSsh(); setNewTabMenuOpen(false); }}>
              <GlobeIcon size={14} /> SSH Connection
            </button>
          </div>
        ) : null}
      </div>

      {contextTab && contextPosition ? (
        <div className="context-anchor" onClick={closeContext}>
          <div
            className="tab-context-menu"
            style={{ left: contextPosition.x, top: contextPosition.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => {
                const nextName = window.prompt("Rename tab", contextTab.title)?.trim();
                if (nextName) {
                  props.onRename(contextTab.id, nextName);
                }
                closeContext();
              }}
            >
              <PencilIcon size={14} /> Rename
            </button>
            <div className="context-section">
              <div className="context-label"><PaletteIcon size={12} /> Color</div>
              <div className="color-row">
                {palette.map((color) => (
                  <button
                    key={color}
                    className="color-swatch"
                    style={{ background: color }}
                    onClick={() => {
                      props.onColor(contextTab.id, color);
                      closeContext();
                    }}
                    aria-label={`color ${color}`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={() => {
                props.onDuplicate(contextTab.id);
                closeContext();
              }}
            >
              <CopyIcon size={14} /> Duplicate
            </button>
            <button
              className="danger"
              onClick={() => {
                props.onClose(contextTab.id);
                closeContext();
              }}
            >
              <TrashIcon size={14} /> Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
