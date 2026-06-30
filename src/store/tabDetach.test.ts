import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersistedUiState } from "@/types/models";

// Regression coverage for browser-style tab tear-off.
//
// The bug: a "collapse all detached windows back into main" routine — correct
// only at cold start, where solely the main window is recreated by the OS — was
// also running inside persistUiState and syncWindowStateFromBackend during live
// operation. That yanked a freshly torn-off tab back into main before the new
// window could read it (empty new window), and resurrected a tab in main when
// its detached window was closed. These tests pin the persisted layout so the
// collapse can never creep back into the live persist path.

interface FakeWindow {
  label: string;
  show: () => Promise<void>;
  setFocus: () => Promise<void>;
  destroy: () => Promise<void>;
  close: () => Promise<void>;
  outerPosition: () => Promise<{ x: number; y: number }>;
  outerSize: () => Promise<{ width: number; height: number }>;
  isMaximized: () => Promise<boolean>;
}

const makeFakeWindow = (label: string): FakeWindow => ({
  label,
  show: () => Promise.resolve(),
  setFocus: () => Promise.resolve(),
  destroy: () => Promise.resolve(),
  close: () => Promise.resolve(),
  outerPosition: () => Promise.resolve({ x: 0, y: 0 }),
  outerSize: () => Promise.resolve({ width: 1100, height: 760 }),
  isMaximized: () => Promise.resolve(false),
});

/** In-memory stand-in for the persisted ui_state.json on the Rust side. */
let storedUiState: PersistedUiState;
let savedPayloads: PersistedUiState[];
let knownSessions: Set<string>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  switch (cmd) {
    case "load_ui_state":
      return clone(storedUiState);
    case "save_ui_state": {
      const payload = (args?.uiState as PersistedUiState) ?? storedUiState;
      storedUiState = clone(payload);
      savedPayloads.push(clone(payload));
      return undefined;
    }
    case "create_local_session": {
      const id = `session-${knownSessions.size + 1}`;
      knownSessions.add(id);
      return { id, kind: "local", title: "local", cwd: "/home/user" };
    }
    case "get_terminal_session": {
      const sessionId = args?.sessionId as string;
      if (knownSessions.has(sessionId)) {
        return { id: sessionId, kind: "local", title: "local", cwd: "/home/user" };
      }
      throw new Error("session gone");
    }
    case "close_terminal_session": {
      knownSessions.delete(args?.sessionId as string);
      return undefined;
    }
    case "load_settings":
      return null;
    case "load_ssh_hosts":
      return { imported: [], managed: [], groups: [] };
    case "get_home_dir":
      return "/home/user";
    case "list_local_entries":
      return [];
    default:
      return undefined;
  }
});

const emitMock = vi.fn(async (..._args: unknown[]) => undefined);

let currentWindowLabel = "main";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => invokeMock(cmd, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...a: unknown[]) => emitMock(...a),
  listen: () => Promise.resolve(() => undefined),
}));

vi.mock("@tauri-apps/api/dpi", () => ({
  PhysicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
  PhysicalSize: class {
    constructor(public width: number, public height: number) {}
  },
  LogicalPosition: class {
    constructor(public x: number, public y: number) {}
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => makeFakeWindow(currentWindowLabel),
  Window: {
    getByLabel: (label: string) => Promise.resolve(makeFakeWindow(label)),
    getAll: () => Promise.resolve([makeFakeWindow("main")]),
  },
  Effect: { WindowBackground: "windowBackground" },
  EffectState: { Active: "active" },
}));

const openedWindows: string[] = [];
vi.mock("@/app/windows/windowing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/windows/windowing")>();
  return {
    ...actual,
    openTerminalWorkspaceWindow: (label: string) => {
      openedWindows.push(label);
      return { once: () => undefined };
    },
  };
});

vi.mock("@/theme/themeEngine", () => ({
  applyAppearanceOverrides: () => undefined,
  applyAppearanceTheme: () => undefined,
  watchSystemTheme: () => undefined,
}));

vi.mock("@/features/file_manager/editorWindow", () => ({
  isEditorPopoutLive: () => false,
  requestOpenFileInEditorWindow: () => Promise.resolve(),
}));

