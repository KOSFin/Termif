const repoFromPath = () => {
  const githubLinks = [...document.querySelectorAll("[data-github-link]")];
  const configured = githubLinks[0]?.getAttribute("href") || "";
  const match = configured.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  return match ? `${match[1]}/${match[2]}` : "KOSFin/Termif";
};

const REPO = repoFromPath();
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;

const platform = (() => {
  const ua = navigator.userAgent.toLowerCase();
  const p = navigator.platform.toLowerCase();
  const brands = navigator.userAgentData?.platform?.toLowerCase() || "";
  if (ua.includes("mac") || p.includes("mac") || brands.includes("mac")) return "macos";
  if (ua.includes("win") || p.includes("win") || brands.includes("win")) return "windows";
  return "linux";
})();

const arch = (() => {
  const ua = navigator.userAgent.toLowerCase();
  if (platform === "macos" && (ua.includes("arm") || ua.includes("aarch64"))) return "arm64";
  return "x64";
})();

function cleanCommitTitle(text) {
  return (text || "Release")
    .replace(/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?\s*[:\-–—]\s*/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .replace(/\s*\([^)]*(?:x64|arm64|windows|macos|linux|build|release)[^)]*\)\s*$/i, "")
    .trim() || "Release";
}

function classifyAsset(asset) {
  const name = asset.name.toLowerCase();
  const os = name.includes("windows") || name.endsWith(".msi") || name.endsWith(".exe")
    ? "windows"
    : name.includes("macos") || name.endsWith(".dmg") || name.endsWith(".app.zip") || name.endsWith(".zip")
      ? "macos"
      : name.includes("linux") || name.endsWith(".appimage") || name.endsWith(".deb") || name.endsWith(".rpm")
        ? "linux"
        : "other";
  const cpu = name.includes("arm64") || name.includes("aarch64") ? "arm64" : "x64";
  const format = name.endsWith(".dmg") ? "DMG"
    : name.endsWith(".app.zip") || name.endsWith(".zip") ? "App ZIP"
    : name.endsWith(".msi") ? "MSI"
    : name.endsWith(".exe") ? "EXE"
    : name.endsWith(".appimage") ? "AppImage"
    : name.endsWith(".deb") ? "DEB"
    : name.endsWith(".rpm") ? "RPM"
    : "Artifact";
  return { os, cpu, format };
}

function platformLabel(os, cpu) {
  if (os === "macos") return cpu === "arm64" ? "macOS Apple Silicon" : "macOS Intel";
  if (os === "windows") return "Windows x64";
  if (os === "linux") return "Linux x64";
  return "Other";
}

function findBestAsset(releases) {
  for (const release of releases) {
    const assets = (release.assets || []).map((asset) => ({ asset, meta: classifyAsset(asset) }));
    const exact = assets.find(({ meta }) => meta.os === platform && meta.cpu === arch);
    const osOnly = assets.find(({ meta }) => meta.os === platform);
    if (exact || osOnly) return { release, asset: (exact || osOnly).asset, meta: (exact || osOnly).meta };
  }
  return null;
}

function renderDownloads(releases) {
  const grid = document.getElementById("download-grid");
  grid.innerHTML = "";

  if (!releases.length) {
    grid.innerHTML = `<div class="download-card"><h3>No public releases yet</h3><p>Build artifacts will appear here after the first GitHub Release is published.</p><a href="https://github.com/${REPO}/releases">Open releases</a></div>`;
    return;
  }

  releases.slice(0, 8).forEach((release) => {
    const assets = (release.assets || []).map((asset) => ({ asset, meta: classifyAsset(asset) }));
    const groups = new Map();
    assets.forEach(({ asset, meta }) => {
      const key = `${meta.os}-${meta.cpu}`;
      if (!groups.has(key)) groups.set(key, { meta, assets: [] });
      groups.get(key).assets.push({ asset, meta });
    });

    for (const { meta, assets: groupAssets } of groups.values()) {
      const preferred = groupAssets.find(({ meta: item }) => ["DMG", "MSI", "AppImage", "DEB"].includes(item.format)) || groupAssets[0];
      const card = document.createElement("article");
      card.className = "download-card";
      card.innerHTML = `
        <h3>${platformLabel(meta.os, meta.cpu)}</h3>
        <p><strong>${release.tag_name}</strong> · ${cleanCommitTitle(release.name || release.tag_name)}</p>
        <div class="assets">${groupAssets.map(({ meta: item }) => `<span class="asset-pill">${item.format}</span>`).join("")}</div>
        <a href="${preferred.asset.browser_download_url}">Download ${preferred.meta.format}</a>
      `;
      grid.appendChild(card);
    }
  });
}

async function init() {
  document.querySelectorAll("[data-github-link]").forEach((link) => {
    link.setAttribute("href", `https://github.com/${REPO}`);
  });

  const primary = document.getElementById("primary-download");
  const note = document.getElementById("release-note");
  primary.textContent = `Download for ${platformLabel(platform, arch)}`;
  primary.disabled = true;

  try {
    const response = await window.fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
    const releases = await response.json();
    const best = findBestAsset(releases);

    if (best) {
      primary.disabled = false;
      primary.onclick = () => { window.location.href = best.asset.browser_download_url; };
      note.textContent = `${best.release.tag_name}: ${cleanCommitTitle(best.release.name || best.release.tag_name)}`;
    } else {
      primary.textContent = "Open GitHub Releases";
      primary.disabled = false;
      primary.onclick = () => { window.location.href = `https://github.com/${REPO}/releases`; };
      note.textContent = "No matching installer was found for this device yet.";
    }

    renderDownloads(releases);
  } catch {
    primary.textContent = "Open GitHub Releases";
    primary.disabled = false;
    primary.onclick = () => { window.location.href = `https://github.com/${REPO}/releases`; };
    note.textContent = "Release data is temporarily unavailable.";
    renderDownloads([]);
  }
}

init();
