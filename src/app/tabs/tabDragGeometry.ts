// Pure geometry helpers for tab drag-reordering.
//
// The tab strip reorders tabs live during a drag using a FLIP animation. If the
// insertion target were computed by hit-testing the live DOM (elementFromPoint /
// getBoundingClientRect), it would read tabs mid-animation and oscillate between
// two targets — the "jiggle". Instead we snapshot slot centers once at drag start
// and resolve every subsequent pointer position against that static snapshot, so
// a given cursor X maps to exactly one insertion slot (a monotonic mapping that
// makes the flicker mathematically impossible).

export interface TabSlot {
  id: string;
  /** Viewport-space X of the slot's horizontal center, captured at drag start. */
  center: number;
}

export type LocalDropTarget =
  | { insideStrip: false }
  | { insideStrip: true; tabId?: string; side?: "before" | "after" };

/**
 * Pick the insertion slot for a pointer position from a static set of slot
 * centers. `slots` must exclude the dragged tab and be sorted left→right.
 *
 * @param slots      slot centers (sorted ascending, dragged tab removed)
 * @param pointerX   cursor X in viewport space
 * @param scrollDelta horizontal scroll since the snapshot was taken
 */
export function pickInsertionSlot(
  slots: TabSlot[],
  pointerX: number,
  scrollDelta = 0
): { tabId: string; side: "before" | "after" } | undefined {
  if (slots.length === 0) return undefined;
  for (const slot of slots) {
    // The first slot whose (scroll-adjusted) center is at/right of the pointer
    // is the "before" target.
    if (pointerX <= slot.center - scrollDelta) {
      return { tabId: slot.id, side: "before" };
    }
  }
  // Past the last center — append after the rightmost slot.
  const last = slots[slots.length - 1];
  return { tabId: last.id, side: "after" };
}
