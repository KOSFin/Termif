import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { X, ChevronDown, Plus } from "lucide-react";
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
  const [scrollViewportWidth, setScrollViewportWidth] = useState<number>();
  const [scrollLimited, setScrollLimited] = useState(false);

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const contextTab = useMemo(
    () => props.tabs.find((tab) => tab.id === contextTabId),
    [contextTabId, props.tabs]
  );

  const closeContext = () => {
    setContextTabId(undefined);
    setContextPosition(undefined);
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
    const stripEl = stripRef.current;
    const scrollEl = scrollRef.current;
    const actionsEl = actionsRef.current;
    if (!stripEl || !scrollEl || !actionsEl) return;

    const stripWidth = stripEl.clientWidth;
    const actionsWidth = actionsEl.offsetWidth;
    const maxScrollWidth = Math.max(100, stripWidth - actionsWidth - 2);
    const contentWidth = scrollEl.scrollWidth;

    const limited = contentWidth > maxScrollWidth;
    setScrollLimited(limited);
    setScrollViewportWidth(limited ? maxScrollWidth : contentWidth);
  }, []);

  useLayoutEffect(() => {
    updateLayout();
  }, [updateLayout, props.tabs]);

  useEffect(() => {
    const observer = new ResizeObserver(() => updateLayout());
    if (stripRef.current) observer.observe(stripRef.current);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (actionsRef.current) observer.observe(actionsRef.current);
    return () => observer.disconnect();
  }, [updateLayout]);

  return (
    <div className="tabstrip" ref={stripRef}>
      <div
        className={`tabstrip-scroll${scrollLimited ? " limited" : ""}`}
        style={scrollViewportWidth ? { width: `${scrollViewportWidth}px` } : undefined}
        ref={scrollRef}
        role="tablist"
        aria-label="Terminal tabs"
      >
        {props.tabs.map((tab) => {
          const active = tab.id === props.activeTabId;
          return (
            <button
              key={tab.id}
              className={`tab ${active ? "active" : ""}`}
              style={{ "--tab-color": tab.color } as CSSProperties}
              onClick={() => props.onSelectTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                const pos = clampMenuPosition(event.clientX, event.clientY);
                setContextTabId(tab.id);
                setContextPosition(pos);
              }}
            >
              <span className="tab-title">{tab.title}</span>
              <span
                className="tab-close"
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onClose(tab.id);
                }}
              >
                <X size={11} strokeWidth={2.5} />
              </span>
            </button>
          );
        })}
      </div>
      <div className={`tabstrip-actions${scrollLimited ? " pinned" : ""}`} ref={actionsRef}>
        <button className="tab-action" onClick={props.onNewDefault} title="New tab">
          <Plus size={15} strokeWidth={2} />
        </button>
        <div className="newtab-dropdown-wrap">
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
              <button onClick={() => { props.onNewShell("powershell"); setNewTabMenuOpen(false); }}>PowerShell</button>
              <button onClick={() => { props.onNewShell("cmd"); setNewTabMenuOpen(false); }}>CMD</button>
              <button onClick={() => { props.onNewShell("pwsh"); setNewTabMenuOpen(false); }}>PowerShell 7</button>
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
              onClick={() => {
                const nextName = window.prompt("Rename tab", contextTab.title)?.trim();
                if (nextName) {
                  props.onRename(contextTab.id, nextName);
                }
                closeContext();
              }}
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
