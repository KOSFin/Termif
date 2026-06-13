import { afterEach, describe, expect, it, vi } from "vitest";

async function loadContextMenu(platform: string, userAgent: string) {
  vi.resetModules();
  vi.stubGlobal("navigator", { platform, userAgent });
  return import("./ContextMenu");
}

function stubWindowSize(innerWidth: number, innerHeight: number) {
  vi.stubGlobal("window", { innerWidth, innerHeight });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("context menu geometry", () => {
  it("clamps menus into the viewport on non-mac platforms", async () => {
    stubWindowSize(1000, 800);
    const { clampMenuPoint } = await loadContextMenu("Win32", "Mozilla/5.0 Windows");

    expect(clampMenuPoint({ x: 980, y: 790 }, { width: 180, height: 140 })).toEqual({ x: 800, y: 650 });
  });

  it("allows overflow on macOS when explicitly requested", async () => {
    stubWindowSize(1000, 800);
    const { clampMenuPoint } = await loadContextMenu("MacIntel", "Mozilla/5.0 Mac OS X");

    expect(
      clampMenuPoint(
        { x: 980, y: 790 },
        { width: 180, height: 140 },
        { allowViewportOverflowOnMac: true }
      )
    ).toEqual({ x: 980, y: 790 });
  });

  it("anchors dropdowns above the trigger when there is no space below", async () => {
    stubWindowSize(1200, 800);
    const { anchorMenuFromRect } = await loadContextMenu("Win32", "Mozilla/5.0 Windows");

    expect(
      anchorMenuFromRect(
        { left: 300, right: 380, top: 760, bottom: 792 },
        { width: 188, height: 240 },
        "bottom-end"
      )
    ).toEqual({ x: 192, y: 552 });
  });
});
