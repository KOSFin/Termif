import type { CSSProperties } from "react";

export const OS_LOGO_META: Record<string, { color: string; name: string }> = {
  ubuntu: { color: "#E95420", name: "Ubuntu" },
  debian: { color: "#A80030", name: "Debian" },
  centos: { color: "#932279", name: "CentOS" },
  fedora: { color: "#294172", name: "Fedora" },
  arch: { color: "#1793D1", name: "Arch Linux" },
  alpine: { color: "#0D597F", name: "Alpine Linux" },
  rhel: { color: "#EE0000", name: "Red Hat Enterprise Linux" },
  rocky: { color: "#10B981", name: "Rocky Linux" },
  freebsd: { color: "#AB2B28", name: "FreeBSD" },
  windows: { color: "#0078D4", name: "Windows" },
  macos: { color: "#A2AAAD", name: "macOS" },
  linux: { color: "#F7C220", name: "Linux" },
};

interface OsLogoBadgeProps {
  os: string;
  version?: string;
  className?: string;
}

export function OsLogoBadge({ os, version, className }: OsLogoBadgeProps) {
  const meta = OS_LOGO_META[os] ?? OS_LOGO_META.linux;
  const title = version ? `${meta.name} ${version}` : meta.name;

  return (
    <span
      className={`os-logo-badge${className ? ` ${className}` : ""}`}
      style={{ "--os-logo-bg": meta.color } as CSSProperties}
      title={title}
      aria-label={title}
    >
      <OsLogoMark os={os} />
    </span>
  );
}

function OsLogoMark({ os }: { os: string }) {
  switch (os) {
    case "ubuntu":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" strokeWidth="2.1" />
          <circle cx="18.2" cy="7.2" r="2.35" />
          <circle cx="5.9" cy="7.3" r="2.35" />
          <circle cx="12" cy="19.2" r="2.35" />
          <path d="M14.9 9.2l2-1.2M9.1 9.1l-2-1.2M12 15.8v-2.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      );
    case "debian":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17.7 6.4c-2.2-2.2-6.7-2.2-9.1.1-2.8 2.7-2.1 6.9.9 8.5 2.6 1.4 5.8.3 6.4-2 .5-1.7-.7-3-2.2-3.2-1.4-.2-2.7.6-2.9 1.8-.2 1 .5 1.8 1.4 1.9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M8.6 18.4c3.9 1.5 8.8-.3 10.2-4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "centos":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l3.2 3.2H8.8L12 3zM21 12l-3.2 3.2V8.8L21 12zM12 21l-3.2-3.2h6.4L12 21zM3 12l3.2-3.2v6.4L3 12z" />
          <rect x="7.4" y="7.4" width="9.2" height="9.2" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "fedora":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.2 17.9a5.1 5.1 0 010-10.2h3.4v3.1H9.3a2 2 0 000 4h5.5a2.9 2.9 0 000-5.8h-1.1V5.8h1.1a6.1 6.1 0 010 12.1H9.2z" />
          <path d="M12.6 7.7h2.3v3.1h-2.3z" />
        </svg>
      );
    case "arch":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.1L21 20.5c-2.5-1.5-4.7-2.4-6.8-2.8l-2.2-4.4-2.2 4.4c-2.1.4-4.4 1.3-6.8 2.8L12 3.1z" />
          <path d="M12 7.5l1.4 3.1c-.9-.4-1.9-.4-2.8 0L12 7.5z" fill="var(--os-logo-bg)" opacity="0.6" />
        </svg>
      );
    case "alpine":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.8L9.6 6.2l3.1 5 2.1-2.7L21 17.8H3z" />
          <path d="M7.5 17.8l3.5-5.9 2 3.1 1.2-1.5 2.9 4.3H7.5z" fill="var(--os-logo-bg)" opacity="0.58" />
        </svg>
      );
    case "rhel":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 13.3c1.9-5.2 5-7.6 9.5-7.1 2.3.2 4.4 1.2 6.5 3-1.5.1-2.7.5-3.7 1.3-1.4 1.1-2.4 2.4-4.7 2.4H4z" />
          <path d="M4.7 14.8h14.7c-.8 2.2-3.4 3.6-7 3.6-3.5 0-6.1-1.2-7.7-3.6z" />
        </svg>
      );
    case "rocky":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.2l8.8 8.8-8.8 8.8L3.2 12 12 3.2z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M6.8 13.8L12 8.6l5.2 5.2-2.1 2.1L12 12.8l-3.1 3.1-2.1-2.1z" />
        </svg>
      );
    case "freebsd":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.4 7.1L5.9 3.8l4 1.7M16.6 7.1l1.5-3.3-4 1.7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 5.8a7.2 7.2 0 107.2 7.2A7.2 7.2 0 0012 5.8zm-2.8 7.1a1 1 0 110-2 1 1 0 010 2zm5.6 0a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      );
    case "windows":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3.8 5.2l7.1-.9v7.1H3.8V5.2zm8.4-1l8-.9v8.1h-8V4.2zM3.8 12.7h7.1v7.1l-7.1-.9v-6.2zm8.4 0h8v8.1l-8-.9v-7.2z" />
        </svg>
      );
    case "macos":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15.4 3.2c.1 1.4-.5 2.6-1.3 3.5-.8.9-1.9 1.5-3.1 1.4-.1-1.2.5-2.5 1.3-3.3.9-.9 2.1-1.6 3.1-1.6zM19.1 16.5c-.5 1.2-.8 1.8-1.5 2.9-1 1.5-2.4 3.3-4.1 3.3-1.5 0-1.9-1-3.9-1s-2.5 1-3.9 1c-1.7 0-3-1.7-4-3.2C-1 15.1.5 8.5 5.1 8.2c1.8-.1 3 .9 4 .9s2.7-1.1 4.6-.9c.8 0 3 .3 4.4 2.4-3.9 2.1-3.3 6 .9 5.9z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.2 14.5c-.8 1-1.2 2.2-1.2 3.6 0 1.6 2.6 2.9 6 2.9s6-1.3 6-2.9c0-1.4-.4-2.6-1.2-3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8.1 12.5c0-4.2 1.2-8.2 3.9-8.2s3.9 4 3.9 8.2c0 2.5-1.7 4.2-3.9 4.2s-3.9-1.7-3.9-4.2z" />
          <circle cx="10.6" cy="10.4" r=".8" fill="var(--os-logo-bg)" />
          <circle cx="13.4" cy="10.4" r=".8" fill="var(--os-logo-bg)" />
        </svg>
      );
  }
}
