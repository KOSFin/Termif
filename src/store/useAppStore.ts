import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { Window, getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";
import {
  isEditorPopoutLive,
  requestOpenFileInEditorWindow
} from "@/features/file_manager/editorWindow";
import { FORCE_CLOSE_WINDOW_EVENT, MAIN_WINDOW_LABEL, REVEAL_IN_FILE_MANAGER_EVENT, UI_STATE_SYNC_EVENT, makeTerminalWindowLabel, openTerminalWorkspaceWindow } from "@/app/windows/windowing";
import type {
  AppSettings,
  AppTab,
  FileEntryDto,
  PersistedUiState,
  PersistedWindowState,
  SessionDto,
  SshConnectOptions,
  SshHostEntry,
  SshHostGroup,
  SshHostsPayload,
  WindowTabsSnapshot,
} from "@/types/models";
import type { WindowPlacement } from "@/app/windows/windowing";
import { detectLanguage } from "@/features/editor/languageMap";
import {
  coerceShellProfile,
  getDefaultLocalPath,
  getDefaultShellProfile,
  getDefaultTerminalFont,
  isMacLike,
} from "@/platform/platform";
import {
  buildDirCacheKey,
  ensurePathHistorySeed,
  getRelativeHistoryTarget,
  isConnectionError,
  makeTabFromSession,
  normalizeDisplayPath,
  normalizeLineEndings,
  pushPathHistory,
  reorderScopedTabIds,
} from "@/store/appStoreUtils";
import { applyAppearanceOverrides, applyAppearanceTheme, watchSystemTheme } from "@/theme/themeEngine";
import { clearTerminalLog } from "@/features/terminal/terminalLogStore";

export interface EditorFile {
  id: string;
  path: string;
  mode: "preview" | "edit";
  content: string;
  originalContent: string;
  dirty: boolean;
  sessionId?: string;
  error?: string;
  languageId: string;
  languageName: string;
  encoding: string;
  loading?: boolean;
  diskMtime?: number;
  externallyModified?: boolean;
}

export type EditorDock = "left" | "right" | "top" | "bottom";

interface AppState {
  isInitialized: boolean;
  tabs: AppTab[];
  activeTabId?: string;
  windowTabs: Record<string, string[]>;
  activeTabByWindow: Record<string, string | null>;
  windowStates: Record<string, PersistedWindowState>;
  sidebarVisible: boolean;
  sidebarWidth: number;
  paletteOpen: boolean;
  settingsOpen: boolean;
  selectedSidebarTool: "files" | "snippets" | "clipboard";
  settings: AppSettings | null;
  sshGroups: SshHostGroup[];
  importedHosts: SshHostEntry[];
  managedHosts: SshHostEntry[];
  tabDisconnectReasons: Record<string, string>;
  tabPaths: Record<string, string>;
  fileEntries: FileEntryDto[];
  fileLoading: boolean;
  fileTransitioning: boolean;
  fileDisplayTabId?: string;
  fileDisplayPath?: string;
  fileError?: string;
  selectedFile?: FileEntryDto;
  pendingSelectedFilePath?: string;
  pendingSelectedFileTabId?: string;
  lastToast?: string;
  toastId: number;
  dirCache: Record<string, FileEntryDto[]>;
  tabMruOrder: string[];
  fileHistory: Record<string, string[]>;
  fileHistoryIndex: Record<string, number>;

  // Editor state
  editorFiles: EditorFile[];
  activeEditorFileId?: string;
  editorVisible: boolean;
  editorDock: EditorDock;
  editorSplitPercent: number;

  // Zoom
  zoomLevel: number;

  initialize: () => Promise<void>;
  createLocalTab: (shellProfile?: string, cwd?: string) => Promise<string>;
  createSshPickerTab: () => string;
  getWindowTabs: (windowLabel?: string) => AppTab[];
  getActiveTabIdForWindow: (windowLabel?: string) => string | undefined;
  ensureWindowState: (windowLabel?: string) => void;
  syncWindowStateFromBackend: (windowLabel?: string) => Promise<void>;
  attachExistingSessionTab: (session: SessionDto, options?: { tabId?: string; title?: string; color?: string; icon?: string; windowLabel?: string }) => void;
  moveTabToWindow: (
    tabId: string,
    targetWindowLabel: string,
    options?: {
      activate?: boolean;
      sourceWindowLabel?: string;
      targetTabId?: string;
      side?: "before" | "after";
    }
  ) => Promise<void>;
  detachTabToNewWindow: (tabId: string, sourceWindowLabel?: string, placement?: WindowPlacement) => Promise<void>;
  moveTabToMainWindow: (tabId: string, sourceWindowLabel?: string) => Promise<void>;
  moveAllTabsToWindow: (sourceWindowLabel: string, targetWindowLabel: string) => Promise<void>;
  closeWindowTabs: (windowLabel?: string) => Promise<void>;
  closeEmptyDetachedWindow: (windowLabel?: string) => Promise<void>;
  closeDetachedWindow: (windowLabel?: string) => Promise<void>;
  connectSshTab: (tabId: string, alias: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  duplicateTab: (tabId: string) => Promise<void>;
  renameTab: (tabId: string, name: string) => void;
  setTabColor: (tabId: string, color: string) => void;
  reorderTabs: (fromTabId: string, toTabId: string, side?: "before" | "after", windowLabel?: string) => void;
  setActiveTab: (tabId: string, windowLabel?: string) => void;
  activateNextTab: () => void;
  activatePrevTab: () => void;
  activateTabByIndex: (index: number) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  setSelectedSidebarTool: (tool: "files" | "snippets" | "clipboard") => void;
  updateWindowState: (windowLabel: string, windowState: PersistedWindowState | null) => Promise<void>;
  refreshHosts: () => Promise<void>;
  connectSshTabWithOptions: (
    tabId: string,
    options: SshConnectOptions,
    saveAsManaged: boolean,
    groupId?: string | null
  ) => Promise<void>;
  reconnectSshTab: (tabId: string) => Promise<void>;
  markTabDisconnected: (tabId: string, reason: string) => void;
  clearTabDisconnected: (tabId: string) => void;
  saveManagedHost: (host: SshHostEntry) => Promise<void>;
  deleteManagedHost: (hostId: string) => Promise<void>;
  createHostGroup: (name: string) => Promise<void>;
  renameHostGroup: (groupId: string, name: string) => Promise<void>;
  deleteHostGroup: (
    groupId: string,
    options?: { hostsAction?: "ungroup" | "move" | "cascade"; targetGroupId?: string | null }
  ) => Promise<void>;
  loadCurrentFiles: (options?: { force?: boolean }) => Promise<void>;
  loadCurrentFilesFromCache: () => void;
  navigatePath: (path: string, options?: { preserveForward?: boolean; skipHistory?: boolean }) => Promise<void>;
  goParentPath: () => Promise<void>;
  goBackPath: () => Promise<void>;
  goForwardPath: () => Promise<void>;
  canGoBackPath: () => boolean;
  canGoForwardPath: () => boolean;
  setSelectedFile: (file?: FileEntryDto) => void;
  revealFileInManager: (path: string, sessionId?: string, options?: { allowCrossWindow?: boolean }) => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  toast: (message: string) => void;

  // Editor actions
  openFile: (path: string, mode: "preview" | "edit", sessionId?: string) => Promise<void>;
  closeEditorFile: (fileId: string) => boolean;
  setActiveEditorFile: (fileId: string) => void;
  updateEditorContent: (fileId: string, content: string) => void;
  saveEditorFile: (fileId: string) => Promise<void>;
  setEditorVisible: (visible: boolean) => void;
  setEditorDock: (dock: EditorDock) => void;
  setEditorSplitPercent: (pct: number) => void;
  setEditorLanguage: (fileId: string, langId: string, langName: string) => void;
  clearEditorWorkspace: () => void;
  hasUnsavedEditorFiles: () => boolean;
  checkEditorFilesChanged: () => Promise<void>;

  // Zoom actions
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

let fileLoadRequestSeq = 0;
let fileLoadDebounceTimer: number | undefined;
const FILE_LOAD_DEBOUNCE_MS = 40;
const FILE_CACHE_FRESH_MS = 60_000;
const dirCacheFreshAt: Record<string, number> = {};
const currentWindow = getCurrentWindow();

type SidebarTool = AppState["selectedSidebarTool"];

const SIDEBAR_MIN_WIDTH = 196;
const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MAX_WIDTH = 520;
const EMPTY_PERSISTED_UI_STATE: PersistedUiState = {
  tabs: [],
  active_tab_id: null,
  sidebar_visible: true,
  selected_sidebar_tool: "files",
  sidebar_width: SIDEBAR_DEFAULT_WIDTH,
  file_history: {},
  file_history_index: {},
  window_tabs: {},
  active_tab_by_window: {},
  window_states: {},
};

function coerceSidebarTool(value?: string | null): SidebarTool {
  if (value === "files" || value === "snippets" || value === "clipboard") return value;
  return "files";
}

function clampSidebarWidth(width?: number | null) {
  if (typeof width !== "number" || !Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, Math.round(width)));
}

function fileDirname(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  if (idx <= 0) return normalized;
  return normalized.slice(0, idx);
}

function sanitizeWindowTabs(tabs: AppTab[], windowTabs: Record<string, string[]>) {
  const validIds = new Set(tabs.map((tab) => tab.id));
  const cleaned = Object.fromEntries(
    Object.entries(windowTabs)
      .map(([label, ids]) => [label, ids.filter((id) => validIds.has(id))] as const)
      .filter(([label, ids]) => ids.length > 0 || label === MAIN_WINDOW_LABEL)
  );

  const hasAnyAssignedTabs = Object.values(cleaned).some((ids) => ids.length > 0);
  if (!hasAnyAssignedTabs) {
    cleaned[MAIN_WINDOW_LABEL] = tabs.map((tab) => tab.id);
  } else if (!cleaned[MAIN_WINDOW_LABEL]) {
    cleaned[MAIN_WINDOW_LABEL] = [];
  }

  return cleaned;
}

function sanitizeActiveTabs(windowTabs: Record<string, string[]>, activeByWindow: Record<string, string | null>) {
  const cleaned: Record<string, string | null> = {};
  for (const [label, ids] of Object.entries(windowTabs)) {
    const current = activeByWindow[label];
    cleaned[label] = current && ids.includes(current) ? current : (ids[0] ?? null);
  }
  return cleaned;
}

function isDetachedTerminalRoute() {
  return typeof window !== "undefined" && window.location.hash.startsWith("#/terminal-window");
}

function resolveWindowLabel(windowLabel?: string) {
  if (windowLabel) return windowLabel;
  if (!isDetachedTerminalRoute()) return MAIN_WINDOW_LABEL;
  return currentWindow.label ?? MAIN_WINDOW_LABEL;
}

export function getWindowTabIds(state: Pick<AppState, "tabs" | "windowTabs">, windowLabel?: string) {
  const label = resolveWindowLabel(windowLabel);
  const ids = state.windowTabs[label];
  if (ids) return ids;
  return label === MAIN_WINDOW_LABEL ? state.tabs.map((tab) => tab.id) : [];
}

function getWindowTabsSnapshot(state: Pick<AppState, "tabs" | "windowTabs" | "activeTabByWindow">, windowLabel?: string): WindowTabsSnapshot {
  const label = resolveWindowLabel(windowLabel);
  const tabIds = getWindowTabIds(state, label);
  const tabs = tabIds.filter((id) => state.tabs.some((tab) => tab.id === id));
  const activeTabId = state.activeTabByWindow[label] ?? tabs[0] ?? null;
  return { tabs, activeTabId };
}

function findWindowLabelForTab(state: Pick<AppState, "windowTabs">, tabId: string) {
  for (const [label, ids] of Object.entries(state.windowTabs)) {
    if (ids.includes(tabId)) return label;
  }
  return undefined;
}

function applyPersistedWindowState(
  tabs: AppTab[],
  persistedWindowTabs?: Record<string, string[]> | null,
  persistedActiveByWindow?: Record<string, string | null> | null
) {
  const windowTabs = sanitizeWindowTabs(tabs, persistedWindowTabs ?? {});
  const activeTabByWindow = sanitizeActiveTabs(windowTabs, persistedActiveByWindow ?? {});
  return { windowTabs, activeTabByWindow };
}

function sanitizeWindowStates(
  windowTabs: Record<string, string[]>,
  persistedWindowStates?: Record<string, PersistedWindowState> | null
) {
  const cleaned: Record<string, PersistedWindowState> = {};
  for (const label of Object.keys(windowTabs)) {
    if (persistedWindowStates?.[label]) {
      cleaned[label] = persistedWindowStates[label];
    }
  }
  return cleaned;
}

async function restoreWindowGeometry(windowLabel: string, state?: PersistedWindowState | null) {
  if (!state) return;
  const targetWindow = await Window.getByLabel(windowLabel).catch(() => null);
  if (!targetWindow) return;

  if (typeof state.width === "number" && typeof state.height === "number" && !state.maximized) {
    await targetWindow
      .setSize(new PhysicalSize(Math.max(760, state.width), Math.max(560, state.height)))
      .catch(() => undefined);
  }

  if (typeof state.x === "number" && typeof state.y === "number" && !state.maximized) {
    await targetWindow
      .setPosition(new PhysicalPosition(state.x, state.y))
      .catch(() => undefined);
  }

  if (state.maximized) {
    await targetWindow.maximize().catch(() => undefined);
  }
}

async function snapshotCurrentWindowState(windowLabel?: string): Promise<Record<string, PersistedWindowState>> {
  const label = resolveWindowLabel(windowLabel);
  const windowRef = await Window.getByLabel(label).catch(() => null);
  if (!windowRef) return {};

  const [position, size, maximized] = await Promise.all([
    windowRef.outerPosition().catch(() => null),
    windowRef.outerSize().catch(() => null),
    windowRef.isMaximized().catch(() => false),
  ]);

  return {
    [label]: {
      x: position?.x ?? null,
      y: position?.y ?? null,
      width: size?.width ?? null,
      height: size?.height ?? null,
      maximized: maximized ?? false,
    },
  };
}

async function persistUiStateWithWindowSnapshot(
  state: Pick<AppState, "tabs" | "sidebarVisible" | "selectedSidebarTool" | "sidebarWidth" | "fileHistory" | "fileHistoryIndex" | "windowTabs" | "activeTabByWindow">,
  windowLabel?: string
) {
  const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
  const currentWindowStates = sanitizeWindowStates(state.windowTabs, persisted?.window_states ?? {});
  Object.assign(currentWindowStates, await snapshotCurrentWindowState(windowLabel));
  return persistUiState(state, currentWindowStates);
}

async function restoreDetachedTabFromPersisted(savedTab: PersistedUiState["tabs"][number]): Promise<{
  tab?: AppTab;
  disconnectReason?: string;
}> {
  if (savedTab.kind === "ssh_picker") {
    return {
      tab: {
        id: savedTab.id,
        title: savedTab.title,
        color: savedTab.color,
        icon: savedTab.icon,
        kind: "ssh_picker",
      },
    };
  }

  if (savedTab.session_id) {
    try {
      const session = await invoke<SessionDto>("get_terminal_session", { sessionId: savedTab.session_id });
      return {
        tab: {
          ...makeTabFromSession(session),
          id: savedTab.id,
          title: savedTab.title,
          color: savedTab.color,
          icon: savedTab.icon,
        },
      };
    } catch {
      // Fall through to disconnected placeholder when possible.
    }
  }

  if (savedTab.kind === "ssh" && savedTab.ssh_alias) {
    return {
      tab: {
        id: savedTab.id,
        title: savedTab.title,
        color: savedTab.color,
        icon: "globe",
        kind: "ssh",
        sshAlias: savedTab.ssh_alias,
      },
      disconnectReason: "The detached window could not reattach to the terminal session.",
    };
  }

  return {};
}

async function broadcastUiState(
  state: Pick<AppState, "tabs" | "sidebarVisible" | "selectedSidebarTool" | "sidebarWidth" | "fileHistory" | "fileHistoryIndex" | "windowTabs" | "activeTabByWindow">,
  windowStates?: Record<string, PersistedWindowState>
) {
  const payload = {
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      color: tab.color,
      icon: tab.icon,
      kind: tab.kind,
      session_id: tab.sessionId ?? null,
      ssh_alias: tab.sshAlias ?? null
    })),
    active_tab_id: state.activeTabByWindow[MAIN_WINDOW_LABEL] ?? null,
    sidebar_visible: state.sidebarVisible,
    selected_sidebar_tool: state.selectedSidebarTool,
    sidebar_width: state.sidebarWidth,
    file_history: state.fileHistory,
    file_history_index: state.fileHistoryIndex,
    window_tabs: state.windowTabs,
    active_tab_by_window: state.activeTabByWindow,
    window_states: windowStates ?? {},
  } satisfies PersistedUiState;

  await emit(UI_STATE_SYNC_EVENT, {
    uiState: payload,
    sourceWindow: resolveWindowLabel(),
  }).catch(() => undefined);
}

