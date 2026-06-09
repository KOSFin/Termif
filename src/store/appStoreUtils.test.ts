import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDirCacheKey,
  isConnectionError,
  makeTabFromSession,
  normalizeLineEndings,
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
});
