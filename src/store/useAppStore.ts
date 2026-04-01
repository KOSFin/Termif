import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type {
  AppSettings,
  AppTab,
  FileEntryDto,
  PersistedUiState,
  SessionDto,
  SshHostEntry,
  SshHostGroup,
  SshHostsPayload
} from "@/types/models";
import { detectLanguage } from "@/features/editor/languageMap";

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
}

export type EditorDock = "left" | "right" | "top" | "bottom";

interface AppState {
  isInitialized: boolean;
  tabs: AppTab[];
  activeTabId?: string;
  sidebarVisible: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  selectedSidebarTool: "files";
  settings: AppSettings | null;
  sshGroups: SshHostGroup[];
  importedHosts: SshHostEntry[];
  managedHosts: SshHostEntry[];
  tabPaths: Record<string, string>;
  fileEntries: FileEntryDto[];
  fileLoading: boolean;
  fileTransitioning: boolean;
  fileDisplayTabId?: string;
  fileDisplayPath?: string;
  fileError?: string;
  selectedFile?: FileEntryDto;
  lastToast?: string;
  dirCache: Record<string, FileEntryDto[]>;
  tabMruOrder: string[];

  // Editor state
  editorFiles: EditorFile[];
  activeEditorFileId?: string;
  editorVisible: boolean;
  editorDock: EditorDock;
  editorSplitPercent: number;

  // Zoom
  zoomLevel: number;

