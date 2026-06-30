import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ElementRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { emit } from "@tauri-apps/api/event";
import { listen } from "@tauri-apps/api/event";
import { Window } from "@tauri-apps/api/window";
import { X, ChevronDown, Plus, Terminal, Globe, Monitor } from "lucide-react";
import { ContextMenu, type MenuPoint, anchorMenuFromRect } from "@/components/ContextMenu";
import { getShellProfileOptions } from "@/platform/platform";
import type { AppTab } from "@/types/models";
import { OS_CACHE_KEY, type OsInfo } from "@/features/ssh/sshHostPickerUtils";
import { OsLogoBadge } from "@/features/ssh/OsLogo";
import { TAB_DRAG_EVENT, TAB_DROP_EVENT, type TabDragPayload, type TabDropPayload } from "@/app/windows/windowing";
import { pickInsertionSlot } from "@/app/tabs/tabDragGeometry";

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
  currentWindowLabel: string;
  isMainWindow: boolean;
  availableWindowTargets: Array<{ label: string; title: string }>;
  onSelectTab: (tabId: string) => void;
  onNewDefault: () => void;
  onNewShell: (shell: string) => void;
  onNewSsh: () => void;
  onRename: (tabId: string, name: string) => void;
  onColor: (tabId: string, color: string) => void;
  onReorder: (fromTabId: string, toTabId: string, side: "before" | "after") => void;
  onDuplicate: (tabId: string) => void;
  onDetachTab: (tabId: string) => void;
  onDetachTabAtPosition: (tabId: string, point: { x: number; y: number }) => void;
  onAcceptDroppedTab: (payload: { tabId: string; sourceWindow: string; targetTabId?: string; side?: "before" | "after" }) => void;
  onMoveTabToMainWindow: (tabId: string) => void;
  onMoveTabToWindow: (tabId: string, targetWindowLabel: string) => void;
  onClose: (tabId: string) => void;
}

const palette = ["#4a8fe7", "#3dba84", "#e0a84a", "#e05468", "#9a7ce5", "#6b7a8d"];

