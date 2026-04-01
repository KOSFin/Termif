import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Square, X, Command, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { TabStrip } from "@/app/tabs/TabStrip";
import { Sidebar } from "@/app/sidebar/Sidebar";
import { CommandPalette, type PaletteCommand } from "@/app/palette/CommandPalette";
import { SettingsPanel } from "@/app/settings/SettingsPanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useAppStore, type EditorDock } from "@/store/useAppStore";
import type { AppTab } from "@/types/models";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { SshHostPicker } from "@/features/ssh/SshHostPicker";
import { InlineEditorPanel } from "@/features/editor/InlineEditorPanel";
import { openEditorWindow } from "@/features/file_manager/editorWindow";

export function AppShell() {
  const {
    isInitialized,
    initialize,
    tabs,
    activeTabId,
    sidebarVisible,
    paletteOpen,
    settingsOpen,
    settings,
    selectedFile,
    lastToast,
    createLocalTab,
    createSshPickerTab,
    closeTab,
    duplicateTab,
    renameTab,
    setTabColor,
    setActiveTab,
    setPaletteOpen,
    setSettingsOpen,
    toggleSidebar,
    loadCurrentFiles,
    saveSettings,
    toast,
    activateNextTab,
    activatePrevTab,
    activateTabByIndex,
    tabMruOrder,
    editorVisible,
    editorDock,
    editorSplitPercent,
    editorFiles,
    activeEditorFileId,
    zoomLevel,
    openFile,
    setEditorVisible,
    setEditorDock,
    setEditorSplitPercent,
    hasUnsavedEditorFiles,
    zoomIn,
    zoomOut,
    zoomReset,
  } = useAppStore((state) => ({
    isInitialized: state.isInitialized,
    initialize: state.initialize,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    sidebarVisible: state.sidebarVisible,
    paletteOpen: state.paletteOpen,
    settingsOpen: state.settingsOpen,
    settings: state.settings,
    selectedFile: state.selectedFile,
    lastToast: state.lastToast,
    createLocalTab: state.createLocalTab,
    createSshPickerTab: state.createSshPickerTab,
    closeTab: state.closeTab,
    duplicateTab: state.duplicateTab,
    renameTab: state.renameTab,
    setTabColor: state.setTabColor,
    setActiveTab: state.setActiveTab,
    setPaletteOpen: state.setPaletteOpen,
    setSettingsOpen: state.setSettingsOpen,
    toggleSidebar: state.toggleSidebar,
    loadCurrentFiles: state.loadCurrentFiles,
    saveSettings: state.saveSettings,
    toast: state.toast,
    activateNextTab: state.activateNextTab,
    activatePrevTab: state.activatePrevTab,
    activateTabByIndex: state.activateTabByIndex,
    tabMruOrder: state.tabMruOrder,
    editorVisible: state.editorVisible,
    editorDock: state.editorDock,
    editorSplitPercent: state.editorSplitPercent,
    editorFiles: state.editorFiles,
    activeEditorFileId: state.activeEditorFileId,
    zoomLevel: state.zoomLevel,
    openFile: state.openFile,
    setEditorVisible: state.setEditorVisible,
    setEditorDock: state.setEditorDock,
    setEditorSplitPercent: state.setEditorSplitPercent,
    hasUnsavedEditorFiles: state.hasUnsavedEditorFiles,
    zoomIn: state.zoomIn,
    zoomOut: state.zoomOut,
    zoomReset: state.zoomReset,
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);
  const activeEditorFile = useMemo(
    () => editorFiles.find((file) => file.id === activeEditorFileId),
    [activeEditorFileId, editorFiles]
  );

  // ── Window controls ─────────────────────────────────────────────────
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const closingConfirmedRef = useRef(false);

  const confirmCloseWithUnsaved = useCallback(() => {
    if (!hasUnsavedEditorFiles()) return true;
    return window.confirm("You have unsaved editor files. Close the window anyway?");
  }, [hasUnsavedEditorFiles]);

  const onMinimize = () => void appWindow.minimize();
  const onMaximize = () => void appWindow.toggleMaximize();
  const onCloseWindow = () => {
    if (!confirmCloseWithUnsaved()) return;
    closingConfirmedRef.current = true;
    void appWindow.close();
  };
  const onStartWindowDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    void appWindow.startDragging();
  };

  // ── Tab switcher state (Windows Alt+Tab style) ────────────────────
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [tabSwitcherIndex, setTabSwitcherIndex] = useState(0);
  const tabSwitcherOpenRef = useRef(false);
  const tabSwitcherTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tabSwitcherPendingRef = useRef(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // ── Disable browser right-click context menu globally ─────────────
  useEffect(() => {
    const prevent = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", prevent);
    return () => document.removeEventListener("contextmenu", prevent);
  }, []);

  const hotkeyHandlers = useCallback(() => ({
    onOpenPalette: () => setPaletteOpen(true),
    onToggleSidebar: () => toggleSidebar(),
    onNewTab: () => {
      void createLocalTab(settings?.terminal.default_shell ?? "powershell");
    },
    onOpenSettings: () => setSettingsOpen(true),
    onCloseTab: () => {
      if (activeTabId) void closeTab(activeTabId);
    },
    onNextTab: () => activateNextTab(),
    onPrevTab: () => activatePrevTab(),
    onTabByIndex: (index: number) => activateTabByIndex(index),
    onRefreshFiles: () => {
      void loadCurrentFiles();
    },
    onZoomIn: () => zoomIn(),
    onZoomOut: () => zoomOut(),
    onZoomReset: () => zoomReset(),
    onToggleEditor: () => setEditorVisible(!editorVisible),
    onTabSwitcherOpen: (direction: 1 | -1) => {
      if (tabs.length < 2) return;
      const useMru = settings?.appearance.tab_switching_mode !== "positional";
      const orderedTabs = useMru
        ? tabMruOrder
            .map((id) => tabs.find((t) => t.id === id))
            .filter((t): t is typeof tabs[number] => !!t)
            .concat(tabs.filter((t) => !tabMruOrder.includes(t.id)))
        : tabs;

      if (!tabSwitcherOpenRef.current && !tabSwitcherPendingRef.current) {
        // First press — start delay, move selection
        const nextIdx = direction === 1 ? 1 : orderedTabs.length - 1;
        setTabSwitcherIndex(nextIdx);
        tabSwitcherPendingRef.current = true;
        tabSwitcherTimerRef.current = setTimeout(() => {
          if (tabSwitcherPendingRef.current) {
            setTabSwitcherOpen(true);
            tabSwitcherOpenRef.current = true;
          }
        }, 150);
      } else {
        // Subsequent press — cycle selection
        setTabSwitcherIndex((prev) => (prev + direction + orderedTabs.length) % orderedTabs.length);
      }
    },
    onTabSwitcherClose: () => {
      if (!tabSwitcherOpenRef.current && !tabSwitcherPendingRef.current) return;
      if (tabSwitcherTimerRef.current) {
        clearTimeout(tabSwitcherTimerRef.current);
        tabSwitcherTimerRef.current = undefined;
      }
      const useMru = settings?.appearance.tab_switching_mode !== "positional";
      const orderedTabs = useMru
        ? tabMruOrder
            .map((id) => tabs.find((t) => t.id === id))
            .filter((t): t is typeof tabs[number] => !!t)
            .concat(tabs.filter((t) => !tabMruOrder.includes(t.id)))
        : tabs;
      const target = orderedTabs[tabSwitcherIndex];
      if (target) setActiveTab(target.id);
      setTabSwitcherOpen(false);
      tabSwitcherOpenRef.current = false;
      tabSwitcherPendingRef.current = false;
    },
    onEscape: () => {
      if (tabSwitcherOpenRef.current || tabSwitcherPendingRef.current) {
        if (tabSwitcherTimerRef.current) {
          clearTimeout(tabSwitcherTimerRef.current);
          tabSwitcherTimerRef.current = undefined;
        }
        setTabSwitcherOpen(false);
        tabSwitcherOpenRef.current = false;
        tabSwitcherPendingRef.current = false;
        return;
      }
      if (paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
      }
    }
  }), [
    tabs, activeTabId, paletteOpen, settingsOpen, settings,
    setPaletteOpen, toggleSidebar, createLocalTab, setSettingsOpen,
    closeTab, activateNextTab, activatePrevTab, activateTabByIndex,
    loadCurrentFiles, setActiveTab, tabSwitcherIndex, tabMruOrder,
    zoomIn, zoomOut, zoomReset, editorVisible, setEditorVisible
  ]);

  useHotkeys(hotkeyHandlers());

  // ── Zoom: apply CSS zoom level ──────────────────────────────────
  useEffect(() => {
    document.documentElement.style.zoom = `${zoomLevel}%`;
  }, [zoomLevel]);

  // ── Zoom: Ctrl+Mouse Wheel ──────────────────────────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else if (e.deltaY > 0) zoomOut();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [zoomIn, zoomOut]);

  // ── Warn on close if unsaved editor files ───────────────────────
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedEditorFiles()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedEditorFiles]);

  useEffect(() => {
    const unlistenPromise = appWindow.onCloseRequested((event) => {
      if (closingConfirmedRef.current) {
        closingConfirmedRef.current = false;
        return;
      }
      if (!hasUnsavedEditorFiles()) return;

      event.preventDefault();
      const ok = window.confirm("You have unsaved editor files. Close the window anyway?");
      if (!ok) return;

      closingConfirmedRef.current = true;
      void appWindow.close();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [appWindow, hasUnsavedEditorFiles]);

  // ── Editor split drag state ─────────────────────────────────────
  const splitDragging = useRef(false);
  const centerPaneRef = useRef<HTMLElement>(null);
  const [dockDropTarget, setDockDropTarget] = useState<EditorDock | null>(null);

  const pickDockTarget = useCallback((x: number, y: number): EditorDock => {
    if (!centerPaneRef.current) return editorDock;
    const rect = centerPaneRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(rect.width, x - rect.left));
    const py = Math.max(0, Math.min(rect.height, y - rect.top));

    const leftDist = px;
    const rightDist = rect.width - px;
    const topDist = py;
    const bottomDist = rect.height - py;

    const min = Math.min(leftDist, rightDist, topDist, bottomDist);
    if (min === leftDist) return "left";
    if (min === rightDist) return "right";
    if (min === topDist) return "top";
    return "bottom";
  }, [editorDock]);

  const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;

    const isVertical = editorDock === "top" || editorDock === "bottom";
    const invert = editorDock === "right" || editorDock === "bottom";

    const onMove = (me: MouseEvent) => {
      if (!splitDragging.current || !centerPaneRef.current) return;
      const rect = centerPaneRef.current.getBoundingClientRect();
      const axisSize = isVertical ? rect.height : rect.width;
      const axisPos = isVertical ? me.clientY - rect.top : me.clientX - rect.left;
      const pct = invert ? ((axisSize - axisPos) / axisSize) * 100 : (axisPos / axisSize) * 100;
      setEditorSplitPercent(pct);
    };
    const onUp = () => {
      splitDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [editorDock, setEditorSplitPercent]);

  const onStartEditorDockDrag = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const onMove = (e: MouseEvent) => {
      setDockDropTarget(pickDockTarget(e.clientX, e.clientY));
    };

    const onUp = (e: MouseEvent) => {
      const nextDock = pickDockTarget(e.clientX, e.clientY);
      setEditorDock(nextDock);
      setDockDropTarget(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    setDockDropTarget(pickDockTarget(event.clientX, event.clientY));
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [pickDockTarget, setEditorDock]);

  const openActiveEditorInWindow = useCallback(() => {
    if (!activeEditorFile) return;
    openEditorWindow(activeEditorFile.path, activeEditorFile.mode, activeEditorFile.sessionId);
  }, [activeEditorFile]);

  const terminalContent = useMemo(() => (
    <>
      {isInitialized && activeTab?.kind === "ssh_picker" ? <SshHostPicker tabId={activeTab.id} /> : null}

      {isInitialized &&
        tabs
          .filter((t) => (t.kind === "local" || t.kind === "ssh") && t.sessionId)
          .map((t) => (
            <TerminalPane
              key={t.sessionId}
              sessionId={t.sessionId!}
              isVisible={t.id === activeTabId}
              sshAlias={t.sshAlias}
              terminalSettings={settings?.terminal}
            />
          ))}
    </>
  ), [activeTab, activeTabId, isInitialized, settings?.terminal, tabs]);

  const commands: PaletteCommand[] = [
    {
      id: "tab.new_default",
      title: "New Default Terminal",
      category: "Tabs",
      action: () => {
        void createLocalTab(settings?.terminal.default_shell ?? "powershell");
      }
    },
    {
      id: "tab.new_powershell",
      title: "New PowerShell Tab",
      category: "Tabs",
      action: () => {
        void createLocalTab("powershell");
      }
    },
    {
      id: "tab.new_cmd",
      title: "New CMD Tab",
      category: "Tabs",
      action: () => {
        void createLocalTab("cmd");
      }
    },
    {
      id: "ssh.open",
      title: "Open SSH Connection",
      category: "SSH",
      action: createSshPickerTab
    },
    {
      id: "settings.open",
      title: "Open Settings",
      category: "UI",
      action: () => setSettingsOpen(true)
    },
    {
      id: "sidebar.toggle",
      title: "Toggle Sidebar",
      category: "UI",
      action: toggleSidebar
    },
    {
      id: "tab.close",
      title: "Close Current Tab",
      category: "Tabs",
      action: () => {
        if (activeTab) void closeTab(activeTab.id);
      }
    },
    {
      id: "tab.rename",
      title: "Rename Current Tab",
      category: "Tabs",
      action: () => {
        if (!activeTab) return;
        const nextName = window.prompt("Rename tab", activeTab.title)?.trim();
        if (nextName) renameTab(activeTab.id, nextName);
      }
    },
    {
      id: "tab.recolor",
      title: "Change Tab Color",
      category: "Tabs",
      action: () => {
        if (!activeTab) return;
        const color = window.prompt("Hex color", activeTab.color)?.trim();
        if (color) setTabColor(activeTab.id, color);
      }
    },
    {
      id: "tab.next",
      title: "Next Tab",
      category: "Tabs",
      action: activateNextTab
    },
    {
      id: "tab.prev",
      title: "Previous Tab",
      category: "Tabs",
      action: activatePrevTab
    },
    {
      id: "files.refresh",
      title: "Refresh File Manager",
      category: "Files",
      action: () => {
        void loadCurrentFiles();
      }
    },
    {
      id: "files.new_file",
      title: "Create New File",
      category: "Files",
      action: async () => {
        const name = window.prompt("File name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? "C:/").replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: false });
        await loadCurrentFiles();
      }
    },
    {
      id: "files.new_folder",
      title: "Create New Folder",
      category: "Files",
      action: async () => {
        const name = window.prompt("Folder name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? "C:/").replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: true });
        await loadCurrentFiles();
      }
    },
    {
      id: "files.open_selected",
      title: "Open Selected File",
      category: "Files",
      action: () => {
        if (!selectedFile) {
          toast("No file selected");
          return;
        }
        void openFile(selectedFile.path, "edit", activeTab?.kind === "ssh" ? activeTab.sessionId : undefined);
      }
    },
    {
      id: "files.preview_selected",
      title: "Preview Selected File",
      category: "Files",
      action: () => {
        if (!selectedFile) {
          toast("No file selected");
          return;
        }
        void openFile(selectedFile.path, "preview", activeTab?.kind === "ssh" ? activeTab.sessionId : undefined);
      }
    },
    {
      id: "editor.toggle",
      title: "Toggle Editor Panel",
      category: "UI",
      action: () => setEditorVisible(!editorVisible)
    },
    {
      id: "zoom.in",
      title: "Zoom In",
      category: "UI",
      action: zoomIn
    },
    {
      id: "zoom.out",
      title: "Zoom Out",
      category: "UI",
      action: zoomOut
    },
    {
      id: "zoom.reset",
      title: "Reset Zoom",
      category: "UI",
      action: zoomReset
    }
  ];

  return (
    <div className="app-root">
      <header className="topbar">
        <button
          className="sidebar-toggle-btn"
          onClick={() => toggleSidebar()}
          title={sidebarVisible ? "Hide Sidebar (Ctrl+B)" : "Show Sidebar (Ctrl+B)"}
        >
          {sidebarVisible ? <PanelLeftClose size={15} strokeWidth={2} /> : <PanelLeft size={15} strokeWidth={2} />}
        </button>
        <div className="topbar-drag-zone" data-tauri-drag-region onMouseDown={onStartWindowDrag} />
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTab}
          onNewDefault={() => void createLocalTab(settings?.terminal.default_shell ?? "powershell")}
          onNewShell={(shell) => void createLocalTab(shell)}
          onNewSsh={createSshPickerTab}
          onRename={renameTab}
          onColor={setTabColor}
          onDuplicate={(tabId) => {
            void duplicateTab(tabId);
          }}
          onClose={(tabId) => {
            void closeTab(tabId);
          }}
        />
        <div className="topbar-spacer" data-tauri-drag-region onMouseDown={onStartWindowDrag} />
        <div className="topbar-right">
          <button className="topbar-btn" onClick={() => setPaletteOpen(true)} title="Command Palette (Ctrl+Shift+P)">
            <Command size={14} strokeWidth={2} />
          </button>
          <button className="topbar-btn" onClick={() => setSettingsOpen(true)} title="Settings (Ctrl+,)">
            <Settings size={14} strokeWidth={2} />
          </button>
          <div className="topbar-divider" />
          <button className="window-btn" onClick={onMinimize} title="Minimize">
            <Minus size={14} strokeWidth={2} />
          </button>
          <button className="window-btn" onClick={onMaximize} title="Maximize">
            <Square size={11} strokeWidth={2} />
          </button>
          <button className="window-btn window-btn-close" onClick={onCloseWindow} title="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <Sidebar hidden={!sidebarVisible} />

        <section className="center-pane" ref={centerPaneRef}>
          {!isInitialized ? <div className="loading-screen">Loading...</div> : null}

          {isInitialized && editorVisible && (editorDock === "left" || editorDock === "right") ? (
            <div className="dock-layout dock-horizontal">
              {editorDock === "left" ? (
                <div className="editor-dock-pane" style={{ width: `${editorSplitPercent}%` }}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                    onOpenActiveInWindow={openActiveEditorInWindow}
                  />
                </div>
              ) : null}

              {editorDock === "left" ? <div className="split-handle split-handle-col" onMouseDown={onSplitMouseDown} /> : null}

              <div className="terminal-dock-pane" style={{ width: `${100 - editorSplitPercent}%` }}>
                {terminalContent}
              </div>

              {editorDock === "right" ? <div className="split-handle split-handle-col" onMouseDown={onSplitMouseDown} /> : null}

              {editorDock === "right" ? (
                <div className="editor-dock-pane" style={{ width: `${editorSplitPercent}%` }}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                    onOpenActiveInWindow={openActiveEditorInWindow}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {isInitialized && editorVisible && (editorDock === "top" || editorDock === "bottom") ? (
            <div className="dock-layout dock-vertical">
              {editorDock === "top" ? (
                <div className="editor-dock-pane" style={{ height: `${editorSplitPercent}%` }}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                    onOpenActiveInWindow={openActiveEditorInWindow}
                  />
                </div>
              ) : null}

              {editorDock === "top" ? <div className="split-handle split-handle-row" onMouseDown={onSplitMouseDown} /> : null}

              <div className="terminal-dock-pane" style={{ height: `${100 - editorSplitPercent}%` }}>
                {terminalContent}
              </div>

              {editorDock === "bottom" ? <div className="split-handle split-handle-row" onMouseDown={onSplitMouseDown} /> : null}

              {editorDock === "bottom" ? (
                <div className="editor-dock-pane" style={{ height: `${editorSplitPercent}%` }}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                    onOpenActiveInWindow={openActiveEditorInWindow}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {isInitialized && !editorVisible ? (
            <div className="terminal-dock-pane terminal-full">{terminalContent}</div>
          ) : null}

          {editorVisible && dockDropTarget ? (
            <div className="dock-drop-overlay" aria-hidden="true">
              <div className={`dock-drop-target dock-left${dockDropTarget === "left" ? " active" : ""}`} />
              <div className={`dock-drop-target dock-top${dockDropTarget === "top" ? " active" : ""}`} />
              <div className={`dock-drop-target dock-right${dockDropTarget === "right" ? " active" : ""}`} />
              <div className={`dock-drop-target dock-bottom${dockDropTarget === "bottom" ? " active" : ""}`} />
            </div>
          ) : null}
        </section>
      </main>

      {/* ── Tab switcher overlay (Windows Alt+Tab style) ─────────── */}
      {tabSwitcherOpen && (() => {
        const useMru = settings?.appearance.tab_switching_mode !== "positional";
        const orderedTabs = useMru
          ? tabMruOrder
              .map((id) => tabs.find((t) => t.id === id))
              .filter((t): t is AppTab => !!t)
              .concat(tabs.filter((t) => !tabMruOrder.includes(t.id)))
          : tabs;
        return (
          <div className="tab-switcher-overlay">
            <div className="tab-switcher-panel">
              {orderedTabs.map((tab, idx) => (
                <button
                  key={tab.id}
                  className={`tab-switcher-item${idx === tabSwitcherIndex ? " selected" : ""}${tab.id === activeTabId ? " current" : ""}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setTabSwitcherOpen(false);
                    tabSwitcherOpenRef.current = false;
                    tabSwitcherPendingRef.current = false;
                  }}
                >
                  <span className="tab-switcher-dot" style={{ background: tab.color }} />
                  <span className="tab-switcher-title">{tab.title}</span>
                  <span className="tab-switcher-index">{idx + 1}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />

      {lastToast ? <div className="toast">{lastToast}</div> : null}
    </div>
  );
}
