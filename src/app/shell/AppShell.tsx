import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Command, Settings, PanelLeftClose, PanelLeft } from "lucide-react";
import { TabStrip } from "@/app/tabs/TabStrip";
import { Sidebar } from "@/app/sidebar/Sidebar";
import { CommandPalette } from "@/app/palette/CommandPalette";
import { SettingsPanel, type SettingsSection } from "@/app/settings/SettingsPanel";
import { buildAppCommands } from "@/app/shell/appCommands";
import { BootOverlay } from "@/app/shell/BootOverlay";
import { DockDropOverlay } from "@/app/shell/DockDropOverlay";
import { StatusBar } from "@/app/shell/StatusBar";
import { TabSwitcherOverlay } from "@/app/shell/TabSwitcherOverlay";
import { Toast } from "@/app/shell/Toast";
import { WindowControls } from "@/app/shell/WindowControls";
import { looksLikeDisconnected } from "@/app/shell/shellUtils";
import { useHotkeys } from "@/hooks/useHotkeys";
import {
  appShortcutTitle,
  coerceShellProfile,
  isMacLike,
  platformClassName,
} from "@/platform/platform";
import { useAppStore, type EditorDock } from "@/store/useAppStore";
import type { SystemStats } from "@/types/models";
import { TerminalPane } from "@/features/terminal/TerminalPane";
import { SshHostPicker } from "../../features/ssh/SshHostPicker";
import { InlineEditorPanel } from "@/features/editor/InlineEditorPanel";
import { UpdateBanner } from "@/features/update/UpdateBanner";

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
    managedHosts,
    importedHosts,
    tabDisconnectReasons,
    selectedFile,
    lastToast,
    createLocalTab,
    createSshPickerTab,
    connectSshTab,
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
    managedHosts: state.managedHosts,
    importedHosts: state.importedHosts,
    tabDisconnectReasons: state.tabDisconnectReasons,
    selectedFile: state.selectedFile,
    lastToast: state.lastToast,
    createLocalTab: state.createLocalTab,
    createSshPickerTab: state.createSshPickerTab,
    connectSshTab: state.connectSshTab,
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

  const connectHostFromPalette = useCallback((alias: string) => {
    const existing = tabs.find((tab) => tab.kind === "ssh" && tab.sshAlias === alias);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    const pickerTabId = createSshPickerTab();
    void connectSshTab(pickerTabId, alias);
  }, [connectSshTab, createSshPickerTab, setActiveTab, tabs]);

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

  // ── Settings navigation state ──────────────────────────────────────
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection | undefined>();
  const [settingsHighlight, setSettingsHighlight] = useState<string | undefined>();

  const openSettingsAt = useCallback((section: SettingsSection, highlight?: string) => {
    setSettingsInitialSection(section);
    setSettingsHighlight(highlight);
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  const setTerminalTextSize = useCallback((size: number) => {
    if (!settings) return;
    const fontSize = Math.max(8, Math.min(40, Math.round(size)));
    void saveSettings({
      ...settings,
      terminal: {
        ...settings.terminal,
        font_size: fontSize,
      },
    });
  }, [saveSettings, settings]);

  const terminalTextIn = useCallback(() => {
    setTerminalTextSize((settings?.terminal.font_size ?? 13) + 1);
  }, [setTerminalTextSize, settings?.terminal.font_size]);

  const terminalTextOut = useCallback(() => {
    setTerminalTextSize((settings?.terminal.font_size ?? 13) - 1);
  }, [setTerminalTextSize, settings?.terminal.font_size]);

  const terminalTextReset = useCallback(() => {
    setTerminalTextSize(13);
  }, [setTerminalTextSize]);

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

  // macOS WebView can autocapitalize values like "root" in plain inputs.
  useEffect(() => {
    type TextAssistElement = {
      tagName?: string;
      spellcheck?: boolean;
      setAttribute: (name: string, value: string) => void;
      querySelectorAll?: (selector: string) => { forEach: (cb: (element: TextAssistElement) => void) => void };
    };

    const disableTextAssist = (element: TextAssistElement) => {
      const tag = element.tagName?.toLowerCase();
      if (tag !== "input" && tag !== "textarea") return;
      if ("spellcheck" in element) element.spellcheck = false;
      element.setAttribute("autocomplete", "off");
      element.setAttribute("autocapitalize", "off");
      element.setAttribute("autocorrect", "off");
    };

    document.querySelectorAll("input, textarea").forEach(disableTextAssist);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const element = node as unknown as TextAssistElement;
          disableTextAssist(element);
          element.querySelectorAll?.("input, textarea").forEach(disableTextAssist);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
      void createLocalTab(coerceShellProfile(settings?.terminal.default_shell));
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
    onTerminalTextIn: () => terminalTextIn(),
    onTerminalTextOut: () => terminalTextOut(),
    onTerminalTextReset: () => terminalTextReset(),
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
    zoomIn, zoomOut, zoomReset, terminalTextIn, terminalTextOut, terminalTextReset, editorVisible, setEditorVisible
  ]);

  useHotkeys(hotkeyHandlers(), settings?.hotkeys);

  // ── Zoom: apply CSS zoom level ──────────────────────────────────
  useEffect(() => {
    document.documentElement.style.zoom = `${zoomLevel}%`;
  }, [zoomLevel]);

  // ── Zoom: platform-modifier + mouse wheel ───────────────────────
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if ((isMacLike && e.metaKey) || (!isMacLike && e.ctrlKey)) {
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
              shellProfile={t.shellProfile}
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

  const commands = buildAppCommands({
    activeTab,
    editorVisible,
    importedHosts,
    managedHosts,
    selectedFile,
    settings,
    tabs,
    activateNextTab,
    activatePrevTab,
    closeTab,
    connectHostFromPalette,
    createLocalTab,
    createSshPickerTab,
    loadCurrentFiles,
    openFile,
    openSettingsAt,
    renameTab,
    setActiveTab,
    setEditorVisible,
    setSettingsOpen,
    setTabColor,
    toast,
    toggleSidebar,
    terminalTextIn,
    terminalTextOut,
    terminalTextReset,
    zoomIn,
    zoomOut,
    zoomReset,
  });

  const windowControls = (
    <WindowControls
      isMaximized={isMax}
      onMinimize={onMinimize}
      onMaximize={onMaximize}
      onClose={onCloseWindow}
    />
  );

  return (
    <div className={`app-root ${platformClassName}`}>
      <header className="topbar">
        <button
          className="sidebar-toggle-btn"
          onClick={() => toggleSidebar()}
          title={sidebarVisible ? appShortcutTitle("Hide Sidebar", "Ctrl+B") : appShortcutTitle("Show Sidebar", "Ctrl+B")}
        >
          {sidebarVisible ? <PanelLeftClose size={15} strokeWidth={2} /> : <PanelLeft size={15} strokeWidth={2} />}
        </button>
        <div className="topbar-drag-zone" data-tauri-drag-region onMouseDown={onStartWindowDrag} />
        <TabStrip
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTab}
          onNewDefault={() => void createLocalTab(coerceShellProfile(settings?.terminal.default_shell))}
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
          <button className="topbar-btn" onClick={() => setPaletteOpen(true)} title={appShortcutTitle("Command Palette", "Ctrl+Shift+P")}>
            <Command size={14} strokeWidth={2} />
          </button>
          <button className="topbar-btn" onClick={() => setSettingsOpen(true)} title={appShortcutTitle("Settings", "Ctrl+,")}>
            <Settings size={14} strokeWidth={2} />
          </button>
          {!isMacLike ? <div className="topbar-divider" /> : null}
          {!isMacLike ? windowControls : null}
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
            <DockDropOverlay target={dockDropTarget} />
          ) : null}
        </section>
      </main>

      <StatusBar
        activeTab={activeTab}
        remoteStatus={remoteStatus}
        remoteStatusError={remoteStatusError}
        remoteStatusFetchedAt={remoteStatusFetchedAt}
        statusBarEnabled={statusBarEnabled}
        showResources={statusBarShowResources}
        showServerTime={statusBarShowServerTime}
        clockTick={clockTick}
      />

      <TabSwitcherOverlay
        open={tabSwitcherOpen}
        tabs={tabs}
        activeTabId={activeTabId}
        selectedIndex={tabSwitcherIndex}
        tabMruOrder={tabMruOrder}
        useMru={settings?.appearance.tab_switching_mode !== "positional"}
        onSelect={(tabId) => {
          setActiveTab(tabId);
          setTabSwitcherOpen(false);
          tabSwitcherOpenRef.current = false;
          tabSwitcherPendingRef.current = false;
        }}
      />

      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onClose={() => { setSettingsOpen(false); setSettingsInitialSection(undefined); setSettingsHighlight(undefined); }}
        onSave={saveSettings}
        initialSection={settingsInitialSection}
        highlightSetting={settingsHighlight}
      />

      {lastToast ? (
        <Toast
          message={lastToast}
          onDismiss={() => useAppStore.setState({ lastToast: undefined })}
        />
      ) : null}

      <UpdateBanner />

      {!isInitialized ? <BootOverlay /> : null}
    </div>
  );
}