export function TabStrip(props: TabStripProps) {
  const [contextTabId, setContextTabId] = useState<string>();
  const [contextPosition, setContextPosition] = useState<MenuPoint>();
  const [newTabMenuAnchor, setNewTabMenuAnchor] = useState<MenuPoint | null>(null);
  const [scrollLimited, setScrollLimited] = useState(false);
  const [renamingTab, setRenamingTab] = useState<{ id: string; value: string }>();
  const [draggingTab, setDraggingTab] = useState<{
    id: string;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    active: boolean;
    grabOffsetX: number;
    grabOffsetY: number;
    tabWidth: number;
    stripTop: number;
  }>();
  const [dragOverState, setDragOverState] = useState<{ tabId: string; side: "before" | "after" }>();
  const [externalDropState, setExternalDropState] = useState<{ tabId: string; side: "before" | "after" }>();

  // Live-reordered tab list during drag (browser-style visual reorder)
  const liveTabOrder = useMemo<typeof props.tabs>(() => {
    if (!draggingTab?.active || !dragOverState) return props.tabs;
    const dragId = draggingTab.id;
    const overState = dragOverState;
    const without = props.tabs.filter((t) => t.id !== dragId);
    const draggedTab = props.tabs.find((t) => t.id === dragId);
    if (!draggedTab) return props.tabs;
    const targetIdx = without.findIndex((t) => t.id === overState.tabId);
    if (targetIdx < 0) return props.tabs;
    const insertIdx = overState.side === "after" ? targetIdx + 1 : targetIdx;
    const next = [...without];
    next.splice(insertIdx, 0, draggedTab);
    return next;
  }, [draggingTab, dragOverState, props.tabs]);

  const renamingTabId = renamingTab?.id;
  const draggingTabId = draggingTab?.id;
  const liveOrderKey = liveTabOrder.map((t) => t.id).join(",");

  const stripRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<ElementRef<"input">>(null);
  const renameFocusedTabIdRef = useRef<string>();
  const draggingTabRef = useRef<typeof draggingTab>();
  // Static geometry captured at drag start. Local reordering is resolved against
  // this snapshot — never the live, FLIP-animating DOM — so a given cursor X always
  // maps to the same insertion slot. This is what eliminates the jiggle: without it,
  // hit-testing read mid-animation rects and oscillated between two targets.
  const dragGeometryRef = useRef<{
    centers: Array<{ id: string; center: number }>;
    scrollLeft: number;
    stripLeft: number;
    stripRight: number;
    stripTop: number;
    stripBottom: number;
  }>();
  const onReorderRef = useRef(props.onReorder);
  const onDetachAtPositionRef = useRef(props.onDetachTabAtPosition);
  const currentWindowLabelRef = useRef(props.currentWindowLabel);
  const onMoveTabToWindowRef = useRef(props.onMoveTabToWindow);
  const onAcceptDroppedTabRef = useRef(props.onAcceptDroppedTab);

  // FLIP animation for tab reorder during drag
  const prevTabPositionsRef = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    if (!scrollRef.current) return;
    const elements = Array.from(scrollRef.current.querySelectorAll<HTMLElement>("[data-tab-id]"));
    const prev = prevTabPositionsRef.current;
    elements.forEach((el) => {
      const tabId = el.dataset.tabId;
      if (!tabId || el.classList.contains("tab-drag-placeholder")) return;
      const prevX = prev.get(tabId);
      const currX = el.getBoundingClientRect().left;
      if (prevX !== undefined && Math.abs(prevX - currX) > 1) {
        const delta = prevX - currX;
        el.style.transition = "none";
        el.style.transform = `translateX(${delta}px)`;
        requestAnimationFrame(() => {
          el.style.transform = "";
          el.style.transition = "transform 0.12s ease";
        });
      }
      prev.set(tabId, currX);
    });
  }, [liveOrderKey]);

  const contextTab = useMemo(
    () => props.tabs.find((tab) => tab.id === contextTabId),
    [contextTabId, props.tabs]
  );
  const shellOptions = useMemo(() => getShellProfileOptions(), []);

  useEffect(() => {
    onReorderRef.current = props.onReorder;
  }, [props.onReorder]);

  useEffect(() => {
    onDetachAtPositionRef.current = props.onDetachTabAtPosition;
  }, [props.onDetachTabAtPosition]);

  useEffect(() => {
    currentWindowLabelRef.current = props.currentWindowLabel;
  }, [props.currentWindowLabel]);

  useEffect(() => {
    onMoveTabToWindowRef.current = props.onMoveTabToWindow;
  }, [props.onMoveTabToWindow]);

  useEffect(() => {
    onAcceptDroppedTabRef.current = props.onAcceptDroppedTab;
  }, [props.onAcceptDroppedTab]);

  useEffect(() => {
    draggingTabRef.current = draggingTab;
  }, [draggingTab]);

  // Snapshot tab slot centers at drag start so local reordering never has to read
  // the live DOM (which is mid-FLIP-animation and would oscillate). Centers are
  // captured in viewport space; horizontal scrolling during the drag is corrected
  // for via the recorded scrollLeft.
  const captureDragGeometry = useCallback(() => {
    const stripBounds = stripRef.current?.getBoundingClientRect();
    const scrollEl = scrollRef.current;
    if (!stripBounds || !scrollEl) {
      dragGeometryRef.current = undefined;
      return;
    }
    const elements = Array.from(scrollEl.querySelectorAll<HTMLElement>("[data-tab-id]"));
    const centers = elements
      .map((el) => {
        const id = el.dataset.tabId;
        if (!id) return null;
        const rect = el.getBoundingClientRect();
        return { id, center: rect.left + rect.width / 2 };
      })
      .filter((entry): entry is { id: string; center: number } => entry !== null)
      .sort((a, b) => a.center - b.center);
    dragGeometryRef.current = {
      centers,
      scrollLeft: scrollEl.scrollLeft,
      stripLeft: stripBounds.left,
      stripRight: stripBounds.right,
      stripTop: stripBounds.top,
      stripBottom: stripBounds.bottom,
    };
  }, []);

  // Resolve the local drop target from the static snapshot. The cursor's X is
  // compared against fixed slot centers (shifted by any scroll since drag start),
  // so a given pointer position deterministically yields one insertion slot — the
  // mapping is monotonic, which makes the flicker mathematically impossible.
  const resolveLocalDropTarget = useCallback((clientX: number, clientY: number, dragTabId: string) => {
    const geo = dragGeometryRef.current;
    if (!geo) return { insideStrip: false } as const;

    const insideStrip =
      clientX >= geo.stripLeft &&
      clientX <= geo.stripRight &&
      clientY >= geo.stripTop &&
      clientY <= geo.stripBottom;
    if (!insideStrip) return { insideStrip: false } as const;

    const others = geo.centers.filter((entry) => entry.id !== dragTabId);
    if (others.length === 0) return { insideStrip: true } as const;

    // Shift captured centers by any scroll that happened since drag start.
    const scrollDelta = (scrollRef.current?.scrollLeft ?? geo.scrollLeft) - geo.scrollLeft;
    const slot = pickInsertionSlot(others, clientX, scrollDelta);
    if (!slot) return { insideStrip: true } as const;
    return { insideStrip: true, tabId: slot.tabId, side: slot.side } as const;
  }, []);

  const resolveStripDropTarget = useCallback((clientX: number, clientY: number, dragTabId?: string) => {
    const stripBounds = stripRef.current?.getBoundingClientRect();
    if (!stripBounds) {
      return { insideStrip: false } as const;
    }

    const insideStrip =
      clientX >= stripBounds.left &&
      clientX <= stripBounds.right &&
      clientY >= stripBounds.top &&
      clientY <= stripBounds.bottom;

    if (!insideStrip) {
      return { insideStrip: false } as const;
    }

    const tabElements = Array.from(
      scrollRef.current?.querySelectorAll<HTMLElement>("[data-tab-id]") ?? []
    );

    const draggedRect = dragTabId
      ? tabElements.find((el) => el.dataset.tabId === dragTabId)?.getBoundingClientRect()
      : undefined;
    const pointerBiasX =
      draggedRect && dragTabId
        ? clientX + (clientX - (draggedRect.left + draggedRect.width / 2))
        : clientX;

    const tabElement = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-tab-id]");
    const tabId = tabElement?.dataset.tabId;
    if (tabElement && tabId) {
      const rect = tabElement.getBoundingClientRect();
      const side: "before" | "after" = pointerBiasX <= rect.left + rect.width / 2 ? "before" : "after";
      return { insideStrip: true, tabId, side } as const;
    }

    if (props.tabs.length === 0) {
      return { insideStrip: true } as const;
    }

    if (tabElements.length === 0) {
      return { insideStrip: true } as const;
    }

    const first = tabElements[0];
    const last = tabElements[tabElements.length - 1];
    const firstId = first.dataset.tabId;
    const lastId = last.dataset.tabId;
    const firstRect = first.getBoundingClientRect();
    if (firstId && pointerBiasX <= firstRect.left + firstRect.width / 2) {
      return { insideStrip: true, tabId: firstId, side: "before" as const } as const;
    }

    if (lastId) {
      return { insideStrip: true, tabId: lastId, side: "after" as const } as const;
    }

    return { insideStrip: true } as const;
  }, [props.tabs]);

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
    const stripBounds = stripRef.current?.getBoundingClientRect();

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      setDraggingTab(undefined);
      setDragOverState(undefined);
      document.body.classList.remove("tab-drag-active");
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
    };

    const onMove = (event: MouseEvent) => {
      const moved =
        Math.abs(event.clientX - draggingState.startX) > 5 ||
        Math.abs(event.clientY - draggingState.startY) > 5;
      setDraggingTab((prev) =>
        prev ? { ...prev, currentX: event.clientX, currentY: event.clientY, active: prev.active || moved } : prev
      );
      if (!draggingState.active && !moved) return;

      if (moved) {
        const currentDrag = draggingTabRef.current;
        const payload: TabDragPayload = {
          sourceWindow: currentWindowLabelRef.current,
          tabId: draggingState.id,
          screenX: event.screenX,
          screenY: event.screenY,
          phase: currentDrag?.active ? "move" : "start",
        };
        void emit(TAB_DRAG_EVENT, payload).catch(() => undefined);
      }
      const nextState =
        draggingTabRef.current
          ? { ...draggingState, ...draggingTabRef.current, currentX: event.clientX, currentY: event.clientY, active: draggingState.active || moved }
          : { ...draggingState, currentX: event.clientX, currentY: event.clientY, active: draggingState.active || moved };
      // Resolve against the static snapshot, NOT the live DOM — the dragged tab is a
      // fixed ghost and the remaining tabs are mid-FLIP, so live hit-testing oscillates.
      const over = resolveLocalDropTarget(event.clientX, event.clientY, nextState.id);
      setDragOverState(
        nextState.active && over.insideStrip && over.tabId && over.tabId !== draggingState.id
          ? { tabId: over.tabId, side: over.side }
          : undefined
      );
    };

    const onUp = (event: MouseEvent) => {
      const over = resolveLocalDropTarget(event.clientX, event.clientY, draggingState.id);
      const moved =
        draggingState.active ||
        Math.abs(event.clientX - draggingState.startX) > 5 ||
        Math.abs(event.clientY - draggingState.startY) > 5;
      const outsideStrip = stripBounds
        ? event.clientY < stripBounds.top - 16 ||
          event.clientY > stripBounds.bottom + 20 ||
          event.clientX < stripBounds.left - 24 ||
          event.clientX > stripBounds.right + 24
        : false;
      const finalize = async () => {
        if (moved && outsideStrip) {
          const windows = await Window.getAll().catch(() => []);
          const target = await Promise.all(
            windows
              .filter((win) => win.label !== currentWindowLabelRef.current)
              .map(async (win) => {
                const [position, size] = await Promise.all([
                  win.outerPosition(),
                  win.outerSize(),
                ]).catch(() => [null, null] as const);
                if (!position || !size) return null;
                const inside =
                  event.screenX >= position.x &&
                  event.screenY >= position.y &&
                  event.screenX <= position.x + size.width &&
                  event.screenY <= position.y + size.height;
                return inside ? win.label : null;
              })
          ).then((matches) => matches.find(Boolean));

          if (target) {
            const dropPayload: TabDropPayload = {
              sourceWindow: currentWindowLabelRef.current,
              tabId: draggingState.id,
              screenX: event.screenX,
              screenY: event.screenY,
              targetWindow: target,
            };
            void emit(TAB_DROP_EVENT, dropPayload).catch(() => undefined);
          } else {
            onDetachAtPositionRef.current(draggingState.id, { x: event.screenX, y: event.screenY });
          }
        } else if (moved && over.insideStrip && over.tabId && over.tabId !== draggingState.id) {
          onReorderRef.current(draggingState.id, over.tabId, over.side);
        }

        if (moved) {
          void emit(TAB_DRAG_EVENT, {
            sourceWindow: currentWindowLabelRef.current,
            tabId: draggingState.id,
            screenX: event.screenX,
            screenY: event.screenY,
            phase: "end",
          } satisfies TabDragPayload).catch(() => undefined);
        }
        cleanup();
      };
      void finalize();
    };

    // Capture the static slot geometry once, before any movement reorders the DOM.
    captureDragGeometry();
    document.body.classList.add("tab-drag-active");
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
    return cleanup;
  }, [draggingTabId, captureDragGeometry, resolveLocalDropTarget]);

  useEffect(() => {
    const unlistenPromise = listen<TabDropPayload>(TAB_DROP_EVENT, (event) => {
      const payload = event.payload;
      if (payload.sourceWindow === currentWindowLabelRef.current) return;
      if (payload.targetWindow && payload.targetWindow !== currentWindowLabelRef.current) return;
      const clientX = payload.screenX - window.screenX;
      const clientY = payload.screenY - window.screenY;
      const insideWindow =
        clientX >= 0 &&
        clientY >= 0 &&
        clientX <= window.innerWidth &&
        clientY <= window.innerHeight;
      if (!insideWindow) return;
      const target = resolveStripDropTarget(clientX, clientY, payload.tabId);
      const targetTabId = target.insideStrip ? target.tabId : undefined;
      const side = target.insideStrip ? target.side : undefined;
      onAcceptDroppedTabRef.current({
        tabId: payload.tabId,
        sourceWindow: payload.sourceWindow,
        targetTabId,
        side,
      });
      setExternalDropState(undefined);
    });

    return () => {
      void unlistenPromise.then((unlisten: () => void) => unlisten());
    };
  }, [resolveStripDropTarget]);

  useEffect(() => {
    const unlistenPromise = listen<TabDragPayload>(TAB_DRAG_EVENT, (event) => {
      const payload = event.payload;
      if (payload.sourceWindow === currentWindowLabelRef.current || payload.phase === "end") {
        setExternalDropState(undefined);
        return;
      }
      const clientX = payload.screenX - window.screenX;
      const clientY = payload.screenY - window.screenY;
      const insideWindow =
        clientX >= 0 &&
        clientY >= 0 &&
        clientX <= window.innerWidth &&
        clientY <= window.innerHeight;
      if (!insideWindow) {
        setExternalDropState(undefined);
        return;
      }
      const target = resolveStripDropTarget(clientX, clientY, payload.tabId);
      if (!target.insideStrip || !target.tabId) {
        setExternalDropState(undefined);
        return;
      }
      setExternalDropState({ tabId: target.tabId, side: target.side });
    });

    return () => {
      void unlistenPromise.then((unlisten: () => void) => unlisten());
    };
  }, [resolveStripDropTarget]);

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
        {liveTabOrder.map((tab) => {
          const active = tab.id === props.activeTabId;
          const isDragging = draggingTab?.id === tab.id && draggingTab.active;

          // While dragging, keep a placeholder in-flow so other tabs slide around it.
          // The actual tab is rendered as a fixed-position ghost below (no in-flow jiggle).
          if (isDragging) {
            return (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className="tab tab-drag-placeholder"
                style={{ minWidth: draggingTab.tabWidth, maxWidth: draggingTab.tabWidth, width: draggingTab.tabWidth } as CSSProperties}
              />
            );
          }

          return (
            <div
              key={tab.id}
              className={`tab ${active ? "active" : ""}${externalDropState?.tabId === tab.id ? ` external-drop external-${externalDropState.side}` : ""}`}
              data-tab-id={tab.id}
              style={{ "--tab-color": tab.color } as CSSProperties}
              role="tab"
              tabIndex={0}
              aria-selected={active}
              onClick={() => props.onSelectTab(tab.id)}
              onMouseDown={(event) => {
                if (event.button !== 0 || renamingTab) return;
                const target = event.target as HTMLElement;
                if (target.closest("button, input")) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const stripRect = stripRef.current?.getBoundingClientRect();
                setDraggingTab({
                  id: tab.id,
                  startX: event.clientX,
                  startY: event.clientY,
                  currentX: event.clientX,
                  currentY: event.clientY,
                  active: false,
                  grabOffsetX: event.clientX - rect.left,
                  grabOffsetY: event.clientY - (stripRect?.top ?? rect.top),
                  tabWidth: rect.width,
                  stripTop: stripRect?.top ?? rect.top,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  props.onSelectTab(tab.id);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextTabId(tab.id);
                setContextPosition({ x: event.clientX, y: event.clientY });
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
        <div className="tab-new-group" role="group" aria-label="Create tab">
        <button className="tab-action" onClick={props.onNewDefault} title="New tab">
          <Plus size={15} strokeWidth={2} />
        </button>
        <button
          className="tab-action tab-action-secondary"
          title="New tab options"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setNewTabMenuAnchor((current) =>
              current
                ? null
                : anchorMenuFromRect(rect, { width: 188, height: 240 }, "bottom-end")
            );
          }}
        >
          <ChevronDown size={13} strokeWidth={2} />
        </button>
        </div>
      </div>

      {/* Fixed-position ghost tab that follows the cursor during drag. Portaled to
          document.body so it escapes the topbar's backdrop-filter containing block
          and overflow:hidden clip.

          A web view cannot paint outside its own OS window, so once the cursor
          leaves the window the raw ghost position would fly off-screen and vanish.
          Instead we CLAMP the ghost to the window edges: it rides the boundary
          nearest the cursor, staying visible as a directional cue for where the
          drop (window-to-window move, or new-window spawn) will land on release. */}
      {draggingTab?.active && (() => {
        const ghostTab = props.tabs.find((t) => t.id === draggingTab.id);
        if (!ghostTab) return null;
        const GHOST_HEIGHT = 38;
        const rawLeft = draggingTab.currentX - draggingTab.grabOffsetX;
        const rawTop = draggingTab.currentY - draggingTab.grabOffsetY;
        const maxLeft = Math.max(0, window.innerWidth - draggingTab.tabWidth);
        const maxTop = Math.max(0, window.innerHeight - GHOST_HEIGHT);
        const left = Math.min(Math.max(rawLeft, 0), maxLeft);
        const top = Math.min(Math.max(rawTop, 0), maxTop);
        // When the cursor has pushed the ghost onto an edge, flag it so the styling
        // can hint "this will detach/move" rather than look like an in-strip drag.
        const onEdge = left !== rawLeft || top !== rawTop;
        return createPortal(
          <div
            className={`tab dragging${onEdge ? " dragging-edge" : ""}`}
            style={{
              position: "fixed",
              left,
              top,
              width: draggingTab.tabWidth,
              height: GHOST_HEIGHT,
              zIndex: 1000,
              pointerEvents: "none",
              "--tab-color": ghostTab.color,
            } as CSSProperties}
          >
            <span className="tab-icon">{resolveTabIcon(ghostTab)}</span>
            <span className="tab-title">{ghostTab.title}</span>
          </div>,
          document.body
        );
      })()}

      <ContextMenu
        open={!!newTabMenuAnchor}
        anchor={newTabMenuAnchor}
        onClose={() => setNewTabMenuAnchor(null)}
        className="tab-context-menu"
        minWidth={188}
        allowViewportOverflowOnMac
      >
        <button onClick={() => { props.onNewDefault(); setNewTabMenuAnchor(null); }}>Default Terminal</button>
        {shellOptions.map((shell) => (
          <button key={shell.id} onClick={() => { props.onNewShell(shell.id); setNewTabMenuAnchor(null); }}>
            {shell.label}
          </button>
        ))}
        <button onClick={() => { props.onNewSsh(); setNewTabMenuAnchor(null); }}>SSH Connection</button>
      </ContextMenu>

      <ContextMenu
        open={!!contextTab && !!contextPosition}
        anchor={contextPosition ?? null}
        onClose={closeContext}
        className="tab-context-menu"
        allowViewportOverflowOnMac
      >
        {contextTab ? (
          <>
            <button onClick={() => startRename(contextTab)}>Rename</button>
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
            <div className="context-separator" />
            <button
              onClick={() => {
                props.onDuplicate(contextTab.id);
                closeContext();
              }}
            >
              Duplicate
            </button>
            {props.isMainWindow ? (
              <button
                onClick={() => {
                  props.onDetachTab(contextTab.id);
                  closeContext();
                }}
              >
                Move to New Window
              </button>
            ) : (
              <button
                onClick={() => {
                  props.onMoveTabToMainWindow(contextTab.id);
                  closeContext();
                }}
              >
                Move to Main Window
              </button>
            )}
            {props.availableWindowTargets.length > 0 ? (
              <>
                <div className="context-separator" />
                <div className="context-section">
                  <div className="context-label">Move to Window</div>
                  <div className="context-window-list">
                    {props.availableWindowTargets.map((target) => (
                      <button
                        key={target.label}
                        onClick={() => {
                          props.onMoveTabToWindow(contextTab.id, target.label);
                          closeContext();
                        }}
                      >
                        {target.title}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
            <button
              className="danger"
              onClick={() => {
                props.onClose(contextTab.id);
                closeContext();
              }}
            >
              Close
            </button>
          </>
        ) : null}
      </ContextMenu>
    </div>
  );
}
