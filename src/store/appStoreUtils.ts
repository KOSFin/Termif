import type { AppTab, SessionDto } from "@/types/models";

const defaultTabColor = "#4a8fe7";

export function buildDirCacheKey(tab: AppTab, path: string, options?: { showHidden?: boolean }): string {
  if (tab.kind === "ssh") {
    const hostKey = tab.sshAlias ?? tab.sessionId ?? "ssh";
    return `ssh:${hostKey}:${path}`;
  }
  return `local:${options?.showHidden ? "all" : "visible"}:${path}`;
}

export function normalizeDisplayPath(path: string, options?: { remote?: boolean }): string {
  const remote = options?.remote ?? false;
  const fallback = remote ? "/" : "/";
  const trimmed = path.trim();
  if (!trimmed) return fallback;

  const slashNormalized = trimmed.replace(/\\/g, "/");

  if (remote) {
    const ensuredRoot = slashNormalized.startsWith("/") ? slashNormalized : `/${slashNormalized}`;
    const collapsed = ensuredRoot.replace(/\/+/g, "/");
    if (collapsed === "/") return "/";
    return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  }

  const driveRootMatch = /^([A-Za-z]:)(?:\/+)?$/.exec(slashNormalized);
  if (driveRootMatch) {
    return `${driveRootMatch[1]}/`;
  }

  if (/^[A-Za-z]:/.test(slashNormalized)) {
    const collapsed = slashNormalized.replace(/\/+/g, "/");
    return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
  }

  const ensuredRoot = slashNormalized.startsWith("/") ? slashNormalized : `/${slashNormalized}`;
  const collapsed = ensuredRoot.replace(/\/+/g, "/");
  if (collapsed === "/") return "/";
  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n");
}

export function isConnectionError(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("channel send") ||
    text.includes("channel closed") ||
    text.includes("session not found") ||
    text.includes("connection") ||
    text.includes("broken pipe") ||
    text.includes("timeout")
  );
}

export function makeTabFromSession(session: SessionDto): AppTab {
  return {
    id: crypto.randomUUID(),
    title: session.title,
    color: defaultTabColor,
    icon: session.kind === "ssh" ? "globe" : "terminal",
    kind: session.kind,
    sessionId: session.id,
    sshAlias: session.ssh_alias ?? undefined,
    shellProfile: session.shell,
  };
}

export function reorderScopedTabIds(
  scopedIds: string[],
  fromTabId: string,
  toTabId: string,
  side: "before" | "after" = "before"
): string[] {
  if (fromTabId === toTabId) {
    return [...scopedIds];
  }

  const fromIndex = scopedIds.findIndex((id) => id === fromTabId);
  const toIndex = scopedIds.findIndex((id) => id === toTabId);
  if (fromIndex < 0 || toIndex < 0) {
    return [...scopedIds];
  }

  const ids = [...scopedIds];
  const [moved] = ids.splice(fromIndex, 1);
  const targetIndex = ids.findIndex((id) => id === toTabId);
  const insertIndex = targetIndex < 0 ? ids.length : targetIndex + (side === "after" ? 1 : 0);
  ids.splice(insertIndex, 0, moved);
  return ids;
}

export function getResolvedHistoryIndex(history: string[], currentIndex?: number): number {
  if (history.length === 0) return -1;
  if (typeof currentIndex !== "number" || !Number.isFinite(currentIndex)) {
    return history.length - 1;
  }
  return Math.max(0, Math.min(history.length - 1, currentIndex));
}

export function pushPathHistory(
  history: string[],
  currentIndex: number | undefined,
  path: string,
  options?: { preserveForward?: boolean }
): { history: string[]; index: number } {
  const preserveForward = options?.preserveForward ?? false;
  const resolvedIndex = getResolvedHistoryIndex(history, currentIndex);
  const base = preserveForward ? history : history.slice(0, resolvedIndex + 1);

  if (base[base.length - 1] === path) {
    return {
      history: base,
      index: Math.max(0, base.length - 1),
    };
  }

  const nextHistory = [...base, path];
  return {
    history: nextHistory,
    index: nextHistory.length - 1,
  };
}

export function getRelativeHistoryTarget(
  history: string[],
  currentIndex: number | undefined,
  direction: "back" | "forward"
): { index: number; path?: string } {
  const resolvedIndex = getResolvedHistoryIndex(history, currentIndex);
  if (resolvedIndex < 0) {
    return { index: -1, path: undefined };
  }

  const nextIndex = direction === "back" ? resolvedIndex - 1 : resolvedIndex + 1;
  if (nextIndex < 0 || nextIndex >= history.length) {
    return { index: resolvedIndex, path: undefined };
  }

  return { index: nextIndex, path: history[nextIndex] };
}
