const LOG_KEY_PREFIX = "termif.terminal.log.";
const MAX_LOG_CHARS = 500_000;

function keyForTab(tabId: string) {
  return `${LOG_KEY_PREFIX}${tabId}`;
}

export function loadTerminalLog(tabId: string): string {
  try {
    return window.localStorage.getItem(keyForTab(tabId)) ?? "";
  } catch {
    return "";
  }
}

export function appendTerminalLog(tabId: string, chunk: string) {
  if (!chunk) return;

  try {
    const key = keyForTab(tabId);
    const current = window.localStorage.getItem(key) ?? "";
    const next = `${current}${chunk}`;
    window.localStorage.setItem(
      key,
      next.length > MAX_LOG_CHARS ? next.slice(next.length - MAX_LOG_CHARS) : next,
    );
  } catch {
    // Best-effort history; quota and private-mode failures should not affect PTY IO.
  }
}

export function clearTerminalLog(tabId: string) {
  try {
    window.localStorage.removeItem(keyForTab(tabId));
  } catch {
    // ignore
  }
}
