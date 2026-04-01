import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Square, X, Command, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { TabStrip } from "@/app/tabs/TabStrip";
import { Sidebar } from "@/app/sidebar/Sidebar";
import { CommandPalette, type PaletteCommand } from "@/app/palette/CommandPalette";
import { SettingsPanel } from "@/app/settings/SettingsPanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useAppStore } from "@/store/useAppStore";
import type { AppTab } from "@/types/models";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { SshHostPicker } from "@/features/ssh/SshHostPicker";
import { InlineEditorPanel } from "@/features/editor/InlineEditorPanel";

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
    editorSplitPercent,
    zoomLevel,
    openFile,
    setEditorVisible,
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
    editorSplitPercent: state.editorSplitPercent,
    zoomLevel: state.zoomLevel,
    openFile: state.openFile,
    setEditorVisible: state.setEditorVisible,
    setEditorSplitPercent: state.setEditorSplitPercent,
    hasUnsavedEditorFiles: state.hasUnsavedEditorFiles,
    zoomIn: state.zoomIn,
    zoomOut: state.zoomOut,
    zoomReset: state.zoomReset,
  }));

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);

  // ── Window controls ─────────────────────────────────────────────────
  const appWindow = getCurrentWindow();

  const onMinimize = () => void appWindow.minimize();
  const onMaximize = () => void appWindow.toggleMaximize();
  const onCloseWindow = () => void appWindow.close();

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
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedEditorFiles]);

  // ── Editor split drag state ─────────────────────────────────────
  const splitDragging = useRef(false);
  const centerPaneRef = useRef<HTMLElement>(null);

  const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    splitDragging.current = true;
    const onMove = (me: MouseEvent) => {
      if (!splitDragging.current || !centerPaneRef.current) return;
      const rect = centerPaneRef.current.getBoundingClientRect();
      const pct = ((me.clientY - rect.top) / rect.height) * 100;
      setEditorSplitPercent(pct);
    };
    const onUp = () => {
      splitDragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [setEditorSplitPercent]);

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
      <header className="topbar" data-tauri-drag-region>
        <button
          className="sidebar-toggle-btn"
          onClick={() => toggleSidebar()}
          title={sidebarVisible ? "Hide Sidebar (Ctrl+B)" : "Show Sidebar (Ctrl+B)"}
        >
          {sidebarVisible ? <PanelLeftClose size={15} strokeWidth={2} /> : <PanelLeft size={15} strokeWidth={2} />}
        </button>
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
        <div className="topbar-spacer" data-tauri-drag-region />
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

          {isInitialized && editorVisible ? (
            <div
              className="editor-split-top"
              style={{ height: `${editorSplitPercent}%` }}
            >
              <InlineEditorPanel />
            </div>
          ) : null}

          {isInitialized && editorVisible ? (
            <div className="split-handle" onMouseDown={onSplitMouseDown} />
          ) : null}

          <div className={`terminal-split-bottom${editorVisible ? "" : " terminal-full"}`}
            style={editorVisible ? { height: `${100 - editorSplitPercent}%` } : undefined}
          >
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
                  />
                ))}
          </div>
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
