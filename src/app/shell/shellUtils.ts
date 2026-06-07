export function formatClock(date: Date, timeZone?: string): string {
  try {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
}

export function classifyPercent(value: number | null): "ok" | "warn" | "danger" {
  if (value === null || Number.isNaN(value)) return "ok";
  if (value >= 90) return "danger";
  if (value >= 75) return "warn";
  return "ok";
}

export function looksLikeDisconnected(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes("channel send") ||
    text.includes("session not found") ||
    text.includes("channel closed") ||
    text.includes("connection") ||
    text.includes("broken pipe") ||
    text.includes("timeout")
  );
}
