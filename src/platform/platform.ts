export type DesktopPlatform = "windows" | "macos" | "linux";

export interface ShellProfileOption {
  id: string;
  label: string;
  family: "windows" | "posix";
}

function detectDesktopPlatform(): DesktopPlatform {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform.toLowerCase();

  if (ua.includes("mac os") || platform.includes("mac")) return "macos";
  if (ua.includes("windows") || platform.includes("win")) return "windows";
  return "linux";
}

export const desktopPlatform = detectDesktopPlatform();
export const isMacLike = desktopPlatform === "macos";
export const isWindows = desktopPlatform === "windows";

export const platformClassName = `platform-${desktopPlatform}`;

export function getPlatformModLabel(): "Ctrl" | "Cmd" {
  return isMacLike ? "Cmd" : "Ctrl";
}

export function getDefaultLocalPath(): string {
  return isWindows ? "C:/" : "/";
}

export function getDefaultShellProfile(): string {
  if (isWindows) return "powershell";
  if (isMacLike) return "zsh";
  return "bash";
}

export function getShellProfileOptions(): ShellProfileOption[] {
  if (isWindows) {
    return [
      { id: "powershell", label: "PowerShell", family: "windows" },
      { id: "cmd", label: "CMD", family: "windows" },
      { id: "pwsh", label: "PowerShell 7", family: "windows" },
    ];
  }

  const base: ShellProfileOption[] = [
    { id: "zsh", label: "Zsh", family: "posix" },
    { id: "bash", label: "Bash", family: "posix" },
    { id: "fish", label: "Fish", family: "posix" },
  ];

  return isMacLike
    ? [...base, { id: "pwsh", label: "PowerShell 7", family: "posix" }]
    : [
        { id: "bash", label: "Bash", family: "posix" },
        { id: "zsh", label: "Zsh", family: "posix" },
        { id: "fish", label: "Fish", family: "posix" },
        { id: "sh", label: "Sh", family: "posix" },
        { id: "pwsh", label: "PowerShell 7", family: "posix" },
      ];
}

export function isShellProfileAvailable(shellProfile?: string): boolean {
  if (!shellProfile) return false;
  return getShellProfileOptions().some((option) => option.id === shellProfile);
}

export function coerceShellProfile(shellProfile?: string | null): string {
  if (shellProfile && isShellProfileAvailable(shellProfile)) {
    return shellProfile;
  }
  return getDefaultShellProfile();
}

export function isPosixShell(shellProfile?: string): boolean {
  const id = shellProfile ?? getDefaultShellProfile();
  return id === "zsh" || id === "bash" || id === "fish" || id === "sh";
}

export function platformShortcut(combo: string): string {
  return isMacLike ? combo.replace(/\bCtrl\b/g, "Meta") : combo;
}

export function displayShortcut(combo: string): string {
  return platformShortcut(combo)
    .replace(/\bMeta\b/g, "Cmd")
    .replace(/\bCtrl\b/g, "Ctrl")
    .replace(/\bAlt\b/g, isMacLike ? "Option" : "Alt");
}

export function appShortcutTitle(label: string, combo: string): string {
  return `${label} (${displayShortcut(combo)})`;
}
