import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDirCacheKey,
  ensurePathHistorySeed,
  getRelativeHistoryTarget,
  getResolvedHistoryIndex,
  isConnectionError,
  makeTabFromSession,
  mergeWindowTabsIntoMainWindow,
  normalizeDisplayPath,
  normalizeLineEndings,
  pushPathHistory,
  reorderScopedTabIds,
} from "@/store/appStoreUtils";
import type { AppTab, SessionDto } from "@/types/models";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app store utils", () => {
  it("builds stable local and ssh cache keys", () => {
    const local: AppTab = { id: "tab-1", title: "Local", color: "#fff", icon: "terminal", kind: "local" };
    const ssh: AppTab = {
      id: "tab-2",
      title: "prod",
      color: "#fff",
      icon: "globe",
      kind: "ssh",
      sessionId: "session-1",
      sshAlias: "prod",
    };

    expect(buildDirCacheKey(local, "C:/")).toBe("local:visible:C:/");
    expect(buildDirCacheKey(local, "C:/", { showHidden: true })).toBe("local:all:C:/");
    expect(buildDirCacheKey(ssh, "/var/www")).toBe("ssh:prod:/var/www");
  });

  it("normalizes Windows line endings only", () => {
    expect(normalizeLineEndings("a\r\nb\nc")).toBe("a\nb\nc");
  });

  it("normalizes local and remote paths for display/history consistency", () => {
    expect(normalizeDisplayPath("C:\\Users\\demo\\")).toBe("C:/Users/demo");
    expect(normalizeDisplayPath("C:/")).toBe("C:/");
    expect(normalizeDisplayPath("/tmp//logs/")).toBe("/tmp/logs");
    expect(normalizeDisplayPath("var/log", { remote: true })).toBe("/var/log");
    expect(normalizeDisplayPath("//", { remote: true })).toBe("/");
  });

  it("recognizes connection-oriented errors", () => {
    expect(isConnectionError("channel closed")).toBe(true);
    expect(isConnectionError("Broken pipe")).toBe(true);
    expect(isConnectionError("permission denied")).toBe(false);
  });

  it("creates tabs from backend session DTOs", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "tab-id" });
    const session: SessionDto = {
      id: "session-id",
      kind: "ssh",
      title: "SSH: prod",
      shell: "russh",
      ssh_alias: "prod",
    };

    expect(makeTabFromSession(session)).toEqual({
      id: "tab-id",
      title: "SSH: prod",
      color: "#4a8fe7",
      icon: "globe",
      kind: "ssh",
      sessionId: "session-id",
      sshAlias: "prod",
      shellProfile: "russh",
    });
  });

  it("reorders tab ids to either edge without dropping the moved tab", () => {
    expect(reorderScopedTabIds(["a", "b", "c"], "a", "c", "after")).toEqual(["b", "c", "a"]);
    expect(reorderScopedTabIds(["a", "b", "c"], "c", "a", "before")).toEqual(["c", "a", "b"]);
    expect(reorderScopedTabIds(["a", "b", "c"], "b", "a", "before")).toEqual(["b", "a", "c"]);
    expect(reorderScopedTabIds(["a", "b", "c"], "b", "c", "after")).toEqual(["a", "c", "b"]);
  });

  it("merges detached window tab mappings back into main-window order without duplicates", () => {
    expect(mergeWindowTabsIntoMainWindow({
      main: ["a"],
      "terminal-1": ["b", "c"],
      "terminal-2": ["c", "d"],
    }, ["a", "b", "c", "d", "e"])).toEqual({
      main: ["a", "b", "c", "d", "e"],
    });
  });

  it("pushes path history while truncating stale forward entries by default", () => {
    expect(pushPathHistory(["/a", "/b", "/c"], 1, "/d")).toEqual({
      history: ["/a", "/b", "/d"],
      index: 2,
    });
  });

  it("preserves forward history when explicitly requested", () => {
    expect(pushPathHistory(["/a", "/b", "/c"], 1, "/d", { preserveForward: true })).toEqual({
      history: ["/a", "/b", "/c", "/d"],
      index: 3,
    });
  });

  it("does not duplicate the current path in history", () => {
    expect(pushPathHistory(["/a", "/b"], 1, "/b")).toEqual({
      history: ["/a", "/b"],
      index: 1,
    });
  });

  it("resolves missing or out-of-range history indices safely", () => {
    expect(getResolvedHistoryIndex([], undefined)).toBe(-1);
    expect(getResolvedHistoryIndex(["/a", "/b"], undefined)).toBe(1);
    expect(getResolvedHistoryIndex(["/a", "/b"], 9)).toBe(1);
    expect(getResolvedHistoryIndex(["/a", "/b"], -4)).toBe(0);
  });

  it("returns adjacent back and forward history targets when available", () => {
    expect(getRelativeHistoryTarget(["/a", "/b", "/c"], 1, "back")).toEqual({ index: 0, path: "/a" });
    expect(getRelativeHistoryTarget(["/a", "/b", "/c"], 1, "forward")).toEqual({ index: 2, path: "/c" });
    expect(getRelativeHistoryTarget(["/a", "/b", "/c"], 0, "back")).toEqual({ index: 0, path: undefined });
    expect(getRelativeHistoryTarget(["/a", "/b", "/c"], 2, "forward")).toEqual({ index: 2, path: undefined });
  });

  it("seeds initial history with the current path once", () => {
    expect(ensurePathHistorySeed([], undefined, "/a")).toEqual({
      history: ["/a"],
      index: 0,
      changed: true,
    });

    const existing = ["/a", "/b"];
    expect(ensurePathHistorySeed(existing, 1, "/b")).toEqual({
      history: existing,
      index: 1,
      changed: false,
    });
  });
});

describe("main window route", () => {
  it("uses the main window label outside detached terminal routes", async () => {
    vi.resetModules();
    const mockWindow = { label: "terminal-123" };
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => mockWindow,
      Window: {},
    }));
    vi.stubGlobal("window", { location: { hash: "" } });

    const mod = await import("@/store/useAppStore");
    expect(mod.resolveWindowLabel()).toBe("main");
  });

  it("does not leak detached tabs back into the main window when the main mapping is intentionally empty", async () => {
    vi.resetModules();
    const mockWindow = { label: "main" };
    vi.doMock("@tauri-apps/api/window", () => ({
      getCurrentWindow: () => mockWindow,
      Window: {},
    }));
    vi.stubGlobal("window", { location: { hash: "" } });

    const mod = await import("@/store/useAppStore");
    const tabs = [
      { id: "main-tab", title: "Main", color: "#fff", icon: "terminal", kind: "local" as const },
      { id: "detached-tab", title: "Detached", color: "#fff", icon: "terminal", kind: "local" as const },
    ];

    expect(mod.getWindowTabIds({
      tabs,
      windowTabs: {
        main: [],
        "terminal-1": ["detached-tab"],
      },
    }, "main")).toEqual([]);
  });
});
