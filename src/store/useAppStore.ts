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
  fileError?: string;
  selectedFile?: FileEntryDto;
  lastToast?: string;
  dirCache: Record<string, FileEntryDto[]>;
  tabMruOrder: string[];

  // Editor state
  editorFiles: EditorFile[];
  activeEditorFileId?: string;
  editorVisible: boolean;
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
  deleteHostGroup: (groupId: string) => Promise<void>;
  loadCurrentFiles: () => Promise<void>;
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
  setEditorSplitPercent: (pct: number) => void;
  setEditorLanguage: (fileId: string, langId: string, langName: string) => void;
  hasUnsavedEditorFiles: () => boolean;

  // Zoom actions
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

const defaultTabColor = "#4a8fe7";

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
  fileError: undefined,
  selectedFile: undefined,
  lastToast: undefined,
  dirCache: {},
  tabMruOrder: [],

  // Editor state
  editorFiles: [],
  activeEditorFileId: undefined,
  editorVisible: false,
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
      activeTabId: tabId
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
    set({ tabs, activeTabId, tabMruOrder: mru });

    if (tabs.length === 0) {
      await get().createLocalTab(get().settings?.terminal.default_shell ?? "powershell");
      return;
    }

    await persistUiState(get());
    get().loadCurrentFilesFromCache();
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
    set((state) => ({
      activeTabId: tabId,
      tabMruOrder: [tabId, ...state.tabMruOrder.filter((id) => id !== tabId)]
    }));
    void persistUiState(get());
    get().loadCurrentFilesFromCache();
    get().loadCurrentFiles().catch(() => {});
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

  deleteHostGroup: async (groupId) => {
    await invoke("delete_ssh_group", { groupId });
    await get().refreshHosts();
  },

  loadCurrentFiles: async () => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    const currentPath =
      get().tabPaths[activeTab.id] ??
      (activeTab.kind === "ssh" ? "/" : "C:/");

    // Show cached data instantly — only show loading spinner if no cache exists
    const cacheKey = `${activeTab.kind === "ssh" ? "ssh:" : ""}${currentPath}`;
    const cached = get().dirCache[cacheKey];

    if (cached) {
      // Cache hit: show cached data immediately, fetch in background silently
      set({ fileEntries: cached, fileLoading: false, fileError: undefined });
    } else {
      // No cache: show loading indicator
      set({ fileLoading: true, fileError: undefined });
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

      set((state) => ({
        fileEntries: entries,
        fileLoading: false,
        tabPaths: { ...state.tabPaths, [activeTab.id]: currentPath },
        dirCache: { ...state.dirCache, [cacheKey]: entries }
      }));
    } catch (error) {
      set({
        fileLoading: false,
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

    const cacheKey = `${activeTab.kind === "ssh" ? "ssh:" : ""}${currentPath}`;
    const cached = get().dirCache[cacheKey];

    if (cached) {
      set({ fileEntries: cached, fileLoading: false, fileError: undefined });
    }
  },

  navigatePath: async (path) => {
    const activeTab = get().tabs.find((tab) => tab.id === get().activeTabId);
    if (!activeTab) return;

    set((state) => ({
      tabPaths: { ...state.tabPaths, [activeTab.id]: path }
    }));

    // Show cached immediately if available
    const cacheKey = `${activeTab.kind === "ssh" ? "ssh:" : ""}${path}`;
    const cached = get().dirCache[cacheKey];
    if (cached) {
      set({ fileEntries: cached, fileLoading: false, fileError: undefined });
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
      const content: string = sessionId
        ? await invoke<string>("read_remote_text_file", { sessionId, path })
        : await invoke<string>("read_text_file", { path });

      const file: EditorFile = {
        id,
        path,
        mode,
        content,
        originalContent: content,
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
    set((state) => ({
      editorFiles: state.editorFiles.map((f) =>
        f.id === fileId ? { ...f, content, dirty: content !== f.originalContent } : f
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

  setEditorSplitPercent: (pct) => set({ editorSplitPercent: Math.max(15, Math.min(85, pct)) }),

  setEditorLanguage: (fileId, langId, langName) => {
    set((state) => ({
      editorFiles: state.editorFiles.map((f) =>
        f.id === fileId ? { ...f, languageId: langId, languageName: langName } : f
      ),
    }));
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
