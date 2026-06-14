import { useEffect, useMemo, useRef } from "react";
import { FolderOpen, Braces, ClipboardList } from "lucide-react";
import { FileManagerPane } from "@/features/file_manager/FileManagerPane";
import { SnippetsPane } from "@/features/snippets/SnippetsPane";
import { ClipboardPane } from "@/features/clipboard/ClipboardPane";
import { useAppStore } from "@/store/useAppStore";

interface SidebarProps {
  hidden?: boolean;
}

export function Sidebar({ hidden }: SidebarProps) {
  const { tabs, activeTabId, selectedSidebarTool, setSelectedSidebarTool, sidebarWidth, setSidebarWidth, setSidebarVisible } = useAppStore((state) => ({
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    selectedSidebarTool: state.selectedSidebarTool,
    setSelectedSidebarTool: state.setSelectedSidebarTool,
    sidebarWidth: state.sidebarWidth,
    setSidebarWidth: state.setSidebarWidth,
    setSidebarVisible: state.setSidebarVisible,
  }));

  const asideRef = useRef<HTMLElement>(null);
  const hiddenRef = useRef(hidden);
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  useEffect(() => {
    const aside = asideRef.current;
    if (!aside) return;

    const handle = aside.querySelector<HTMLElement>(".sidebar-resize-handle");
    if (!handle) return;

    let dragging = false;
    let rafId = 0;

    const calcBounds = () => {
      const workspace = aside.parentElement;
      const width = workspace?.clientWidth ?? window.innerWidth;
      const min = 196;
      const max = Math.max(min + 36, Math.min(520, Math.floor(width * 0.7)));
      const hideThreshold = Math.max(120, min - 36);
      return { min, max, hideThreshold };
    };

    const cleanupDrag = () => {
      dragging = false;
      document.body.classList.remove("sidebar-resizing");
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mouseup", onUp, true);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const scheduleSidebarWidth = (nextWidth: number) => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setSidebarWidth(nextWidth);
        rafId = 0;
      });
    };

    const applyDragWidth = (clientX: number) => {
      const { min, max, hideThreshold } = calcBounds();
      const workspaceRect = aside.parentElement?.getBoundingClientRect();
      const rawWidth = workspaceRect ? clientX - workspaceRect.left : clientX;

      if (rawWidth <= hideThreshold) {
        if (!hiddenRef.current) {
          hiddenRef.current = true;
          setSidebarVisible(false);
        }
        return;
      }

      const clamped = Math.max(min, Math.min(max, Math.round(rawWidth)));
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setSidebarVisible(true);
      }
      scheduleSidebarWidth(clamped);
    };

    const onMove = (event: MouseEvent) => {
      if (!dragging) return;
      applyDragWidth(event.clientX);
    };

    const onUp = () => {
      cleanupDrag();
    };

    const onDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      document.body.classList.add("sidebar-resizing");
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("mouseup", onUp, true);
    };

    handle.addEventListener("mousedown", onDown);
    return () => {
      cleanupDrag();
      handle.removeEventListener("mousedown", onDown);
    };
  }, [setSidebarVisible, setSidebarWidth]);

  useEffect(() => {
    if (hidden) return;

    const clampToWorkspace = () => {
      const workspace = asideRef.current?.parentElement;
      const width = workspace?.clientWidth ?? window.innerWidth;
      const min = 196;
      const max = Math.max(min + 36, Math.min(520, Math.floor(width * 0.7)));
      const hideThreshold = Math.max(120, min - 36);

      if (width <= hideThreshold) {
        setSidebarVisible(false);
        return;
      }

      const clamped = Math.max(min, Math.min(max, Math.round(sidebarWidth)));
      if (clamped !== sidebarWidth) {
        setSidebarWidth(clamped);
      }
    };

    clampToWorkspace();
    window.addEventListener("resize", clampToWorkspace);
    return () => window.removeEventListener("resize", clampToWorkspace);
  }, [hidden, setSidebarVisible, setSidebarWidth, sidebarWidth]);

  return (
    <aside
      ref={asideRef}
      className={`sidebar${hidden ? " sidebar-hidden" : ""}`}
      style={{ width: hidden ? undefined : `${sidebarWidth}px` }}
    >
      <div className="sidebar-tools">
        <button
          className={selectedSidebarTool === "files" ? "active" : ""}
          title="Files"
          onClick={() => setSelectedSidebarTool("files")}
        >
          <FolderOpen size={15} strokeWidth={2} />
        </button>
        <button
          className={selectedSidebarTool === "snippets" ? "active" : ""}
          title="Snippets"
          onClick={() => setSelectedSidebarTool("snippets")}
        >
          <Braces size={15} strokeWidth={2} />
        </button>
        <button
          className={selectedSidebarTool === "clipboard" ? "active" : ""}
          title="Clipboard History"
          onClick={() => setSelectedSidebarTool("clipboard")}
        >
          <ClipboardList size={15} strokeWidth={2} />
        </button>
      </div>
      <div className="sidebar-content">
        {selectedSidebarTool === "files" ? (
          <FileManagerPane
            activeSessionId={activeTab?.sessionId}
            isRemote={activeTab?.kind === "ssh"}
            sshAlias={activeTab?.sshAlias}
          />
        ) : selectedSidebarTool === "snippets" ? (
          <SnippetsPane activeSessionId={activeTab?.sessionId} />
        ) : (
          <ClipboardPane />
        )}
      </div>
      <div className="sidebar-resize-handle" aria-hidden="true" />
    </aside>
  );
}