async function persistUiState(
  state: Pick<AppState, "tabs" | "sidebarVisible" | "selectedSidebarTool" | "sidebarWidth" | "fileHistory" | "fileHistoryIndex" | "windowTabs" | "activeTabByWindow">,
  windowStates?: Record<string, PersistedWindowState>
): Promise<void> {
  const cleanedWindowTabs = sanitizeWindowTabs(state.tabs, state.windowTabs);
  const cleanedActive = sanitizeActiveTabs(cleanedWindowTabs, state.activeTabByWindow);
  const payload: PersistedUiState = {
    tabs: state.tabs.map((tab) => ({
      id: tab.id,
      title: tab.title,
      color: tab.color,
      icon: tab.icon,
      kind: tab.kind,
      session_id: tab.sessionId ?? null,
      ssh_alias: tab.sshAlias ?? null
    })),
    active_tab_id: cleanedActive[MAIN_WINDOW_LABEL] ?? null,
    sidebar_visible: state.sidebarVisible,
    selected_sidebar_tool: state.selectedSidebarTool,
    sidebar_width: state.sidebarWidth,
    file_history: state.fileHistory,
    file_history_index: state.fileHistoryIndex,
    window_tabs: cleanedWindowTabs,
    active_tab_by_window: cleanedActive,
    window_states: sanitizeWindowStates(cleanedWindowTabs, windowStates),
  };
  await invoke("save_ui_state", { uiState: payload });
  await broadcastUiState({
    ...state,
    windowTabs: cleanedWindowTabs,
    activeTabByWindow: cleanedActive,
  }, payload.window_states ?? {});
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  tabs: [],
  activeTabId: undefined,
  windowTabs: {},
  activeTabByWindow: {},
  windowStates: {},
  sidebarVisible: true,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  paletteOpen: false,
  settingsOpen: false,
  selectedSidebarTool: "files",
  settings: null,
  sshGroups: [],
  importedHosts: [],
  managedHosts: [],
  tabDisconnectReasons: {},
  tabPaths: {},
  fileEntries: [],
  fileLoading: false,
  fileTransitioning: false,
  fileDisplayTabId: undefined,
  fileDisplayPath: undefined,
  fileError: undefined,
  selectedFile: undefined,
  pendingSelectedFilePath: undefined,
  pendingSelectedFileTabId: undefined,
  lastToast: undefined,
  toastId: 0,
  dirCache: {},
  tabMruOrder: [],
  fileHistory: {},
  fileHistoryIndex: {},

  // Editor state
  editorFiles: [],
  activeEditorFileId: undefined,
  editorVisible: false,
  editorDock: "right",
  editorSplitPercent: 50,

  // Zoom
  zoomLevel: 100,

  initialize: async () => {
    if (get().isInitialized) return;
    const windowLabel = resolveWindowLabel();

    const [settings, persisted, hosts] = await Promise.all([
      invoke<AppSettings>("load_settings").catch(() => null),
      invoke<PersistedUiState>("load_ui_state").catch(() => EMPTY_PERSISTED_UI_STATE),
      invoke<SshHostsPayload>("load_ssh_hosts")
    ]);

    const platformSettings = settings
      ? {
          ...settings,
          terminal: {
            ...settings.terminal,
            default_shell: coerceShellProfile(settings.terminal.default_shell),
            font_family:
              isMacLike && (
                settings.terminal.font_family.trim() === "Cascadia Code" ||
                settings.terminal.font_family.trim() === "SF Mono, Menlo, Monaco, Consolas, Liberation Mono, monospace"
              )
                ? getDefaultTerminalFont()
                : settings.terminal.font_family,
            color_scheme: settings.terminal.color_scheme ?? (isMacLike ? "macos_dark" : "one_dark"),
          },
        }
      : settings;

    set({
      settings: platformSettings,
      importedHosts: hosts.imported,
      managedHosts: hosts.managed,
      sshGroups: hosts.groups,
      sidebarVisible: persisted.sidebar_visible ?? true,
      sidebarWidth: clampSidebarWidth(persisted.sidebar_width),
      selectedSidebarTool: coerceSidebarTool(persisted.selected_sidebar_tool),
      fileHistory: persisted.file_history ?? {},
      fileHistoryIndex: persisted.file_history_index ?? {},
      windowStates: sanitizeWindowStates(persisted.window_tabs ?? { [MAIN_WINDOW_LABEL]: [] }, persisted.window_states ?? {}),
      ...applyPersistedWindowState([], persisted.window_tabs, persisted.active_tab_by_window),
    });

    // Apply persisted theme on startup
    applyAppearanceTheme(platformSettings?.appearance);
    watchSystemTheme(platformSettings?.appearance);
    applyAppearanceOverrides(platformSettings?.appearance);

    const restoredTabs: AppTab[] = [];
    const restoredDisconnectReasons: Record<string, string> = {};
    if (windowLabel === MAIN_WINDOW_LABEL) {
      for (const savedTab of persisted.tabs) {
        if (savedTab.kind === "local") {
          try {
            const session = await invoke<SessionDto>("create_local_session", {
              shellProfile: coerceShellProfile(platformSettings?.terminal.default_shell),
              cwd: null
            });
            restoredTabs.push({
              ...makeTabFromSession(session),
              id: savedTab.id,
              title: savedTab.title,
              color: savedTab.color,
              icon: savedTab.icon
            });
          } catch {
            // Skip
          }
        } else if (savedTab.kind === "ssh" && savedTab.ssh_alias) {
          restoredTabs.push({
            id: savedTab.id,
            title: savedTab.title,
            color: savedTab.color,
            icon: "globe",
            kind: "ssh",
            sshAlias: savedTab.ssh_alias
          });
          restoredDisconnectReasons[savedTab.id] = "The app was restarted and the SSH channel is no longer attached.";
        } else {
          restoredTabs.push({
            id: savedTab.id,
            title: savedTab.title,
            color: savedTab.color,
            icon: savedTab.icon,
            kind: "ssh_picker"
          });
        }
      }
    } else {
      const detachedIds = (persisted.window_tabs as Record<string, string[]> | null | undefined)?.[windowLabel] ?? [];
      if (detachedIds.length === 0) {
        set({ isInitialized: true });
        await restoreWindowGeometry(windowLabel, persisted.window_states?.[windowLabel]);
        return;
      }
      for (const tabId of detachedIds) {
        const savedTab = persisted.tabs.find((tab) => tab.id === tabId);
        if (!savedTab) continue;
        const restored = await restoreDetachedTabFromPersisted(savedTab);
        if (restored.tab) restoredTabs.push(restored.tab);
        if (restored.disconnectReason) {
          restoredDisconnectReasons[savedTab.id] = restored.disconnectReason;
        }
      }
    }

    if (restoredTabs.length === 0) {
      if (windowLabel === MAIN_WINDOW_LABEL) {
        await get().createLocalTab(coerceShellProfile(platformSettings?.terminal.default_shell));
      } else {
        set({ isInitialized: true });
      }
    } else {
      const persistedWindowState = applyPersistedWindowState(
        restoredTabs,
        persisted.window_tabs,
        persisted.active_tab_by_window
      );
      const activeTabId =
        persistedWindowState.activeTabByWindow[windowLabel] ??
        persistedWindowState.activeTabByWindow[MAIN_WINDOW_LABEL] ??
        restoredTabs[0].id;
      set({
        tabs: restoredTabs,
        activeTabId: activeTabId ?? undefined,
        windowTabs: persistedWindowState.windowTabs,
        activeTabByWindow: persistedWindowState.activeTabByWindow,
        windowStates: sanitizeWindowStates(persistedWindowState.windowTabs, persisted.window_states ?? {}),
        tabDisconnectReasons: restoredDisconnectReasons,
        fileTransitioning: true,
        selectedFile: undefined,
        isInitialized: true
      });
      if (windowLabel !== MAIN_WINDOW_LABEL) {
        await restoreWindowGeometry(windowLabel, persisted.window_states?.[windowLabel]);
      }
      if (activeTabId) {
        get().loadCurrentFiles().catch(() => {});
      }
    }

    set({ isInitialized: true });
  },

  createLocalTab: async (shellProfile, cwd) => {
    const session = await invoke<SessionDto>("create_local_session", {
      shellProfile: coerceShellProfile(shellProfile),
      cwd: cwd ?? null
    });
    const tab = makeTabFromSession(session);
    const windowLabel = resolveWindowLabel();
    set((state) => {
      const currentWindowTabs = getWindowTabIds(state, windowLabel).filter((id) => id !== tab.id);
      const windowTabs = {
        ...state.windowTabs,
        [windowLabel]: [...currentWindowTabs, tab.id],
      };
      const activeTabByWindow = {
        ...state.activeTabByWindow,
        [windowLabel]: tab.id,
      };
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        windowTabs,
        activeTabByWindow,
        fileTransitioning: true,
        selectedFile: undefined,
        selectedSidebarTool: "files",
        tabMruOrder: [tab.id, ...state.tabMruOrder.filter((id) => id !== tab.id)]
      };
    });
    await persistUiStateWithWindowSnapshot(get());
    get().loadCurrentFiles().catch(() => {});
    return tab.id;
  },

  createSshPickerTab: () => {
    const windowLabel = resolveWindowLabel();
    const tab: AppTab = {
      id: crypto.randomUUID(),
      title: "SSH",
      color: "#3dba84",
      icon: "globe",
      kind: "ssh_picker"
    };
    set((state) => {
      const currentWindowTabs = getWindowTabIds(state, windowLabel).filter((id) => id !== tab.id);
      const windowTabs = {
        ...state.windowTabs,
        [windowLabel]: [...currentWindowTabs, tab.id],
      };
      const activeTabByWindow = {
        ...state.activeTabByWindow,
        [windowLabel]: tab.id,
      };
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
        windowTabs,
        activeTabByWindow,
        fileEntries: [],
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: tab.id,
        fileDisplayPath: undefined,
        fileError: undefined,
        selectedFile: undefined,
        selectedSidebarTool: "files",
        tabMruOrder: [tab.id, ...state.tabMruOrder.filter((id) => id !== tab.id)]
      };
    });
    void persistUiStateWithWindowSnapshot(get());
    get().loadCurrentFiles().catch(() => {});
    return tab.id;
  },

  getWindowTabs: (windowLabel) => {
    const state = get();
    const snapshot = getWindowTabsSnapshot(state, windowLabel);
    return snapshot.tabs
      .map((id) => state.tabs.find((tab) => tab.id === id))
      .filter((tab): tab is AppTab => !!tab);
  },

  getActiveTabIdForWindow: (windowLabel) => {
    const snapshot = getWindowTabsSnapshot(get(), windowLabel);
    return snapshot.activeTabId ?? undefined;
  },

  ensureWindowState: (windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    set((state) => {
      const windowTabs = sanitizeWindowTabs(state.tabs, state.windowTabs);
      const activeTabByWindow = sanitizeActiveTabs(windowTabs, state.activeTabByWindow);
      if (windowTabs[label] && activeTabByWindow[label] !== undefined) {
        return {};
      }
      if (!windowTabs[label]) {
        windowTabs[label] = label === MAIN_WINDOW_LABEL ? state.tabs.map((tab) => tab.id) : [];
      }
      if (activeTabByWindow[label] === undefined) {
        activeTabByWindow[label] = windowTabs[label][0] ?? null;
      }
      return {
        windowTabs,
        activeTabByWindow,
        activeTabId: label === resolveWindowLabel() ? (activeTabByWindow[label] ?? undefined) : state.activeTabId,
      };
    });
  },

  syncWindowStateFromBackend: async (windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
    if (!persisted) return;
    const currentState = get();
    const currentTabs = [...currentState.tabs];
    const knownIds = new Set(currentTabs.map((tab) => tab.id));
    const requestedIds = new Set(Object.values(persisted.window_tabs ?? {}).flat());

    for (const tabId of requestedIds) {
      if (knownIds.has(tabId)) continue;
      const savedTab = persisted.tabs.find((tab) => tab.id === tabId);
      if (!savedTab) continue;
      const restored = await restoreDetachedTabFromPersisted(savedTab);
      if (!restored.tab) continue;
      currentTabs.push(restored.tab);
    }

    const windowState = applyPersistedWindowState(currentTabs, persisted.window_tabs, persisted.active_tab_by_window);
    const activeTabId = windowState.activeTabByWindow[label] ?? windowState.activeTabByWindow[MAIN_WINDOW_LABEL] ?? undefined;
    const nextDisconnectReasons = { ...currentState.tabDisconnectReasons };
    for (const savedTab of persisted.tabs) {
      if (!requestedIds.has(savedTab.id)) continue;
      const restored = await restoreDetachedTabFromPersisted(savedTab);
      if (restored.disconnectReason) {
        nextDisconnectReasons[savedTab.id] = restored.disconnectReason;
      }
    }

    set((state) => ({
      tabs: currentTabs,
      windowTabs: windowState.windowTabs,
      activeTabByWindow: windowState.activeTabByWindow,
      windowStates: sanitizeWindowStates(windowState.windowTabs, persisted.window_states ?? {}),
      tabDisconnectReasons: nextDisconnectReasons,
      activeTabId: label === resolveWindowLabel() ? activeTabId : state.activeTabId,
    }));
    if (label !== MAIN_WINDOW_LABEL) {
      await restoreWindowGeometry(label, persisted.window_states?.[label]);
    }
  },

  attachExistingSessionTab: (session, options) => {
    const windowLabel = resolveWindowLabel(options?.windowLabel);
    const base = makeTabFromSession(session);
    const tab: AppTab = {
      ...base,
      id: options?.tabId ?? base.id,
      title: options?.title ?? base.title,
      color: options?.color ?? base.color,
      icon: options?.icon ?? base.icon,
    };

    set((state) => {
      const existingTabs = state.tabs.filter((item) => item.id !== tab.id);
      const currentWindowTabs = getWindowTabIds({ ...state, tabs: existingTabs }, windowLabel).filter((id) => id !== tab.id);
      const windowTabs = sanitizeWindowTabs(
        [...existingTabs, tab],
        {
          ...state.windowTabs,
          [windowLabel]: [...currentWindowTabs, tab.id],
        }
      );
      const activeTabByWindow = sanitizeActiveTabs(windowTabs, {
        ...state.activeTabByWindow,
        [windowLabel]: tab.id,
      });
      return {
        tabs: [...existingTabs, tab],
        windowTabs,
        activeTabByWindow,
        activeTabId: windowLabel === resolveWindowLabel() ? tab.id : state.activeTabId,
        tabMruOrder: [tab.id, ...state.tabMruOrder.filter((id) => id !== tab.id)],
      };
    });
  },

  moveTabToWindow: async (tabId, targetWindowLabel, options) => {
    const sourceWindowLabel = resolveWindowLabel(options?.sourceWindowLabel);
    const activate = options?.activate ?? true;
    const targetTabId = options?.targetTabId;
    const side = options?.side ?? "after";
    if (!get().tabs.some((tab) => tab.id === tabId)) {
      const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
      const savedTab = persisted?.tabs.find((tab) => tab.id === tabId);
      if (savedTab) {
        const restored = await restoreDetachedTabFromPersisted(savedTab);
        if (restored.tab) {
          set((state) => ({
            tabs: [...state.tabs.filter((tab) => tab.id !== tabId), restored.tab!],
            tabDisconnectReasons: restored.disconnectReason
              ? { ...state.tabDisconnectReasons, [tabId]: restored.disconnectReason }
              : state.tabDisconnectReasons,
          }));
        }
      }
    }
    const sourceWouldBecomeEmpty = getWindowTabIds(get(), sourceWindowLabel).filter((id) => id !== tabId).length === 0;
    set((state) => {
      const currentSource = getWindowTabIds(state, sourceWindowLabel).filter((id) => id !== tabId);
      const currentTarget = getWindowTabIds(state, targetWindowLabel).filter((id) => id !== tabId);
      const nextTarget = [...currentTarget];
      if (targetTabId) {
        const targetIndex = nextTarget.findIndex((id) => id === targetTabId);
        const insertIndex = targetIndex < 0 ? nextTarget.length : targetIndex + (side === "after" ? 1 : 0);
        nextTarget.splice(insertIndex, 0, tabId);
      } else {
        nextTarget.push(tabId);
      }
      const nextWindowTabs = sanitizeWindowTabs(state.tabs, {
        ...state.windowTabs,
        [sourceWindowLabel]: currentSource,
        [targetWindowLabel]: nextTarget,
      });
      const nextActive = sanitizeActiveTabs(nextWindowTabs, {
        ...state.activeTabByWindow,
        [sourceWindowLabel]: state.activeTabByWindow[sourceWindowLabel] === tabId ? (currentSource[0] ?? null) : state.activeTabByWindow[sourceWindowLabel] ?? null,
        [targetWindowLabel]: activate ? tabId : (state.activeTabByWindow[targetWindowLabel] ?? nextTarget[0] ?? tabId),
      });
      return {
        windowTabs: nextWindowTabs,
        activeTabByWindow: nextActive,
        activeTabId: sourceWindowLabel === resolveWindowLabel()
          ? (nextActive[sourceWindowLabel] ?? undefined)
          : targetWindowLabel === resolveWindowLabel()
            ? (nextActive[targetWindowLabel] ?? undefined)
            : state.activeTabId,
        fileTransitioning: true,
        selectedFile: undefined,
      };
    });
    await persistUiStateWithWindowSnapshot(get(), sourceWindowLabel);
    if (activate) {
      await Window.getByLabel(targetWindowLabel)
        .then(async (targetWindow) => {
          if (!targetWindow) return;
          await targetWindow.show().catch(() => undefined);
          await targetWindow.setFocus().catch(() => undefined);
        })
        .catch(() => undefined);
    }
    if (sourceWouldBecomeEmpty) {
      await get().closeEmptyDetachedWindow(sourceWindowLabel);
    }
  },

  detachTabToNewWindow: async (tabId, sourceWindowLabel, placement) => {
    const label = makeTerminalWindowLabel();
    const tab = get().tabs.find((item) => item.id === tabId);
    openTerminalWorkspaceWindow(label, tab ? `${tab.title} — Termif` : "Termif", placement);
    await get().moveTabToWindow(tabId, label, { sourceWindowLabel, activate: true });
    if (resolveWindowLabel(sourceWindowLabel) === resolveWindowLabel() && get().getWindowTabs(resolveWindowLabel()).length === 0) {
      get().loadCurrentFilesFromCache();
    } else {
      get().loadCurrentFiles().catch(() => {});
    }
  },

  moveTabToMainWindow: async (tabId, sourceWindowLabel) => {
    await get().moveTabToWindow(tabId, MAIN_WINDOW_LABEL, { sourceWindowLabel, activate: true });
    get().loadCurrentFiles().catch(() => {});
  },

  moveAllTabsToWindow: async (sourceWindowLabel, targetWindowLabel) => {
    const tabIds = getWindowTabIds(get(), sourceWindowLabel);
    for (const tabId of tabIds) {
      await get().moveTabToWindow(tabId, targetWindowLabel, { sourceWindowLabel, activate: false });
    }
    if (tabIds.length > 0) {
      get().setActiveTab(tabIds[tabIds.length - 1], targetWindowLabel);
    }
  },

  closeWindowTabs: async (windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    const tabIds = [...getWindowTabIds(get(), label)];
    for (const tabId of tabIds) {
      await get().closeTab(tabId);
    }
  },

  closeEmptyDetachedWindow: async (windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    if (label === MAIN_WINDOW_LABEL) return;
    if (getWindowTabIds(get(), label).length > 0) return;
    const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
    const windowStates = sanitizeWindowStates(get().windowTabs, persisted?.window_states ?? {});
    delete windowStates[label];
    set({ windowStates });
    await persistUiState(get(), windowStates);
    await emit(FORCE_CLOSE_WINDOW_EVENT, { targetWindow: label }).catch(() => undefined);
  },

  closeDetachedWindow: async (windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    if (label === MAIN_WINDOW_LABEL) return;
    const tabIds = [...getWindowTabIds(get(), label)];
    const tabSet = new Set(tabIds);

    for (const tabId of tabIds) {
      const tab = get().tabs.find((item) => item.id === tabId);
      if (tab?.sessionId) {
        await invoke("close_terminal_session", { sessionId: tab.sessionId }).catch(() => undefined);
      }
      clearTerminalLog(tabId);
    }

    const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
    const windowStates = sanitizeWindowStates(get().windowTabs, persisted?.window_states ?? {});
    delete windowStates[label];

    set((state) => {
      const nextWindowTabs = { ...state.windowTabs };
      const nextActiveByWindow = { ...state.activeTabByWindow };
      delete nextWindowTabs[label];
      delete nextActiveByWindow[label];
      return {
        tabs: state.tabs.filter((tab) => !tabSet.has(tab.id)),
        activeTabId: label === resolveWindowLabel() ? (nextActiveByWindow[MAIN_WINDOW_LABEL] ?? undefined) : state.activeTabId,
        tabMruOrder: state.tabMruOrder.filter((id) => !tabSet.has(id)),
        tabDisconnectReasons: Object.fromEntries(
          Object.entries(state.tabDisconnectReasons).filter(([id]) => !tabSet.has(id))
        ),
        windowTabs: nextWindowTabs,
        activeTabByWindow: nextActiveByWindow,
        windowStates,
      };
    });
    await persistUiState(get(), windowStates);
    await emit(FORCE_CLOSE_WINDOW_EVENT, { targetWindow: label }).catch(() => undefined);
  },

  connectSshTab: async (tabId, alias) => {
    const session = await invoke<SessionDto>("create_ssh_session", { hostAlias: alias });
    const windowLabel = resolveWindowLabel();
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: alias,
              kind: "ssh",
              sessionId: session.id,
              sshAlias: alias,
              icon: "globe",
              color: "#3dba84"
            }
          : tab
      ),
      tabPaths: { ...state.tabPaths, [tabId]: "/" },
      activeTabId: tabId,
      activeTabByWindow: {
        ...state.activeTabByWindow,
        [windowLabel]: tabId,
      },
      fileTransitioning: true,
      selectedFile: undefined,
      selectedSidebarTool: "files",
      tabDisconnectReasons: {
        ...state.tabDisconnectReasons,
        [tabId]: ""
      }
    }));
    get().clearTabDisconnected(tabId);
    await persistUiStateWithWindowSnapshot(get());
    get().loadCurrentFiles().catch(() => {});
  },

  connectSshTabWithOptions: async (tabId, options, saveAsManaged, groupId) => {
    const windowLabel = resolveWindowLabel();
    const safeAlias = options.alias.trim() || options.host.trim();
    const session = await invoke<SessionDto>("create_ssh_session_with_options", {
      options: {
        alias: safeAlias,
        host: options.host.trim(),
        user: options.user?.trim() || null,
        port: options.port ?? 22,
        identity_file: options.identity_file?.trim() || null,
        password: options.password ?? null,
      }
    });

    if (saveAsManaged) {
      const managedHost: SshHostEntry = {
        id: "",
        alias: safeAlias,
        host_name: options.host.trim(),
        user: options.user?.trim() || null,
        port: options.port ?? 22,
        identity_file: options.identity_file?.trim() || null,
        password: options.password ?? null,
        group_id: groupId ?? null,
        original_alias: null,
        source: "managed",
      };
      await invoke("save_managed_ssh_host", { host: managedHost }).catch(() => undefined);
      await get().refreshHosts();
    }

    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: safeAlias,
              kind: "ssh",
              sessionId: session.id,
              sshAlias: safeAlias,
              icon: "globe",
              color: "#3dba84"
            }
          : tab
      ),
      tabPaths: { ...state.tabPaths, [tabId]: "/" },
      activeTabId: tabId,
      activeTabByWindow: {
        ...state.activeTabByWindow,
        [windowLabel]: tabId,
      },
      fileTransitioning: true,
      selectedFile: undefined,
      selectedSidebarTool: "files"
    }));
    get().clearTabDisconnected(tabId);
    await persistUiStateWithWindowSnapshot(get());
    get().loadCurrentFiles().catch(() => {});
  },

  reconnectSshTab: async (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (!tab || tab.kind !== "ssh" || !tab.sshAlias) return;

    const staleSession = tab.sessionId;
    if (staleSession) {
      await invoke("close_terminal_session", { sessionId: staleSession }).catch(() => undefined);
    }

    const session = await invoke<SessionDto>("create_ssh_session", { hostAlias: tab.sshAlias });
    set((state) => ({
      tabs: state.tabs.map((item) =>
        item.id === tabId
          ? { ...item, kind: "ssh", sessionId: session.id }
          : item
      ),
      fileTransitioning: true,
      selectedFile: undefined,
      selectedSidebarTool: "files"
    }));
    get().clearTabDisconnected(tabId);
    await persistUiStateWithWindowSnapshot(get());
    get().loadCurrentFiles({ force: true }).catch(() => {});
  },

  markTabDisconnected: (tabId, reason) => {
    const safeReason = reason.trim() || "Connection lost";
    set((state) => ({
      tabDisconnectReasons: {
        ...state.tabDisconnectReasons,
        [tabId]: safeReason,
      }
    }));
  },

  clearTabDisconnected: (tabId) => {
    set((state) => {
      if (!state.tabDisconnectReasons[tabId]) {
        return {};
      }
      const next = { ...state.tabDisconnectReasons };
      delete next[tabId];
      return { tabDisconnectReasons: next };
    });
  },

  closeTab: async (tabId) => {
    const windowLabel = resolveWindowLabel();
    const tab = get().tabs.find((item) => item.id === tabId);
    if (tab?.sessionId) {
      await invoke("close_terminal_session", { sessionId: tab.sessionId }).catch(() => undefined);
    }
    clearTerminalLog(tabId);

    const tabs = get().tabs.filter((item) => item.id !== tabId);
    const mru = get().tabMruOrder.filter((id) => id !== tabId);
    const nextWindowTabs = sanitizeWindowTabs(tabs, Object.fromEntries(
      Object.entries(get().windowTabs).map(([label, ids]) => [label, ids.filter((id) => id !== tabId)])
    ));
    const nextActiveByWindow = sanitizeActiveTabs(nextWindowTabs, Object.fromEntries(
      Object.entries(get().activeTabByWindow).map(([label, active]) => [label, active === tabId ? null : active])
    ));
    const activeTabId = nextActiveByWindow[windowLabel] ?? undefined;
    set({
      tabs,
      activeTabId,
      windowTabs: nextWindowTabs,
      activeTabByWindow: nextActiveByWindow,
      tabMruOrder: mru,
      fileTransitioning: true,
      selectedFile: undefined,
      tabDisconnectReasons: Object.fromEntries(
        Object.entries(get().tabDisconnectReasons).filter(([id]) => id !== tabId)
      )
    });

    if (tabs.length === 0 && windowLabel === MAIN_WINDOW_LABEL) {
      await get().createLocalTab(coerceShellProfile(get().settings?.terminal.default_shell));
      return;
    }

    await persistUiStateWithWindowSnapshot(get());
    if (activeTabId) {
      get().loadCurrentFilesFromCache();
      get().loadCurrentFiles().catch(() => {});
    }
    await get().closeEmptyDetachedWindow(windowLabel);
  },

  duplicateTab: async (tabId) => {
    const source = get().tabs.find((item) => item.id === tabId);
    if (!source) return;

    if (source.kind === "local") {
      await get().createLocalTab(coerceShellProfile(source.shellProfile ?? get().settings?.terminal.default_shell ?? getDefaultShellProfile()));
      return;
    }

    if (source.kind === "ssh" && source.sshAlias) {
      const newTabId = crypto.randomUUID();
      const windowLabel = resolveWindowLabel();
      set((state) => ({
        tabs: [
          ...state.tabs,
          {
            id: newTabId,
            title: source.sshAlias ?? "SSH",
            color: source.color,
            icon: source.icon,
            kind: "ssh_picker"
          }
        ],
        activeTabId: newTabId,
        windowTabs: {
          ...state.windowTabs,
          [windowLabel]: [...getWindowTabIds(state, windowLabel), newTabId],
        },
        activeTabByWindow: {
          ...state.activeTabByWindow,
          [windowLabel]: newTabId,
        },
      }));
      await get().connectSshTab(newTabId, source.sshAlias);
      return;
    }

    get().createSshPickerTab();
  },

  renameTab: (tabId, name) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, title: name } : tab))
    }));
    void persistUiStateWithWindowSnapshot(get());
  },

  setTabColor: (tabId, color) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, color } : tab))
    }));
    void persistUiStateWithWindowSnapshot(get());
  },

  reorderTabs: (fromTabId, toTabId, side = "before", windowLabel) => {
    if (fromTabId === toTabId) return;
    const label = resolveWindowLabel(windowLabel);
    set((state) => {
      const scopedIds = [...getWindowTabIds(state, label)];
      const ids = reorderScopedTabIds(scopedIds, fromTabId, toTabId, side);
      if (ids.every((id, index) => id === scopedIds[index])) return {};
      return {
        windowTabs: {
          ...state.windowTabs,
          [label]: ids,
        },
      };
    });
    void persistUiStateWithWindowSnapshot(get());
  },

  setActiveTab: (tabId, windowLabel) => {
    const label = resolveWindowLabel(windowLabel);
    if (label === resolveWindowLabel() && get().activeTabId === tabId) return;

    set((state) => ({
      activeTabId: label === resolveWindowLabel() ? tabId : state.activeTabId,
      activeTabByWindow: {
        ...state.activeTabByWindow,
        [label]: tabId,
      },
      fileTransitioning: true,
      selectedFile: undefined,
      selectedSidebarTool: "files",
      tabMruOrder: [tabId, ...state.tabMruOrder.filter((id) => id !== tabId)]
    }));
    void persistUiStateWithWindowSnapshot(get());
    if (label !== resolveWindowLabel()) return;
    get().loadCurrentFilesFromCache();

    if (fileLoadDebounceTimer !== undefined) {
      window.clearTimeout(fileLoadDebounceTimer);
    }
    fileLoadDebounceTimer = window.setTimeout(() => {
      get().loadCurrentFiles().catch(() => {});
      fileLoadDebounceTimer = undefined;
    }, FILE_LOAD_DEBOUNCE_MS);
  },

  activateNextTab: () => {
    const tabs = get().getWindowTabs(resolveWindowLabel());
    const activeTabId = get().getActiveTabIdForWindow(resolveWindowLabel());
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    get().setActiveTab(next.id);
  },

  activatePrevTab: () => {
    const tabs = get().getWindowTabs(resolveWindowLabel());
    const activeTabId = get().getActiveTabIdForWindow(resolveWindowLabel());
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    get().setActiveTab(prev.id);
  },

  activateTabByIndex: (index) => {
    const tabs = get().getWindowTabs(resolveWindowLabel());
    if (index >= 0 && index < tabs.length) {
      get().setActiveTab(tabs[index].id);
    }
  },

  toggleSidebar: () => {
    set((state) => ({ sidebarVisible: !state.sidebarVisible }));
    void persistUiStateWithWindowSnapshot(get());
  },

  setSidebarVisible: (visible) => {
    set({ sidebarVisible: visible });
    void persistUiStateWithWindowSnapshot(get());
  },

  setSidebarWidth: (width) => {
    set({ sidebarWidth: clampSidebarWidth(width) });
    void persistUiStateWithWindowSnapshot(get());
  },

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setSelectedSidebarTool: (tool) => {
    set({ selectedSidebarTool: tool });
    void persistUiStateWithWindowSnapshot(get());
  },

  updateWindowState: async (windowLabel, windowState) => {
    const persisted = await invoke<PersistedUiState>("load_ui_state").catch(() => null);
    const nextWindowStates = sanitizeWindowStates(get().windowTabs, persisted?.window_states ?? {});
    if (windowState) {
      nextWindowStates[windowLabel] = windowState;
    } else {
      delete nextWindowStates[windowLabel];
    }
    set({ windowStates: nextWindowStates });
    await persistUiState(get(), nextWindowStates);
  },

  refreshHosts: async () => {
    const payload = await invoke<SshHostsPayload>("load_ssh_hosts");
    set({
      importedHosts: payload.imported,
      managedHosts: payload.managed,
      sshGroups: payload.groups
    });
  },

  saveManagedHost: async (host) => {
    await invoke("save_managed_ssh_host", { host });
    await get().refreshHosts();
  },

  deleteManagedHost: async (hostId) => {
    await invoke("delete_managed_ssh_host", { hostId });
    await get().refreshHosts();
  },

  createHostGroup: async (name) => {
    await invoke("create_ssh_group", { name });
    await get().refreshHosts();
  },

  renameHostGroup: async (groupId, name) => {
    await invoke("rename_ssh_group", { groupId, name });
    await get().refreshHosts();
  },

  deleteHostGroup: async (groupId, options) => {
    await invoke("delete_ssh_group", {
      groupId,
      hostsAction: options?.hostsAction ?? "ungroup",
      targetGroupId: options?.targetGroupId ?? null,
    });
    await get().refreshHosts();
  },

  loadCurrentFiles: async (options) => {
    const force = options?.force ?? false;
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    if (activeTab.kind === "ssh_picker") {
      // Show ~/.ssh directory contents when the ssh picker tab is active
      try {
        const homeDir = await invoke<string>("get_home_dir");
        const sshPath = homeDir.replace(/\\/g, "/").replace(/\/$/, "") + "/.ssh";
        const sshTabPath = get().tabPaths[activeTab.id] ?? sshPath;
        const showHidden = get().settings?.file_manager.show_hidden ?? false;
        const entries = await invoke<FileEntryDto[]>("list_local_entries", { path: sshTabPath, showHidden });
      set({
        fileEntries: entries, fileLoading: false, fileTransitioning: false,
        fileError: undefined, selectedFile: undefined,
          fileDisplayTabId: activeTab.id, fileDisplayPath: sshTabPath
        });
        if (!get().tabPaths[activeTab.id]) {
          set((state) => ({ tabPaths: { ...state.tabPaths, [activeTab.id]: sshTabPath } }));
        }
      } catch {
        set({
          fileEntries: [], fileLoading: false, fileTransitioning: false,
          fileError: undefined, selectedFile: undefined,
          fileDisplayTabId: activeTab.id, fileDisplayPath: undefined
        });
      }
      return;
    }

    const requestTabId = activeTab.id;

    const currentPath =
      get().tabPaths[activeTab.id] ??
      (activeTab.kind === "ssh" ? "/" : getDefaultLocalPath());

    const historySeed = ensurePathHistorySeed(
      get().fileHistory[activeTab.id] ?? [],
      get().fileHistoryIndex[activeTab.id],
      currentPath
    );
    if (historySeed.changed) {
      set((state) => ({
        fileHistory: { ...state.fileHistory, [activeTab.id]: historySeed.history },
        fileHistoryIndex: { ...state.fileHistoryIndex, [activeTab.id]: historySeed.index },
      }));
    }

    const requestSeq = ++fileLoadRequestSeq;

    // Show cached data instantly — only show loading spinner if no cache exists
    const showHidden = get().settings?.file_manager.show_hidden ?? false;
    const cacheKey = buildDirCacheKey(activeTab, currentPath, { showHidden });
    const cached = get().dirCache[cacheKey];
    const isFresh = Date.now() - (dirCacheFreshAt[cacheKey] ?? 0) < FILE_CACHE_FRESH_MS;

    if (cached) {
      // Cache hit: show cached data immediately.
      set({
        pendingSelectedFilePath:
          get().pendingSelectedFileTabId === requestTabId ? undefined : get().pendingSelectedFilePath,
        pendingSelectedFileTabId:
          get().pendingSelectedFileTabId === requestTabId ? undefined : get().pendingSelectedFileTabId,
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: requestTabId,
        fileDisplayPath: currentPath,
        fileError: undefined,
        selectedFile:
          get().pendingSelectedFileTabId === requestTabId
            ? (cached.find((entry) => entry.path === get().pendingSelectedFilePath) ?? undefined)
            : undefined,
      });

      if (!force && isFresh) {
        return;
      }
    } else {
      // No cache: show loading indicator
      set({
        fileEntries: [],
        fileLoading: true,
        fileTransitioning: true,
        fileDisplayTabId: requestTabId,
        fileDisplayPath: currentPath,
        fileError: undefined,
        selectedFile: undefined
      });
    }

    try {
      const entries =
        activeTab.kind === "ssh"
          ? await invoke<FileEntryDto[]>("list_remote_entries", {
              sessionId: activeTab.sessionId,
              path: currentPath
            })
          : await invoke<FileEntryDto[]>("list_local_entries", {
              path: currentPath,
              showHidden
            });

      const live = get();
      const liveTab = live.tabs.find((tab) => tab.id === requestTabId);
      const livePath = liveTab
        ? (live.tabPaths[requestTabId] ?? (liveTab.kind === "ssh" ? "/" : getDefaultLocalPath()))
        : undefined;
      if (requestSeq !== fileLoadRequestSeq || live.activeTabId !== requestTabId || livePath !== currentPath) {
        return;
      }

      set((state) => ({
        ...(state.pendingSelectedFileTabId === requestTabId
          ? {
              pendingSelectedFilePath: undefined,
              pendingSelectedFileTabId: undefined,
            }
          : {}),
        fileEntries: entries,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: requestTabId,
        fileDisplayPath: currentPath,
        selectedFile:
          state.pendingSelectedFileTabId === requestTabId
            ? (entries.find((entry) => entry.path === state.pendingSelectedFilePath) ?? undefined)
            : undefined,
        tabPaths: { ...state.tabPaths, [activeTab.id]: currentPath },
        dirCache: { ...state.dirCache, [cacheKey]: entries }
      }));
      dirCacheFreshAt[cacheKey] = Date.now();
    } catch (error) {
      const live = get();
      if (requestSeq !== fileLoadRequestSeq || live.activeTabId !== requestTabId) {
        return;
      }
      set({
        fileLoading: false,
        fileTransitioning: false,
        fileError: error instanceof Error ? error.message : String(error)
      });

      if (activeTab.kind === "ssh") {
        const message = error instanceof Error ? error.message : String(error);
        if (isConnectionError(message)) {
          get().markTabDisconnected(activeTab.id, message);
        }
      }
    }
  },

  loadCurrentFilesFromCache: () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    if (activeTab.kind === "ssh_picker") {
      // Fall through to loadCurrentFiles for ssh_picker to get ~/.ssh
      void get().loadCurrentFiles();
      return;
    }

    const currentPath =
      get().tabPaths[activeTab.id] ??
      (activeTab.kind === "ssh" ? "/" : getDefaultLocalPath());

    const showHidden = get().settings?.file_manager.show_hidden ?? false;
    const cacheKey = buildDirCacheKey(activeTab, currentPath, { showHidden });
    const cached = get().dirCache[cacheKey];

    if (cached) {
      set({
        pendingSelectedFilePath:
          get().pendingSelectedFileTabId === activeTab.id ? undefined : get().pendingSelectedFilePath,
        pendingSelectedFileTabId:
          get().pendingSelectedFileTabId === activeTab.id ? undefined : get().pendingSelectedFileTabId,
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: activeTab.id,
        fileDisplayPath: currentPath,
        fileError: undefined,
        selectedFile:
          get().pendingSelectedFileTabId === activeTab.id
            ? (cached.find((entry) => entry.path === get().pendingSelectedFilePath) ?? undefined)
            : undefined,
      });
      return;
    }

    set({
      fileEntries: [],
      fileLoading: true,
      fileTransitioning: true,
      fileDisplayTabId: activeTab.id,
      fileDisplayPath: currentPath,
      fileError: undefined,
      selectedFile: undefined
    });
  },

  navigatePath: async (path, options) => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;
    const normalizedPath = normalizeDisplayPath(path, { remote: activeTab.kind === "ssh" });

    const preserveForward = options?.preserveForward ?? false;
    const skipHistory = options?.skipHistory ?? false;

    set((state) => ({
      tabPaths: { ...state.tabPaths, [activeTab.id]: normalizedPath },
      fileTransitioning: true,
      selectedFile: undefined,
      ...(skipHistory
        ? {}
        : (() => {
            const next = pushPathHistory(
              state.fileHistory[activeTab.id] ?? [],
              state.fileHistoryIndex[activeTab.id],
              normalizedPath,
              { preserveForward }
            );
            return {
              fileHistory: { ...state.fileHistory, [activeTab.id]: next.history },
              fileHistoryIndex: { ...state.fileHistoryIndex, [activeTab.id]: next.index },
            };
          })()),
    }));

    // Show cached immediately if available
    const showHidden = get().settings?.file_manager.show_hidden ?? false;
    const cacheKey = buildDirCacheKey(activeTab, normalizedPath, { showHidden });
    const cached = get().dirCache[cacheKey];
    if (cached) {
      set({
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: activeTab.id,
        fileDisplayPath: normalizedPath,
        fileError: undefined
      });
    } else {
      set({
        fileEntries: [],
        fileLoading: true,
        fileDisplayTabId: activeTab.id,
        fileDisplayPath: normalizedPath,
        fileError: undefined
      });
    }

    await get().loadCurrentFiles();
  },

  goParentPath: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    const currentPath = get().tabPaths[activeTab.id] ?? (activeTab.kind === "ssh" ? "/" : getDefaultLocalPath());
    const normalized = currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
    if (!normalized || normalized === "/") return;

    const driveMatch = /^[A-Za-z]:$/.exec(normalized);
    if (driveMatch) return;

    const idx = normalized.lastIndexOf("/");
    if (idx < 0) return;

    if (idx === 0) {
      await get().navigatePath("/");
      return;
    }

    if (idx === 2 && normalized[1] === ":") {
      await get().navigatePath(`${normalized.slice(0, 2)}/`);
      return;
    }

    await get().navigatePath(normalized.slice(0, idx));
  },

  goBackPath: async () => {
    const { activeTabId, fileHistory, fileHistoryIndex } = get();
    if (!activeTabId) return;
    const history = fileHistory[activeTabId] ?? [];
    const target = getRelativeHistoryTarget(history, fileHistoryIndex[activeTabId], "back");
    if (!target.path) return;
    const nextIndex = target.index;
    if (!target) return;
    set((state) => ({
      fileHistoryIndex: { ...state.fileHistoryIndex, [activeTabId]: nextIndex },
    }));
    await get().navigatePath(target.path, { skipHistory: true });
  },

  goForwardPath: async () => {
    const { activeTabId, fileHistory, fileHistoryIndex } = get();
    if (!activeTabId) return;
    const history = fileHistory[activeTabId] ?? [];
    const target = getRelativeHistoryTarget(history, fileHistoryIndex[activeTabId], "forward");
    if (!target.path) return;
    const nextIndex = target.index;
    set((state) => ({
      fileHistoryIndex: { ...state.fileHistoryIndex, [activeTabId]: nextIndex },
    }));
    await get().navigatePath(target.path, { skipHistory: true });
  },

  canGoBackPath: () => {
    const { activeTabId, fileHistory, fileHistoryIndex } = get();
    if (!activeTabId) return false;
    const history = fileHistory[activeTabId] ?? [];
    return !!getRelativeHistoryTarget(history, fileHistoryIndex[activeTabId], "back").path;
  },

  canGoForwardPath: () => {
    const { activeTabId, fileHistory, fileHistoryIndex } = get();
    if (!activeTabId) return false;
    const history = fileHistory[activeTabId] ?? [];
    return !!getRelativeHistoryTarget(history, fileHistoryIndex[activeTabId], "forward").path;
  },

  setSelectedFile: (file) => set({ selectedFile: file }),

  revealFileInManager: async (path, sessionId, options) => {
    const allowCrossWindow = options?.allowCrossWindow ?? true;
    const currentWindowLabel = resolveWindowLabel();
    const state = get();
    const currentWindowTabs = state.getWindowTabs(currentWindowLabel);
    const anyTargetTab = sessionId
      ? state.tabs.find((tab) => tab.sessionId === sessionId)
      : undefined;
    const targetWindowLabel = anyTargetTab ? findWindowLabelForTab(state, anyTargetTab.id) : undefined;

    if (allowCrossWindow && targetWindowLabel && targetWindowLabel !== currentWindowLabel) {
      await emit(REVEAL_IN_FILE_MANAGER_EVENT, {
        path,
        sessionId,
        targetWindow: targetWindowLabel,
      }).catch(() => undefined);
      await Window.getByLabel(targetWindowLabel)
        .then(async (targetWindow) => {
          if (!targetWindow) return;
          await targetWindow.show().catch(() => undefined);
          await targetWindow.setFocus().catch(() => undefined);
        })
        .catch(() => undefined);
      return;
    }

    let targetTab = sessionId
      ? currentWindowTabs.find((tab) => tab.sessionId === sessionId)
      : currentWindowTabs.find((tab) => tab.id === get().activeTabId && tab.kind === "local")
        ?? currentWindowTabs.find((tab) => tab.kind === "local");

    if (!targetTab && !sessionId) {
      const createdTabId = await get().createLocalTab(
        coerceShellProfile(get().settings?.terminal.default_shell),
        fileDirname(path)
      );
      targetTab = get().tabs.find((tab) => tab.id === createdTabId);
    }

    if (!targetTab) {
      get().toast("No matching file manager context is open in this window");
      return;
    }

    get().setSelectedSidebarTool("files");
    if (get().activeTabId !== targetTab.id) {
      get().setActiveTab(targetTab.id);
    }

    set({
      pendingSelectedFilePath: path,
      pendingSelectedFileTabId: targetTab.id,
    });

    await get().navigatePath(fileDirname(path));
  },

  saveSettings: async (settings) => {
    const previousShowHidden = get().settings?.file_manager.show_hidden;
    await invoke("save_settings", { settings });
    applyAppearanceTheme(settings.appearance);
    watchSystemTheme(settings.appearance);
    applyAppearanceOverrides(settings.appearance);
    set((state) => ({
      settings,
      dirCache: previousShowHidden !== settings.file_manager.show_hidden ? {} : state.dirCache,
    }));
    if (previousShowHidden !== undefined && previousShowHidden !== settings.file_manager.show_hidden) {
      get().loadCurrentFiles({ force: true }).catch(() => {});
    }
  },

  toast: (message) => {
    const id = get().toastId + 1;
    set({ lastToast: message, toastId: id });
    // Smart duration: base 2s + 30ms per character, min 2s max 6s
    const duration = Math.min(6000, Math.max(2000, 2000 + message.length * 30));
    window.setTimeout(() => {
      if (get().toastId === id) {
        set({ lastToast: undefined });
      }
    }, duration);
  },

  // ── Editor actions ─────────────────────────────────────────────────

  openFile: async (path, mode, sessionId) => {
    if (isEditorPopoutLive()) {
      await requestOpenFileInEditorWindow({
        path,
        mode,
        sessionId,
        ownerWindowLabel: resolveWindowLabel(),
      });
      set({ editorVisible: false });
      return;
    }

    const existing = get().editorFiles.find(
      (f) => f.path === path && f.sessionId === sessionId
    );
    if (existing) {
      set({ activeEditorFileId: existing.id, editorVisible: true });
      return;
    }

    const id = crypto.randomUUID();
    const filename = path.split(/[\\/]/).pop() ?? path;
    const lang = detectLanguage(filename);
    const loadingFile: EditorFile = {
      id,
      path,
      mode,
      content: "",
      originalContent: "",
      dirty: false,
      sessionId,
      languageId: lang.id,
      languageName: lang.name,
      encoding: "UTF-8",
      loading: true,
    };

    set((state) => ({
      editorFiles: [...state.editorFiles, loadingFile],
      activeEditorFileId: id,
      editorVisible: true,
    }));

    try {
      const rawContent: string = sessionId
        ? await invoke<string>("read_remote_text_file", { sessionId, path })
        : await invoke<string>("read_text_file", { path });
      const normalizedContent = normalizeLineEndings(rawContent);
      const mtime: number | null | undefined = !sessionId
        ? await invoke<number | null>("get_file_mtime", { path })
        : undefined;

      const file: EditorFile = {
        id,
        path,
        mode,
        content: normalizedContent,
        originalContent: normalizedContent,
        dirty: false,
        sessionId,
        languageId: lang.id,
        languageName: lang.name,
        encoding: "UTF-8",
        loading: false,
        diskMtime: mtime ?? undefined,
      };
      set((state) => {
        if (!state.editorFiles.some((item) => item.id === id)) return {};
        return {
          editorFiles: state.editorFiles.map((item) => (item.id === id ? file : item)),
          activeEditorFileId: id,
          editorVisible: true,
        };
      });
    } catch (error) {
      const file: EditorFile = {
        id,
        path,
        mode,
        content: "",
        originalContent: "",
        dirty: false,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        languageId: lang.id,
        languageName: lang.name,
        encoding: "UTF-8",
        loading: false,
      };
      set((state) => {
        if (!state.editorFiles.some((item) => item.id === id)) return {};
        return {
          editorFiles: state.editorFiles.map((item) => (item.id === id ? file : item)),
          activeEditorFileId: id,
          editorVisible: true,
        };
      });
    }
  },

  closeEditorFile: (fileId) => {
    const file = get().editorFiles.find((f) => f.id === fileId);
    if (file?.dirty) {
      const ok = window.confirm(`"${file.path.split(/[\\/]/).pop()}" has unsaved changes. Close anyway?`);
      if (!ok) return false;
    }

    const files = get().editorFiles.filter((f) => f.id !== fileId);
    const activeId =
      get().activeEditorFileId === fileId
        ? files[files.length - 1]?.id
        : get().activeEditorFileId;

    set({
      editorFiles: files,
      activeEditorFileId: activeId,
      editorVisible: files.length > 0,
    });
    return true;
  },

  setActiveEditorFile: (fileId) => {
    set({ activeEditorFileId: fileId });
  },

  updateEditorContent: (fileId, content) => {
    const normalized = normalizeLineEndings(content);
    set((state) => ({
      editorFiles: state.editorFiles.map((f) =>
        f.id === fileId ? { ...f, content: normalized, dirty: normalized !== f.originalContent } : f
      ),
    }));
  },

  saveEditorFile: async (fileId) => {
    const file = get().editorFiles.find((f) => f.id === fileId);
    if (!file || file.mode === "preview") return;

    try {
      if (file.sessionId) {
        await invoke("write_remote_text_file", {
          sessionId: file.sessionId,
          path: file.path,
          content: file.content,
        });
      } else {
        await invoke("write_text_file", { path: file.path, content: file.content });
      }
      const newMtime: number | null = !file.sessionId
        ? await invoke<number | null>("get_file_mtime", { path: file.path })
        : null;
      set((state) => ({
        editorFiles: state.editorFiles.map((f) =>
          f.id === fileId ? { ...f, dirty: false, originalContent: f.content, error: undefined, diskMtime: newMtime ?? undefined, externallyModified: false } : f
        ),
      }));
      get().toast("File saved");
    } catch (err) {
      set((state) => ({
        editorFiles: state.editorFiles.map((f) =>
          f.id === fileId
            ? { ...f, error: err instanceof Error ? err.message : String(err) }
            : f
        ),
      }));
    }
  },

  setEditorVisible: (visible) => set({ editorVisible: visible }),

  setEditorDock: (dock) => set({ editorDock: dock }),

  setEditorSplitPercent: (pct) => set({ editorSplitPercent: Math.max(20, Math.min(80, pct)) }),

  setEditorLanguage: (fileId, langId, langName) => {
    set((state) => ({
      editorFiles: state.editorFiles.map((f) =>
        f.id === fileId ? { ...f, languageId: langId, languageName: langName } : f
      ),
    }));
  },

  clearEditorWorkspace: () => {
    set({
      editorFiles: [],
      activeEditorFileId: undefined,
      editorVisible: false,
    });
  },

  hasUnsavedEditorFiles: () => get().editorFiles.some((f) => f.dirty),

  checkEditorFilesChanged: async () => {
    const localFiles = get().editorFiles.filter((f) => !f.sessionId && !f.loading);
    if (localFiles.length === 0) return;
    for (const file of localFiles) {
      try {
        const mtime = await invoke<number | null>("get_file_mtime", { path: file.path });
        if (mtime != null && file.diskMtime != null && mtime > file.diskMtime) {
          set((state) => ({
            editorFiles: state.editorFiles.map((f) =>
              f.id === file.id ? { ...f, externallyModified: true } : f
            ),
          }));
        }
      } catch {
        // file may have been deleted externally — ignore
      }
    }
  },

  // ── Zoom actions ───────────────────────────────────────────────────

  zoomIn: () => {
    set((state) => ({ zoomLevel: Math.min(200, state.zoomLevel + 10) }));
  },

  zoomOut: () => {
    set((state) => ({ zoomLevel: Math.max(50, state.zoomLevel - 10) }));
  },

  zoomReset: () => set({ zoomLevel: 100 }),
}));

export { MAIN_WINDOW_LABEL, UI_STATE_SYNC_EVENT, resolveWindowLabel };