vi.mock("@/features/terminal/terminalLogStore", () => ({
  clearTerminalLog: () => undefined,
}));

const emptyUiState = (): PersistedUiState => ({
  tabs: [],
  active_tab_id: null,
  sidebar_visible: true,
  selected_sidebar_tool: "files",
  sidebar_width: 280,
  file_history: {},
  file_history_index: {},
  window_tabs: { main: [] },
  active_tab_by_window: { main: null },
  window_states: {},
});

const importStore = async () => {
  vi.resetModules();
  const mod = await import("@/store/useAppStore");
  return mod.useAppStore;
};

beforeEach(() => {
  storedUiState = emptyUiState();
  savedPayloads = [];
  knownSessions = new Set();
  openedWindows.length = 0;
  currentWindowLabel = "main";
  vi.stubGlobal("window", { location: { hash: "" } });
  vi.stubGlobal("crypto", { randomUUID: () => `uuid-${Math.random().toString(16).slice(2)}` });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("tab tear-off persistence", () => {
  it("keeps a torn-off tab assigned to its new window instead of collapsing it into main", async () => {
    const useAppStore = await importStore();
    const store = useAppStore.getState;

    // Two local tabs in the main window.
    const tabA = await store().createLocalTab();
    const tabB = await store().createLocalTab();
    expect(store().windowTabs.main).toEqual([tabA, tabB]);

    // Tear tab B off into a brand-new detached window.
    await store().detachTabToNewWindow(tabB, "main");

    const detachedLabel = openedWindows.at(-1)!;
    expect(detachedLabel).toMatch(/^terminal-/);

    // Live state: B left main and lives in the detached window.
    expect(store().windowTabs.main).toEqual([tabA]);
    expect(store().windowTabs[detachedLabel]).toEqual([tabB]);

    // Persisted state on disk must reflect the same split — NOT collapse B back
    // into main. This is the assertion that catches the original bug.
    expect(storedUiState.window_tabs?.main).toEqual([tabA]);
    expect(storedUiState.window_tabs?.[detachedLabel]).toEqual([tabB]);
  });

  it("does not resurrect a detached window's tab in main when that window is closed", async () => {
    const useAppStore = await importStore();
    const store = useAppStore.getState;

    const tabA = await store().createLocalTab();
    const tabB = await store().createLocalTab();
    await store().detachTabToNewWindow(tabB, "main");
    const detachedLabel = openedWindows.at(-1)!;

    // Closing the detached window kills its session and drops its tab for good.
    await store().closeDetachedWindow(detachedLabel);

    expect(store().tabs.some((tab) => tab.id === tabB)).toBe(false);
    expect(store().windowTabs.main).toEqual([tabA]);
    expect(storedUiState.window_tabs?.[detachedLabel]).toBeUndefined();
    expect(storedUiState.tabs.some((tab) => tab.id === tabB)).toBe(false);

    // A subsequent main-window sync must not bring B back from the dead.
    await store().syncWindowStateFromBackend("main");
    expect(store().windowTabs.main).toEqual([tabA]);
    expect(store().tabs.some((tab) => tab.id === tabB)).toBe(false);
  });

  it("still folds detached tabs into main on a cold-start initialize", async () => {
    // Simulate a restart: persisted state has a tab stranded in a detached
    // window whose OS window will never be recreated.
    const useAppStore = await importStore();

    const localTabId = "tab-main";
    const strandedId = "tab-detached";
    storedUiState = {
      ...emptyUiState(),
      tabs: [
        { id: localTabId, title: "A", color: "#fff", icon: "terminal", kind: "local", session_id: null, ssh_alias: null },
        { id: strandedId, title: "B", color: "#fff", icon: "terminal", kind: "local", session_id: null, ssh_alias: null },
      ],
      window_tabs: { main: [localTabId], "terminal-old": [strandedId] },
      active_tab_by_window: { main: localTabId, "terminal-old": strandedId },
    };

    await useAppStore.getState().initialize();

    const state = useAppStore.getState();
    // Cold start collapses everything into the one window that actually booted.
    expect(state.windowTabs["terminal-old"]).toBeUndefined();
    expect(state.windowTabs.main).toEqual(expect.arrayContaining([localTabId, strandedId]));
  });
});
