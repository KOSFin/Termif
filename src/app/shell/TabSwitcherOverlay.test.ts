import { describe, expect, it } from "vitest";
import { getOrderedSwitcherTabs } from "@/app/shell/TabSwitcherOverlay";
import type { AppTab } from "@/types/models";

const tabs: AppTab[] = [
  { id: "a", title: "A", color: "#1", icon: "terminal", kind: "local" },
  { id: "b", title: "B", color: "#2", icon: "terminal", kind: "local" },
  { id: "c", title: "C", color: "#3", icon: "terminal", kind: "local" },
];

describe("tab switcher ordering", () => {
  it("preserves positional order when MRU is disabled", () => {
    expect(getOrderedSwitcherTabs(tabs, ["c", "a"], false).map((tab) => tab.id)).toEqual(["a", "b", "c"]);
  });

  it("places MRU tabs first and appends missing tabs", () => {
    expect(getOrderedSwitcherTabs(tabs, ["c", "a"], true).map((tab) => tab.id)).toEqual(["c", "a", "b"]);
  });

  it("ignores stale MRU ids", () => {
    expect(getOrderedSwitcherTabs(tabs, ["x", "b"], true).map((tab) => tab.id)).toEqual(["b", "a", "c"]);
  });
});
