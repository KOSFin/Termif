import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPlatform(platform: string, userAgent: string) {
  vi.resetModules();
  vi.stubGlobal("navigator", { platform, userAgent });
  return import("./platform");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("platform detection", () => {
  it("uses Windows defaults", async () => {
    const platform = await loadPlatform("Win32", "Mozilla/5.0 Windows");

    expect(platform.desktopPlatform).toBe("windows");
    expect(platform.getDefaultShellProfile()).toBe("powershell");
    expect(platform.getDefaultLocalPath()).toBe("C:/");
    expect(platform.platformShortcut("Ctrl+T")).toBe("Ctrl+T");
  });

  it("uses macOS defaults and Command shortcuts", async () => {
    const platform = await loadPlatform("MacIntel", "Mozilla/5.0 Mac OS X");

    expect(platform.desktopPlatform).toBe("macos");
    expect(platform.getDefaultShellProfile()).toBe("zsh");
    expect(platform.getDefaultLocalPath()).toBe("/");
    expect(platform.platformShortcut("Ctrl+Shift+P")).toBe("Meta+Shift+P");
    expect(platform.displayShortcut("Ctrl+,")).toBe("Cmd+,");
  });

  it("uses Linux defaults", async () => {
    const platform = await loadPlatform("Linux x86_64", "Mozilla/5.0 X11; Linux x86_64");

    expect(platform.desktopPlatform).toBe("linux");
    expect(platform.getDefaultShellProfile()).toBe("bash");
    expect(platform.getDefaultLocalPath()).toBe("/");
  });

  it("coerces unavailable shell profiles to platform default", async () => {
    const platform = await loadPlatform("MacIntel", "Mozilla/5.0 Mac OS X");

    expect(platform.coerceShellProfile("cmd")).toBe("zsh");
    expect(platform.coerceShellProfile("fish")).toBe("fish");
    expect(platform.isPosixShell("zsh")).toBe(true);
    expect(platform.isPosixShell("pwsh")).toBe(false);
  });
});
