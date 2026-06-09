import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ElementRef, type ReactNode } from "react";
import { X, ChevronDown, Plus, Terminal, Globe, Monitor } from "lucide-react";
import { getShellProfileOptions } from "@/platform/platform";
import type { AppTab } from "@/types/models";
import { OS_CACHE_KEY, type OsInfo } from "@/features/ssh/SshHostPicker";
import { OsLogoBadge } from "@/features/ssh/OsLogo";

function resolveTabIcon(tab: AppTab): ReactNode {
  if (tab.kind === "ssh" || tab.kind === "ssh_picker") {
    if (tab.sshAlias) {
      try {
        const raw = localStorage.getItem(OS_CACHE_KEY);
        if (raw) {
          const cache = JSON.parse(raw) as Record<string, OsInfo>;
          const osInfo = cache[tab.sshAlias];
          if (osInfo?.os) {
            return <OsLogoBadge os={osInfo.os} version={osInfo.version} className="tab-os-logo" />;
          }
        }
      } catch { /* ignore */ }
    }
    return <Globe size={12} strokeWidth={2} />;
  }
  if (tab.shellProfile === "cmd") return <Monitor size={12} strokeWidth={2} />;
  return <Terminal size={12} strokeWidth={2} />;
}

interface TabStripProps {
  tabs: AppTab[];
  activeTabId?: string;
  onSelectTab: (tabId: string) => void;
  onNewDefault: () => void;
  onNewShell: (shell: string) => void;
  onNewSsh: () => void;
  onRename: (tabId: string, name: string) => void;
  onColor: (tabId: string, color: string) => void;
  onReorder: (fromTabId: string, toTabId: string) => void;
  onDuplicate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

const palette = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#6b7a8d"];

export function TabStrip(props: TabStripProps) {
  const [contextTabId, setContextTabId] = useState<string>();
  const [contextPosition, setContextPosition] = useState<{ x: number; y: number }>();
  const [newTabMenuOpen, setNewTabMenuOpen] = useState(false);
  const [scrollLimited, setScrollLimited] = useState(false);
  const [renamingTab, setRenamingTab] = useState<{ id: string; value: string }>();
  const [draggingTabId, setDraggingTabId] = useState<string>();
  const [dragOverTabId, setDragOverTabId] = useState<string>();

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const newTabMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<ElementRef<"input">>(null);

  const contextTab = useMemo(
    () => props.tabs.find((tab) => tab.id === contextTabId),
    [contextTabId, props.tabs]
  );
  const shellOptions = useMemo(() => getShellProfileOptions(), []);

  const closeContext = () => {
    setContextTabId(undefined);
    setContextPosition(undefined);
  };

  const startRename = (tab: AppTab) => {
    setRenamingTab({ id: tab.id, value: tab.title });
    closeContext();
  };

  const commitRename = () => {
    if (!renamingTab) return;
    const next = renamingTab.value.trim();
    if (next) props.onRename(renamingTab.id, next);
    setRenamingTab(undefined);
  };

  const clampMenuPosition = useCallback((x: number, y: number) => {
    const menuWidth = 188;
    const menuHeight = 228;
    const pad = 8;
    return {
      x: Math.max(pad, Math.min(x, window.innerWidth - menuWidth - pad)),
      y: Math.max(pad, Math.min(y, window.innerHeight - menuHeight - pad)),
    };
  }, []);

  const updateLayout = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    setScrollLimited(scrollEl.scrollWidth > scrollEl.clientWidth + 1);
  }, []);

  useEffect(() => {
    updateLayout();
  }, [updateLayout, props.tabs]);

  useEffect(() => {
    const observer = new ResizeObserver(() => updateLayout());
    if (stripRef.current) observer.observe(stripRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [updateLayout]);

  useEffect(() => {
    if (!newTabMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const wrap = newTabMenuRef.current;
      if (!wrap) return;
      if (!wrap.contains(event.target as Node)) {
        setNewTabMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [newTabMenuOpen]);

  useEffect(() => {
    if (!renamingTab) return;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renamingTab]);

  return (
    <div className="tabstrip" ref={stripRef}>
      <div
        className={`tabstrip-scroll${scrollLimited ? " limited" : ""}`}
        ref={scrollRef}
        role="tablist"
        aria-label="Terminal tabs"
        onWheel={(e) => {
          const el = scrollRef.current;
          if (el && e.deltaY !== 0) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
          }
        }}
      >
        {props.tabs.map((tab) => {
          const active = tab.id === props.activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab ${active ? "active" : ""}${draggingTabId === tab.id ? " dragging" : ""}${dragOverTabId === tab.id && draggingTabId !== tab.id ? " drag-over" : ""}`}
              style={{ "--tab-color": tab.color } as CSSProperties}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              draggable={!renamingTab}
              onClick={() => props.onSelectTab(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onSelectTab(tab.id);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                const pos = clampMenuPosition(event.clientX, event.clientY);
                setContextTabId(tab.id);
                setContextPosition(pos);
              }}
              onDragStart={(event) => {
                setDraggingTabId(tab.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tab.id);
              }}
              onDragOver={(event) => {
                if (!draggingTabId || draggingTabId === tab.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverTabId(tab.id);
              }}
              onDragLeave={(event) => {
                if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) {
                  setDragOverTabId((prev) => (prev === tab.id ? undefined : prev));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                const from = draggingTabId ?? event.dataTransfer.getData("text/plain");
                if (from) props.onReorder(from, tab.id);
                setDraggingTabId(undefined);
                setDragOverTabId(undefined);
              }}
              onDragEnd={() => {
                setDraggingTabId(undefined);
                setDragOverTabId(undefined);
              }}
            >
              <span className="tab-icon">{resolveTabIcon(tab)}</span>
              {renamingTab?.id === tab.id ? (
                <input
                  ref={renameInputRef}
                  className="tab-rename-input"
                  value={renamingTab.value}
                  onClick={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onKeyUp={(event) => event.stopPropagation()}
                  onChange={(event) => setRenamingTab({ id: tab.id, value: event.target.value })}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitRename();
                    } else if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingTab(undefined);
                    }
                  }}
                />
              ) : (
                <span className="tab-title">{tab.title}</span>
              )}
              <button
                className="tab-close"
                type="button"
                title="Close tab"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(tab.id);
                }}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
      <div className={`tabstrip-actions${scrollLimited ? " pinned" : ""}`} ref={actionsRef}>
        <button className="tab-action" onClick={props.onNewDefault} title="New tab">
          <Plus size={15} strokeWidth={2} />
        </button>
        <div className="newtab-dropdown-wrap" ref={newTabMenuRef}>
          <button
            className="tab-action"
            title="New tab options"
            onClick={() => setNewTabMenuOpen((v) => !v)}
          >
            <ChevronDown size={13} strokeWidth={2} />
          </button>
          {newTabMenuOpen ? (
            <div className="newtab-dropdown" onMouseLeave={() => setNewTabMenuOpen(false)}>
              <button onClick={() => { props.onNewDefault(); setNewTabMenuOpen(false); }}>Default Terminal</button>
              {shellOptions.map((shell) => (
                <button key={shell.id} onClick={() => { props.onNewShell(shell.id); setNewTabMenuOpen(false); }}>
                  {shell.label}
                </button>
              ))}
              <button onClick={() => { props.onNewSsh(); setNewTabMenuOpen(false); }}>SSH Connection</button>
            </div>
          ) : null}
        </div>
      </div>

      {contextTab && contextPosition ? (
        <div className="context-anchor" onClick={closeContext}>
          <div
            className="tab-context-menu"
            style={{ left: contextPosition.x, top: contextPosition.y }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => startRename(contextTab)}
            >
              Rename
            </button>
            <div className="context-section">
              <div className="context-label">Color</div>
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
              Duplicate
            </button>
            <button
              className="danger"
              onClick={() => {
                props.onClose(contextTab.id);
                closeContext();
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
