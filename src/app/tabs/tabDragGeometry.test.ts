import { describe, expect, it } from "vitest";
import { pickInsertionSlot, type TabSlot } from "./tabDragGeometry";

// Three tabs at rest, dragged tab already removed from the slot list.
// Centers: a=50, b=150, c=250 (each 100px wide, boundaries at 100 and 200).
const slots: TabSlot[] = [
  { id: "a", center: 50 },
  { id: "b", center: 150 },
  { id: "c", center: 250 },
];

describe("pickInsertionSlot", () => {
  it("returns undefined when there are no slots", () => {
    expect(pickInsertionSlot([], 123)).toBeUndefined();
  });

  it("picks 'before' the first slot when pointer is left of its center", () => {
    expect(pickInsertionSlot(slots, 0)).toEqual({ tabId: "a", side: "before" });
    expect(pickInsertionSlot(slots, 49)).toEqual({ tabId: "a", side: "before" });
  });

  it("treats a pointer exactly on a center as 'before' that slot", () => {
    expect(pickInsertionSlot(slots, 50)).toEqual({ tabId: "a", side: "before" });
    expect(pickInsertionSlot(slots, 150)).toEqual({ tabId: "b", side: "before" });
  });

  it("picks the next slot's 'before' once past the previous center", () => {
    expect(pickInsertionSlot(slots, 51)).toEqual({ tabId: "b", side: "before" });
    expect(pickInsertionSlot(slots, 151)).toEqual({ tabId: "c", side: "before" });
  });

  it("appends 'after' the last slot when pointer is past every center", () => {
    expect(pickInsertionSlot(slots, 251)).toEqual({ tabId: "c", side: "after" });
    expect(pickInsertionSlot(slots, 9999)).toEqual({ tabId: "c", side: "after" });
  });

  it("is monotonic: the resolved slot index never decreases as the pointer moves right", () => {
    // This is the property that guarantees no jiggle — a sweep left→right must
    // produce a non-decreasing sequence of insertion indices.
    const order = ["a-before", "b-before", "c-before", "c-after"];
    let lastRank = -1;
    for (let x = -20; x <= 320; x += 1) {
      const slot = pickInsertionSlot(slots, x);
      const key = slot ? `${slot.tabId}-${slot.side}` : "none";
      const rank = order.indexOf(key);
      expect(rank).toBeGreaterThanOrEqual(lastRank);
      lastRank = rank;
    }
  });

  it("shifts slot boundaries by the scroll delta", () => {
    // Content scrolled right by 100px: a tab snapshotted at center 150 now appears
    // at viewport 50, so a pointer at viewport 50 resolves as 'before' b.
    expect(pickInsertionSlot(slots, 50, 100)).toEqual({ tabId: "b", side: "before" });
    expect(pickInsertionSlot(slots, 50, -100)).toEqual({ tabId: "a", side: "before" });
  });
});
