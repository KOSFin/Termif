import type { AppTab, SessionDto } from "@/types/models";

const defaultTabColor = "#4a8fe7";

export function buildDirCacheKey(tab: AppTab, path: string, options?: { showHidden?: boolean }): string {
  if (tab.kind === "ssh") {
    const hostKey = tab.sshAlias ?? tab.sessionId ?? "ssh";
    return `ssh:${hostKey}:${path}`;
  }
  return `local:${options?.showHidden ? "all" : "visible"}:${path}`;
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