  initialize: () => Promise<void>;
  createLocalTab: (shellProfile?: string) => Promise<void>;
  createSshPickerTab: () => void;
  connectSshTab: (tabId: string, alias: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  duplicateTab: (tabId: string) => Promise<void>;
  renameTab: (tabId: string, name: string) => void;
  setTabColor: (tabId: string, color: string) => void;
  setActiveTab: (tabId: string) => void;
  activateNextTab: () => void;
  activatePrevTab: () => void;
  activateTabByIndex: (index: number) => void;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  refreshHosts: () => Promise<void>;
  saveManagedHost: (host: SshHostEntry) => Promise<void>;
  deleteManagedHost: (hostId: string) => Promise<void>;
  createHostGroup: (name: string) => Promise<void>;
  renameHostGroup: (groupId: string, name: string) => Promise<void>;
  deleteHostGroup: (groupId: string) => Promise<void>;
  loadCurrentFiles: (options?: { force?: boolean }) => Promise<void>;
  loadCurrentFilesFromCache: () => void;
  navigatePath: (path: string) => Promise<void>;
  goParentPath: () => Promise<void>;
  setSelectedFile: (file?: FileEntryDto) => void;
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

  // Zoom actions
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

const defaultTabColor = "#4a8fe7";
let fileLoadRequestSeq = 0;
let fileLoadDebounceTimer: number | undefined;
const FILE_LOAD_DEBOUNCE_MS = 180;
const FILE_CACHE_FRESH_MS = 1500;
const dirCacheFreshAt: Record<string, number> = {};

function buildDirCacheKey(tab: AppTab, path: string): string {
  if (tab.kind === "ssh") {
    const hostKey = tab.sshAlias ?? tab.sessionId ?? "ssh";
    return `ssh:${hostKey}:${path}`;
  }
  return `local:${path}`;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

function makeTabFromSession(session: SessionDto): AppTab {
  return {
    id: crypto.randomUUID(),
    title: session.title,
    color: defaultTabColor,
    icon: session.kind === "ssh" ? "globe" : "terminal",
    kind: session.kind,
    sessionId: session.id,
    sshAlias: session.ssh_alias ?? undefined,
    shellProfile: session.shell
  };
}

async function persistUiState(state: Pick<AppState, "tabs" | "activeTabId">): Promise<void> {
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
    active_tab_id: state.activeTabId ?? null
  };
  await invoke("save_ui_state", { uiState: payload });
}

export const useAppStore = create<AppState>((set, get) => ({
  isInitialized: false,
  tabs: [],
  activeTabId: undefined,
  sidebarVisible: true,
  paletteOpen: false,
  settingsOpen: false,
  selectedSidebarTool: "files",
  settings: null,
  sshGroups: [],
  importedHosts: [],
  managedHosts: [],
  tabPaths: {},
  fileEntries: [],
  fileLoading: false,
  fileTransitioning: false,
  fileDisplayTabId: undefined,
  fileDisplayPath: undefined,
  fileError: undefined,
  selectedFile: undefined,
  lastToast: undefined,
  dirCache: {},
  tabMruOrder: [],

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

    const [settings, persisted, hosts] = await Promise.all([
      invoke<AppSettings>("load_settings").catch(() => null),
      invoke<PersistedUiState>("load_ui_state").catch(() => ({ tabs: [], active_tab_id: null })),
      invoke<SshHostsPayload>("load_ssh_hosts")
    ]);

    set({
      settings,
      importedHosts: hosts.imported,
      managedHosts: hosts.managed,
      sshGroups: hosts.groups
    });

    const restoredTabs: AppTab[] = [];
    for (const savedTab of persisted.tabs) {
      if (savedTab.kind === "local") {
        try {
          const session = await invoke<SessionDto>("create_local_session", {
            shellProfile: settings?.terminal.default_shell,
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
          kind: "ssh_picker",
          sshAlias: savedTab.ssh_alias
        });
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

    if (restoredTabs.length === 0) {
      await get().createLocalTab(settings?.terminal.default_shell ?? "powershell");
    } else {
      set({
        tabs: restoredTabs,
        activeTabId: persisted.active_tab_id ?? restoredTabs[0].id,
        fileTransitioning: true,
        selectedFile: undefined,
        isInitialized: true
      });
      get().loadCurrentFiles().catch(() => {});
    }

    set({ isInitialized: true });
  },

  createLocalTab: async (shellProfile) => {
    const session = await invoke<SessionDto>("create_local_session", {
      shellProfile,
      cwd: null
    });
    const tab = makeTabFromSession(session);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      fileTransitioning: true,
      selectedFile: undefined,
      tabMruOrder: [tab.id, ...state.tabMruOrder]
    }));
    await persistUiState(get());
    get().loadCurrentFiles().catch(() => {});
  },

  createSshPickerTab: () => {
    const tab: AppTab = {
      id: crypto.randomUUID(),
      title: "SSH",
      color: "#3dba84",
      icon: "globe",
      kind: "ssh_picker"
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
      fileTransitioning: false,
      selectedFile: undefined,
      tabMruOrder: [tab.id, ...state.tabMruOrder]
    }));
    void persistUiState(get());
  },

  connectSshTab: async (tabId, alias) => {
    const session = await invoke<SessionDto>("create_ssh_session", { hostAlias: alias });
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === tabId
          ? {
              ...tab,
              title: `SSH: ${alias}`,
              kind: "ssh",
              sessionId: session.id,
              sshAlias: alias,
              icon: "globe",
              color: "#3dba84"
            }
          : tab
      ),
      activeTabId: tabId,
      fileTransitioning: true,
      selectedFile: undefined
    }));
    await persistUiState(get());
    get().loadCurrentFiles().catch(() => {});
  },

  closeTab: async (tabId) => {
    const tab = get().tabs.find((item) => item.id === tabId);
    if (tab?.sessionId) {
      await invoke("close_terminal_session", { sessionId: tab.sessionId }).catch(() => undefined);
    }

    const tabs = get().tabs.filter((item) => item.id !== tabId);
    const mru = get().tabMruOrder.filter((id) => id !== tabId);
    const activeTabId = get().activeTabId === tabId
      ? (mru[0] ?? tabs[0]?.id)
      : get().activeTabId;
    set({
      tabs,
      activeTabId,
      tabMruOrder: mru,
      fileTransitioning: true,
      selectedFile: undefined
    });

    if (tabs.length === 0) {
      await get().createLocalTab(get().settings?.terminal.default_shell ?? "powershell");
      return;
    }

    await persistUiState(get());
    get().loadCurrentFilesFromCache();
    get().loadCurrentFiles().catch(() => {});
  },

  duplicateTab: async (tabId) => {
    const source = get().tabs.find((item) => item.id === tabId);
    if (!source) return;

    if (source.kind === "local") {
      await get().createLocalTab(source.shellProfile ?? get().settings?.terminal.default_shell ?? "powershell");
      return;
    }

    if (source.kind === "ssh" && source.sshAlias) {
      const newTabId = crypto.randomUUID();
      set((state) => ({
        tabs: [
          ...state.tabs,
          {
            id: newTabId,
            title: `SSH: ${source.sshAlias}`,
            color: source.color,
            icon: source.icon,
            kind: "ssh_picker"
          }
        ],
        activeTabId: newTabId
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
    void persistUiState(get());
  },

  setTabColor: (tabId, color) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === tabId ? { ...tab, color } : tab))
    }));
    void persistUiState(get());
  },

  setActiveTab: (tabId) => {
    if (get().activeTabId === tabId) return;

    set((state) => ({
      activeTabId: tabId,
      fileTransitioning: true,
      selectedFile: undefined,
      tabMruOrder: [tabId, ...state.tabMruOrder.filter((id) => id !== tabId)]
    }));
    void persistUiState(get());
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
    const { tabs, activeTabId } = get();
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const next = tabs[(idx + 1) % tabs.length];
    get().setActiveTab(next.id);
  },

  activatePrevTab: () => {
    const { tabs, activeTabId } = get();
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
    get().setActiveTab(prev.id);
  },

  activateTabByIndex: (index) => {
    const { tabs } = get();
    if (index >= 0 && index < tabs.length) {
      get().setActiveTab(tabs[index].id);
    }
  },

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  setPaletteOpen: (open) => set({ paletteOpen: open }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

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

  deleteHostGroup: async (groupId) => {
    await invoke("delete_ssh_group", { groupId });
    await get().refreshHosts();
  },

  loadCurrentFiles: async (options) => {
    const force = options?.force ?? false;
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;
    const requestTabId = activeTab.id;

    const currentPath =
      get().tabPaths[activeTab.id] ??
      (activeTab.kind === "ssh" ? "/" : "C:/");
    const requestSeq = ++fileLoadRequestSeq;

    // Show cached data instantly — only show loading spinner if no cache exists
    const cacheKey = buildDirCacheKey(activeTab, currentPath);
    const cached = get().dirCache[cacheKey];
    const isFresh = Date.now() - (dirCacheFreshAt[cacheKey] ?? 0) < FILE_CACHE_FRESH_MS;

    if (cached) {
      // Cache hit: show cached data immediately.
      set({
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: requestTabId,
        fileDisplayPath: currentPath,
        fileError: undefined
      });

      if (!force && isFresh) {
        return;
      }
    } else {
      // No cache: show loading indicator
      set({ fileLoading: true, fileTransitioning: true, fileError: undefined });
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
              showHidden: get().settings?.file_manager.show_hidden ?? false
            });

      const live = get();
      const liveTab = live.tabs.find((tab) => tab.id === requestTabId);
      const livePath = liveTab
        ? (live.tabPaths[requestTabId] ?? (liveTab.kind === "ssh" ? "/" : "C:/"))
        : undefined;
      if (requestSeq !== fileLoadRequestSeq || live.activeTabId !== requestTabId || livePath !== currentPath) {
        return;
      }

      set((state) => ({
        fileEntries: entries,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: requestTabId,
        fileDisplayPath: currentPath,
        selectedFile: undefined,
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
    }
  },

  loadCurrentFilesFromCache: () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    const currentPath =
      get().tabPaths[activeTab.id] ??
      (activeTab.kind === "ssh" ? "/" : "C:/");

    const cacheKey = buildDirCacheKey(activeTab, currentPath);
    const cached = get().dirCache[cacheKey];

    if (cached) {
      set({
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: activeTab.id,
        fileDisplayPath: currentPath,
        fileError: undefined
      });
      return;
    }

    set({ fileTransitioning: true });
  },

  navigatePath: async (path) => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    set((state) => ({
      tabPaths: { ...state.tabPaths, [activeTab.id]: path },
      fileTransitioning: true,
      selectedFile: undefined
    }));

    // Show cached immediately if available
    const cacheKey = buildDirCacheKey(activeTab, path);
    const cached = get().dirCache[cacheKey];
    if (cached) {
      set({
        fileEntries: cached,
        fileLoading: false,
        fileTransitioning: false,
        fileDisplayTabId: activeTab.id,
        fileDisplayPath: path,
        fileError: undefined
      });
    }

    await get().loadCurrentFiles();
  },

  goParentPath: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    const currentPath = get().tabPaths[activeTab.id] ?? (activeTab.kind === "ssh" ? "/" : "C:/");
    const normalized = currentPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const idx = normalized.lastIndexOf("/");
    if (idx <= 0) return;

    await get().navigatePath(normalized.slice(0, idx));
  },

  setSelectedFile: (file) => set({ selectedFile: file }),

  saveSettings: async (settings) => {
    await invoke("save_settings", { settings });
    set({ settings, settingsOpen: false });
    get().toast("Settings saved");
  },

  toast: (message) => {
    set({ lastToast: message });
    window.setTimeout(() => {
      if (get().lastToast === message) {
        set({ lastToast: undefined });
      }
    }, 1800);
  },

  // ── Editor actions ─────────────────────────────────────────────────

  openFile: async (path, mode, sessionId) => {
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

    try {
      const rawContent: string = sessionId
        ? await invoke<string>("read_remote_text_file", { sessionId, path })
        : await invoke<string>("read_text_file", { path });
      const normalizedContent = normalizeLineEndings(rawContent);

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
      };
      set((state) => ({
        editorFiles: [...state.editorFiles, file],
        activeEditorFileId: id,
        editorVisible: true,
      }));
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
      };
      set((state) => ({
        editorFiles: [...state.editorFiles, file],
        activeEditorFileId: id,
        editorVisible: true,
      }));
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
      set((state) => ({
        editorFiles: state.editorFiles.map((f) =>
          f.id === fileId ? { ...f, dirty: false, originalContent: f.content, error: undefined } : f
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

  // ── Zoom actions ───────────────────────────────────────────────────

  zoomIn: () => {
    set((state) => ({ zoomLevel: Math.min(200, state.zoomLevel + 10) }));
  },

  zoomOut: () => {
    set((state) => ({ zoomLevel: Math.max(50, state.zoomLevel - 10) }));
  },

  zoomReset: () => set({ zoomLevel: 100 }),
}));
