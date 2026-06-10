import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ElementRef, type ReactNode } from "react";
import { X, ChevronDown, Plus, Terminal, Globe, Monitor } from "lucide-react";
import { getShellProfileOptions } from "@/platform/platform";
import type { AppTab } from "@/types/models";
import { OS_CACHE_KEY, type OsInfo } from "@/features/ssh/sshHostPickerUtils";
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
  const [draggingTab, setDraggingTab] = useState<{ id: string; startX: number; startY: number; currentX: number; active: boolean }>();
  const [dragOverTabId, setDragOverTabId] = useState<string>();
  const renamingTabId = renamingTab?.id;
  const draggingTabId = draggingTab?.id;

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const newTabMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<ElementRef<"input">>(null);
  const renameFocusedTabIdRef = useRef<string>();
  const draggingTabRef = useRef<typeof draggingTab>();
  const onReorderRef = useRef(props.onReorder);

  const contextTab = useMemo(
    () => props.tabs.find((tab) => tab.id === contextTabId),
    [contextTabId, props.tabs]
  );
  const shellOptions = useMemo(() => getShellProfileOptions(), []);

  useEffect(() => {
    onReorderRef.current = props.onReorder;
  }, [props.onReorder]);

  useEffect(() => {
    draggingTabRef.current = draggingTab;
  }, [draggingTab]);

  const closeContext = () => {
    setContextTabId(undefined);
    setContextPosition(undefined);
  };

  const startRename = (tab: AppTab) => {
    renameFocusedTabIdRef.current = undefined;
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
    if (!contextTabId) return;

    const onPointerDown = (event: MouseEvent) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return;
      closeContext();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContext();
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [contextTabId]);

  useEffect(() => {
    if (!renamingTabId) {
      renameFocusedTabIdRef.current = undefined;
      return;
    }
    if (renameFocusedTabIdRef.current === renamingTabId) return;
    renameFocusedTabIdRef.current = renamingTabId;
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renamingTabId]);

  useEffect(() => {
    const draggingState = draggingTabRef.current;
    if (!draggingState) return;

    const findTabUnderPointer = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-tab-id]");
      return element?.dataset.tabId;
    };

    const onMove = (event: MouseEvent) => {
      const moved =
        Math.abs(event.clientX - draggingState.startX) > 5 ||
        Math.abs(event.clientY - draggingState.startY) > 5;
      setDraggingTab((prev) => prev ? { ...prev, currentX: event.clientX, active: prev.active || moved } : prev);
      if (!draggingState.active && !moved) return;
      const overId = findTabUnderPointer(event.clientX, event.clientY);
      setDragOverTabId(overId && overId !== draggingState.id ? overId : undefined);
    };

    const onUp = (event: MouseEvent) => {
      const overId = findTabUnderPointer(event.clientX, event.clientY);
      const moved =
        draggingState.active ||
        Math.abs(event.clientX - draggingState.startX) > 5 ||
        Math.abs(event.clientY - draggingState.startY) > 5;
      if (moved && overId && overId !== draggingState.id) {
        onReorderRef.current(draggingState.id, overId);
      }
      setDraggingTab(undefined);
      setDragOverTabId(undefined);
      document.body.classList.remove("tab-drag-active");
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };

    document.body.classList.add("tab-drag-active");
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    return () => {
      document.body.classList.remove("tab-drag-active");
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };
  }, [draggingTabId]);

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
              className={`tab ${active ? "active" : ""}${draggingTab?.id === tab.id && draggingTab.active ? " dragging" : ""}${dragOverTabId === tab.id && draggingTab?.id !== tab.id ? " drag-over" : ""}`}
              data-tab-id={tab.id}
              style={{
                "--tab-color": tab.color,
                transform: draggingTab?.id === tab.id && draggingTab.active ? `translateX(${draggingTab.currentX - draggingTab.startX}px)` : undefined,
              } as CSSProperties}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => props.onSelectTab(tab.id)}
              onMouseDown={(event) => {
                if (event.button !== 0 || renamingTab) return;
                const target = event.target as HTMLElement;
                if (target.closest("button, input")) return;
                setDraggingTab({ id: tab.id, startX: event.clientX, startY: event.clientY, currentX: event.clientX, active: false });
              }}
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
                    event.stopPropagation();
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
            <div className="newtab-dropdown">
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
        <div className="context-anchor">
          <div
            ref={contextMenuRef}
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
