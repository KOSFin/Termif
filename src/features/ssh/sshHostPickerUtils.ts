export const OS_CACHE_KEY = "termif.host_os_cache";

export interface OsInfo {
  os: string;
  version?: string;
}

const HOST_COLORS = [
  "#4a8fe7", "#3dba84", "#e0a84a", "#e05468",
  "#9a7ce5", "#5fb4d4", "#d47ea8", "#7cb87a",
  "#f06292", "#4db6ac", "#ff8a65", "#a1887f",
];

export function getHostColor(alias: string): string {
  let hash = 0;
  for (let i = 0; i < alias.length; i++) {
    hash = alias.charCodeAt(i) + ((hash << 5) - hash);
  }
  return HOST_COLORS[Math.abs(hash) % HOST_COLORS.length];
}

export function getInitial(value: string): string {
  return (value[0] ?? "?").toUpperCase();
}

export function loadOsCache(): Record<string, OsInfo> {
  try {
    const raw = localStorage.getItem(OS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, OsInfo>) : {};
  } catch {
    return {};
  }
}
