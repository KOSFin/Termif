import { describe, expect, it } from "vitest";
import { classifyPercent, formatClock, looksLikeDisconnected } from "@/app/shell/shellUtils";

describe("shell utils", () => {
  it("classifies resource usage thresholds", () => {
    expect(classifyPercent(null)).toBe("ok");
    expect(classifyPercent(Number.NaN)).toBe("ok");
    expect(classifyPercent(74.9)).toBe("ok");
    expect(classifyPercent(75)).toBe("warn");
    expect(classifyPercent(90)).toBe("danger");
  });

  it("detects disconnect-like messages", () => {
    expect(looksLikeDisconnected("session not found")).toBe(true);
    expect(looksLikeDisconnected("network timeout")).toBe(true);
    expect(looksLikeDisconnected("file not found")).toBe(false);
  });

  it("formats clocks without throwing on invalid timezone", () => {
    const date = new Date(Date.UTC(2026, 0, 1, 12, 30, 5));

    expect(formatClock(date, "UTC")).toMatch(/12:30:05|12:30:05/);
    expect(formatClock(date, "Not/AZone")).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
