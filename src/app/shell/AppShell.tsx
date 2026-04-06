import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Square, Copy, X, Command, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { TabStrip } from "@/app/tabs/TabStrip";
import { Sidebar } from "@/app/sidebar/Sidebar";
import { CommandPalette, type PaletteCommand } from "@/app/palette/CommandPalette";
import { SettingsPanel } from "@/app/settings/SettingsPanel";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useAppStore, type EditorDock } from "@/store/useAppStore";
import type { AppTab, SystemStats } from "@/types/models";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { SshHostPicker } from "../../features/ssh/SshHostPicker";
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
    tabDisconnectReasons,
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
    reconnectSshTab,
    markTabDisconnected,
    saveSettings,
    toast,
    activateNextTab,
    activatePrevTab,
    activateTabByIndex,
    tabMruOrder,
    editorVisible,
    editorDock,
    editorSplitPercent,
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
    tabDisconnectReasons: state.tabDisconnectReasons,
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
    reconnectSshTab: state.reconnectSshTab,
    markTabDisconnected: state.markTabDisconnected,
    saveSettings: state.saveSettings,
    toast: state.toast,
    activateNextTab: state.activateNextTab,
    activatePrevTab: state.activatePrevTab,
    activateTabByIndex: state.activateTabByIndex,
    tabMruOrder: state.tabMruOrder,
    editorVisible: state.editorVisible,
    editorDock: state.editorDock,
    editorSplitPercent: state.editorSplitPercent,
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
  // ── Window controls ─────────────────────────────────────────────────
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [isMax, setIsMax] = useState(false);
  const closeInProgressRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    appWindow.onResized(async () => {
      try {
        const maximized = await appWindow.isMaximized();
        setIsMax(maximized);
      } catch (e) {
        console.error(e);
      }
    }).then(_unlisten => {
      unlisten = _unlisten;
    }).catch(console.error);

    appWindow.isMaximized().then(setIsMax).catch(console.error);

    return () => {
      if (unlisten) unlisten();
    };
  }, [appWindow]);

  const confirmCloseWithUnsaved = useCallback(() => {
    if (!hasUnsavedEditorFiles()) return true;
    return window.confirm("You have unsaved editor files. Close the window anyway?");
  }, [hasUnsavedEditorFiles]);

  const onMinimize = async () => {
    try {
      await appWindow.minimize();
    } catch (e) {
      toast(`Minimize failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
    } catch (e) {
      toast(`Maximize failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const onCloseWindow = useCallback(async () => {
    if (closeInProgressRef.current) return;
    if (!confirmCloseWithUnsaved()) return;
    closeInProgressRef.current = true;
    try {
      await invoke("exit_app");
    } catch (e) {
      toast(`Close failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      closeInProgressRef.current = false;
    }
  }, [confirmCloseWithUnsaved, toast]);
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

  const [remoteStatus, setRemoteStatus] = useState<SystemStats | null>(null);
  const [remoteStatusFetchedAt, setRemoteStatusFetchedAt] = useState<number>(0);
  const [remoteStatusError, setRemoteStatusError] = useState<string>();
  const [clockTick, setClockTick] = useState(0);
  const [reconnectingTabs, setReconnectingTabs] = useState<Record<string, boolean>>({});
  const autoReconnectAtRef = useRef<Record<string, number>>({});

  const statusBarSettings = settings?.status_bar;
  const statusBarShowResources = statusBarSettings?.show_resource_monitor ?? true;
  const statusBarShowServerTime = statusBarSettings?.show_server_time ?? true;
  const statusBarEnabled = statusBarSettings?.enabled ?? true;
  const statusBarPollSec = Math.max(3, statusBarSettings?.resource_poll_interval_seconds ?? 8);
  const shouldMonitorRemoteStatus =
    statusBarEnabled &&
    activeTab?.kind === "ssh" &&
    !!activeTab.sessionId &&
    (statusBarShowResources || statusBarShowServerTime);

  useEffect(() => {
    if (!shouldMonitorRemoteStatus || !activeTab?.sessionId) {
      setRemoteStatus(null);
      setRemoteStatusError(undefined);
      return;
    }

    const connectionId = activeTab.sessionId;
    let disposed = false;

    const pullSnapshot = async () => {
      try {
        const payload = await invoke<SystemStats>("fetch_remote_status", {
          sessionId: connectionId,
          includeResources: statusBarShowResources,
          includeTime: statusBarShowServerTime
        });

        if (disposed) return;
        setRemoteStatus(payload);
        setRemoteStatusFetchedAt(Date.now());
        setRemoteStatusError(undefined);
      } catch (error) {
        if (disposed) return;
        const message = error instanceof Error ? error.message : String(error);
        setRemoteStatusError(message);
        if (activeTab?.kind === "ssh" && looksLikeDisconnected(message)) {
          markTabDisconnected(activeTab.id, message);
        }
      }
    };

    const unlistenPromise = listen<SystemStats>(`monitoring-${connectionId}`, (event) => {
      if (disposed) return;
      setRemoteStatus(event.payload);
      setRemoteStatusFetchedAt(Date.now());
      setRemoteStatusError(undefined);
    }).catch((error) => {
      if (!disposed) {
        const message = error instanceof Error ? error.message : String(error);
        setRemoteStatusError(message);
        if (activeTab?.kind === "ssh" && looksLikeDisconnected(message)) {
          markTabDisconnected(activeTab.id, message);
        }
      }
      return undefined;
    });

    void pullSnapshot();
    const timer = window.setInterval(() => {
      void pullSnapshot();
    }, statusBarPollSec * 1000);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      void unlistenPromise.then((unlisten) => {
        if (unlisten) {
          unlisten();
        }
      });
    };
  }, [
    activeTab?.sessionId,
    activeTab?.id,
    activeTab?.kind,
    markTabDisconnected,
    shouldMonitorRemoteStatus,
    statusBarPollSec,
    statusBarShowResources,
    statusBarShowServerTime
  ]);

  useEffect(() => {
    if (!statusBarEnabled || !statusBarShowServerTime) {
      return;
    }
    const timer = window.setInterval(() => {
      setClockTick((v) => v + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [statusBarEnabled, statusBarShowServerTime]);

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
      void loadCurrentFiles({ force: true });
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

  useHotkeys(hotkeyHandlers(), settings?.hotkeys);

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

  useEffect(() => {
    const unlistenPromise = appWindow.onCloseRequested((event) => {
      event.preventDefault();
      void onCloseWindow();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [appWindow, onCloseWindow]);

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

  const reconnectTab = useCallback(async (tabId: string, auto?: boolean) => {
    setReconnectingTabs((prev) => ({ ...prev, [tabId]: true }));
    try {
      await reconnectSshTab(tabId);
      setRemoteStatusError(undefined);
      if (!auto) {
        toast("SSH reconnected");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markTabDisconnected(tabId, message);
      if (!auto) {
        toast(`Reconnect failed: ${message}`);
      }
    } finally {
      setReconnectingTabs((prev) => {
        const next = { ...prev };
        delete next[tabId];
        return next;
      });
    }
  }, [markTabDisconnected, reconnectSshTab, toast]);

  useEffect(() => {
    if (activeTab?.kind !== "ssh") {
      return;
    }

    const reason = tabDisconnectReasons[activeTab.id];
    if (!reason || reconnectingTabs[activeTab.id]) {
      return;
    }

    const now = Date.now();
    const last = autoReconnectAtRef.current[activeTab.id] ?? 0;
    if (now - last < 5000) {
      return;
    }

    autoReconnectAtRef.current[activeTab.id] = now;
    void reconnectTab(activeTab.id, true);
  }, [activeTab?.id, activeTab?.kind, reconnectTab, reconnectingTabs, tabDisconnectReasons]);

  useEffect(() => {
    const onWake = () => {
      if (activeTab?.kind !== "ssh") {
        return;
      }
      const reason = tabDisconnectReasons[activeTab.id];
      if (reason && !reconnectingTabs[activeTab.id]) {
        void reconnectTab(activeTab.id, true);
      }
    };

    const onVisibility = () => {
      if (!document.hidden) {
        onWake();
      }
    };

    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [activeTab?.id, activeTab?.kind, reconnectTab, reconnectingTabs, tabDisconnectReasons]);

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
              disconnectedReason={tabDisconnectReasons[t.id]}
              reconnecting={!!reconnectingTabs[t.id]}
              onConnectionError={(message) => {
                if (looksLikeDisconnected(message)) {
                  markTabDisconnected(t.id, message);
                }
              }}
              onReconnect={() => {
                void reconnectTab(t.id);
              }}
            />
          ))}
    </>
  ), [
    activeTab,
    activeTabId,
    isInitialized,
    markTabDisconnected,
    reconnectTab,
    reconnectingTabs,
    settings?.terminal,
    tabDisconnectReasons,
    tabs,
  ]);

  const hasEditor = isInitialized && editorVisible;
  const isVerticalDock = editorDock === "top" || editorDock === "bottom";
  const editorFirst = editorDock === "left" || editorDock === "top";
  const editorPaneStyle = isVerticalDock
    ? { height: `${editorSplitPercent}%` }
    : { width: `${editorSplitPercent}%` };
  const terminalPaneStyle = hasEditor
    ? (isVerticalDock
        ? { height: `${100 - editorSplitPercent}%` }
        : { width: `${100 - editorSplitPercent}%` })
    : undefined;

  const remoteUsers = useMemo(
    () => (remoteStatus?.user_names ?? []).filter((name) => !!name),
    [remoteStatus?.user_names]
  );

  const localClock = useMemo(() => {
    if (!statusBarEnabled || !statusBarShowServerTime) {
      return { value: "", visible: false };
    }

    return {
      value: formatClock(new Date()),
      visible: true,
    };
  }, [clockTick, statusBarEnabled, statusBarShowServerTime]);

  const serverClock = useMemo(() => {
    if (!statusBarEnabled || !statusBarShowServerTime) {
      return { value: "", zone: "", visible: false };
    }

    if (activeTab?.kind !== "ssh") {
      return { value: "", zone: "", visible: false };
    }

    const serverEpoch = remoteStatus?.server_time_epoch;
    if (serverEpoch === null || serverEpoch === undefined || !remoteStatusFetchedAt) {
      return { value: "--", zone: "", visible: true };
    }

    const elapsedSec = Math.max(0, Math.floor((Date.now() - remoteStatusFetchedAt) / 1000));
    const liveEpoch = serverEpoch + elapsedSec;
    const date = new Date(liveEpoch * 1000);
    const tz = remoteStatus?.server_tz ?? undefined;
    return {
      value: formatClock(date, tz),
      zone: tz ?? "",
      visible: true,
    };
  }, [
    activeTab?.kind,
    clockTick,
    remoteStatus?.server_time_epoch,
    remoteStatus?.server_tz,
    remoteStatusFetchedAt,
    statusBarEnabled,
    statusBarShowServerTime,
  ]);

  const cpuLevel = classifyPercent(remoteStatus?.cpu ?? null);
  const ramLevel = classifyPercent(remoteStatus?.ram ?? null);
  const diskLevel = classifyPercent(remoteStatus?.disk ?? null);

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
        void loadCurrentFiles({ force: true });
      }
    },
    {
      id: "files.new_file",
      title: "Create New File",
      category: "Files",
      action: async () => {
        const name = window.prompt("File name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? (activeTab.kind === "ssh" ? "/" : "C:/")).replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: false });
        await loadCurrentFiles({ force: true });
      }
    },
    {
      id: "files.new_folder",
      title: "Create New Folder",
      category: "Files",
      action: async () => {
        const name = window.prompt("Folder name")?.trim();
        if (!name || !activeTab) return;
        const base = (useAppStore.getState().tabPaths[activeTab.id] ?? (activeTab.kind === "ssh" ? "/" : "C:/")).replace(/\/$/, "");
        await invoke("create_fs_entry", { path: `${base}/${name}`, isDir: true });
        await loadCurrentFiles({ force: true });
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
          <button className="window-btn" onClick={onMaximize} title={isMax ? "Restore Down" : "Maximize"}>
            {isMax ? <Copy size={11} strokeWidth={2} /> : <Square size={11} strokeWidth={2} />}
          </button>
          <button className="window-btn window-btn-close" onClick={onCloseWindow} title="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <Sidebar hidden={!sidebarVisible} />

        <section className="center-pane" ref={centerPaneRef}>
          {!isInitialized ? <div className="loading-screen">Loading...</div> : (
            <div className={`dock-layout ${isVerticalDock ? "dock-vertical" : "dock-horizontal"}`}>
              {hasEditor && editorFirst ? (
                <div className="editor-dock-pane" style={editorPaneStyle}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                  />
                </div>
              ) : null}

              {hasEditor && editorFirst ? (
                <div
                  className={`split-handle ${isVerticalDock ? "split-handle-row" : "split-handle-col"}`}
                  onMouseDown={onSplitMouseDown}
                />
              ) : null}

              <div className={`terminal-dock-pane${!hasEditor ? " terminal-full" : ""}`} style={terminalPaneStyle}>
                {terminalContent}
              </div>

              {hasEditor && !editorFirst ? (
                <div
                  className={`split-handle ${isVerticalDock ? "split-handle-row" : "split-handle-col"}`}
                  onMouseDown={onSplitMouseDown}
                />
              ) : null}

              {hasEditor && !editorFirst ? (
                <div className="editor-dock-pane" style={editorPaneStyle}>
                  <InlineEditorPanel
                    dock={editorDock}
                    onStartDockDrag={onStartEditorDockDrag}
                  />
                </div>
              ) : null}
            </div>
          )}

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

      <footer className="statusbar">
        <div className="statusbar-left">
          <span className="status-pill">{activeTab?.kind === "ssh" ? "SSH" : "LOCAL"}</span>
          <span className="status-label">{activeTab?.title ?? "No active tab"}</span>
        </div>

        <div className="statusbar-right">
          {activeTab?.kind === "ssh" && statusBarEnabled && statusBarShowResources ? (
            <span className={`status-metric status-${cpuLevel}`}>
              CPU {remoteStatus?.cpu !== null && remoteStatus?.cpu !== undefined ? `${remoteStatus.cpu.toFixed(0)}%` : "--"}
            </span>
          ) : null}

          {activeTab?.kind === "ssh" && statusBarEnabled && statusBarShowResources ? (
            <span className={`status-metric status-${ramLevel}`}>
              RAM {remoteStatus?.ram !== null && remoteStatus?.ram !== undefined ? `${remoteStatus.ram.toFixed(0)}%` : "--"}
            </span>
          ) : null}

          {activeTab?.kind === "ssh" && statusBarEnabled && statusBarShowResources ? (
            <span className={`status-metric status-${diskLevel}`}>
              Disk {remoteStatus?.disk !== null && remoteStatus?.disk !== undefined ? `${remoteStatus.disk.toFixed(0)}%` : "--"}
            </span>
          ) : null}

          {activeTab?.kind === "ssh" && statusBarEnabled && statusBarShowResources ? (
            <div className="status-users-wrap">
              <span className="status-metric status-users-trigger">
                Users {remoteStatus?.users !== null && remoteStatus?.users !== undefined ? remoteStatus.users : "--"}
              </span>
              <div className="status-users-dropdown">
                {remoteUsers.length > 0 ? (
                  remoteUsers.map((user, idx) => (
                    <div key={`${user}-${idx}`} className="status-users-item">
                      {user}
                    </div>
                  ))
                ) : (
                  <div className="status-users-item muted">No active users</div>
                )}
              </div>
            </div>
          ) : null}

          {localClock.visible ? (
            <span className="status-metric">
              Local {localClock.value}
            </span>
          ) : null}

          {serverClock.visible ? (
            <span className="status-metric">
              Server {serverClock.value}{serverClock.zone ? ` ${serverClock.zone}` : ""}
            </span>
          ) : null}

          {remoteStatusError ? <span className="status-metric status-danger">{remoteStatusError}</span> : null}
        </div>
      </footer>

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

      {!isInitialized ? (
        <div className="app-boot-overlay">
          <div className="app-boot-spinner" />
          <span>Initializing workspace...</span>
        </div>
      ) : null}
    </div>
  );
}

function formatClock(date: Date, timeZone?: string): string {
  try {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    // Fallback if timezone string is not a valid IANA name
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
}

function classifyPercent(value: number | null): "ok" | "warn" | "danger" {
  if (value === null || Number.isNaN(value)) return "ok";
  if (value >= 90) return "danger";
  if (value >= 75) return "warn";
  return "ok";
}

function looksLikeDisconnected(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("channel send") ||
    text.includes("session not found") ||
    text.includes("channel closed") ||
    text.includes("connection") ||
    text.includes("broken pipe") ||
    text.includes("timeout")
  );
}
