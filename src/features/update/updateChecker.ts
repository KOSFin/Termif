import { getVersion } from "@tauri-apps/api/app";

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseUrl: string;
  publishedAt?: string;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  prerelease?: boolean;
  draft?: boolean;
}

const UPDATE_REPO = import.meta.env.VITE_UPDATE_REPO?.trim() ?? "";

export function isUpdateCheckConfigured(): boolean {
  return UPDATE_REPO.includes("/");
}

export async function checkForGitHubUpdate(): Promise<UpdateInfo | null> {
  if (!isUpdateCheckConfigured()) return null;

  const currentVersion = normalizeVersion(await getVersion());
  const release = await fetchLatestRelease(UPDATE_REPO);
  if (!release || release.draft || release.prerelease || !release.tag_name || !release.html_url) {
    return null;
  }

  const latestVersion = normalizeVersion(release.tag_name);
  if (!isVersionNewer(latestVersion, currentVersion)) return null;

  return {
    currentVersion,
    latestVersion,
    releaseName: release.name ?? release.tag_name,
    releaseUrl: release.html_url,
    publishedAt: release.published_at,
  };
}

async function fetchLatestRelease(repo: string): Promise<GitHubRelease | null> {
  const response = await window.fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<GitHubRelease>;
}

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "").split("+")[0];
}

function isVersionNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] > b.parts[i]) return true;
    if (a.parts[i] < b.parts[i]) return false;
  }

  if (a.prerelease && !b.prerelease) return false;
  if (!a.prerelease && b.prerelease) return true;
  return candidate !== current && candidate.localeCompare(current, undefined, { numeric: true }) > 0;
}

function parseSemver(value: string): { parts: [number, number, number]; prerelease: string } {
  const [core, prerelease = ""] = value.split("-");
  const parts = core.split(".").map((part) => Number(part) || 0);
  return {
    parts: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    prerelease,
  };
}
