const repoFromPath = () => {
  const githubLinks = [...document.querySelectorAll("[data-github-link]")];
  const configured = githubLinks[0]?.getAttribute("href") || "";
  const match = configured.match(/github\.com\/([^/]+)\/([^/#?]+)/i);
  return match ? `${match[1]}/${match[2]}` : "KOSFin/Termif";
};

const REPO = repoFromPath();
const LIVE_RELEASES_URL = `https://api.github.com/repos/${REPO}/releases`;
const MOCK_RELEASES_URL = "mock-releases.json";
const LANGUAGE_KEY = "termif.site.language";

const query = new URLSearchParams(window.location.search);
const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const isMockMode = isLocalHost || query.get("mock") === "1";

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

const translations = {
  en: {
    navFeatures: "Features",
    navDownloads: "Downloads",
    heroEyebrow: "Native shells. SSH. Files. Editing.",
    heroLede: "A cross-platform terminal workspace for developers and operators who move between local machines and remote hosts all day.",
    heroSecondary: "Download another version",
    detecting: "Detecting your system...",
    releaseLoads: "Release data loads directly from GitHub Releases.",
    featureTerminalTitle: "Terminal first",
    featureTerminalText: "Local PTY sessions stream through xterm.js with platform-aware shortcuts, fast tabs, and a command palette.",
    featureSshTitle: "SSH aware",
    featureSshText: "Import hosts from ~/.ssh/config, group managed hosts, reconnect explicitly, and pin host keys.",
    featureFilesTitle: "Context files",
    featureFilesText: "The file manager follows the active local or SSH tab and opens files in a docked or popout editor.",
    downloadsEyebrow: "GitHub Releases",
    downloadsTitle: "Downloads",
    downloadsText: "Choose the installer for your platform. Checksums and alternate packages are available under each download.",
    latestRelease: "Latest release",
    preRelease: "Pre-release",
    olderRelease: "Older release",
    openRelease: "Open release",
    allReleases: "All releases",
    download: "Download",
    recommended: "Recommended",
    otherFiles: "Other files",
    changelog: "Changelog",
    compare: "Compare",
    commit: "Commit",
    noChangelog: "No changelog was published for this release.",
    noAssets: "No downloadable assets were published for this release yet.",
    noReleasesTitle: "No public releases yet",
    noReleasesText: "Build artifacts will appear here after the first GitHub Release is published.",
    olderReleases: "Older releases",
    openGithub: "Open GitHub Releases",
    noMatch: "No matching installer was found for this device yet.",
    unavailable: "Release data is temporarily unavailable.",
    mockUnavailable: "Mock release data could not be loaded.",
    mockData: "Mock data",
    mockNote: "Mock release data is loaded locally so the landing page can be checked without GitHub.",
    sourceCode: "Source code",
    checksum: "Checksum",
    portable: "Portable build",
    file: "File",
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
    other: "Other",
    appleSilicon: "Apple Silicon",
    intelMac: "Intel Mac",
    intelAmd: "Intel/AMD",
    arm64: "ARM64",
    footerTerms: "Terms",
    footerPrivacy: "Privacy",
    footerSource: "Source"
  },
  ru: {
    navFeatures: "Возможности",
    navDownloads: "Скачать",
    heroEyebrow: "Локальный shell. SSH. Файлы. Редактор.",
    heroLede: "Кроссплатформенный терминальный workspace для разработчиков и операторов, которые весь день переключаются между локальными машинами и удаленными хостами.",
    heroSecondary: "Выбрать другую версию",
    detecting: "Определяем систему...",
    releaseLoads: "Данные релизов загружаются напрямую из GitHub Releases.",
    featureTerminalTitle: "Терминал в центре",
    featureTerminalText: "Локальные PTY-сессии работают через xterm.js с платформенными хоткеями, быстрыми вкладками и командной палитрой.",
    featureSshTitle: "Понимает SSH",
    featureSshText: "Импорт хостов из ~/.ssh/config, группы managed hosts, явный reconnect и pinning host keys.",
    featureFilesTitle: "Контекстные файлы",
    featureFilesText: "Файловый менеджер следует за активной локальной или SSH-вкладкой и открывает файлы во встроенном или отдельном редакторе.",
    downloadsEyebrow: "GitHub Releases",
    downloadsTitle: "Скачать",
    downloadsText: "Выберите установщик для вашей платформы. Checksums и альтернативные пакеты доступны под каждой загрузкой.",
    latestRelease: "Последний релиз",
    preRelease: "Предрелиз",
    olderRelease: "Старый релиз",
    openRelease: "Открыть релиз",
    allReleases: "Все релизы",
    download: "Скачать",
    recommended: "Рекомендуем",
    otherFiles: "Другие файлы",
    changelog: "Что изменилось",
    compare: "Compare",
    commit: "Commit",
    noChangelog: "Changelog для этого релиза не опубликован.",
    noAssets: "Для этого релиза пока нет файлов для скачивания.",
    noReleasesTitle: "Публичных релизов пока нет",
    noReleasesText: "Сборки появятся здесь после публикации первого GitHub Release.",
    olderReleases: "Старые релизы",
    openGithub: "Открыть GitHub Releases",
    noMatch: "Подходящий установщик для этого устройства пока не найден.",
    unavailable: "Данные релизов временно недоступны.",
    mockUnavailable: "Не удалось загрузить мок-данные релизов.",
    mockData: "Mock data",
    mockNote: "Локально загружены мок-данные релизов, чтобы проверять лендинг без GitHub.",
    sourceCode: "Исходный код",
    checksum: "Checksum",
    portable: "Portable-сборка",
    file: "Файл",
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
    other: "Другое",
    appleSilicon: "Apple Silicon",
    intelMac: "Intel Mac",
    intelAmd: "Intel/AMD",
    arm64: "ARM64",
    footerTerms: "Условия",
    footerPrivacy: "Приватность",
    footerSource: "Исходники"
  }
};

let currentLanguage = detectLanguage();

function detectLanguage() {
  const requested = query.get("lang");
  const saved = localStorage.getItem(LANGUAGE_KEY);
  const browser = navigator.language || "";
  if (requested === "ru" || requested === "en") return requested;
  if (saved === "ru" || saved === "en") return saved;
  return browser.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatReleaseDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(currentLanguage === "ru" ? "ru-RU" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function cleanCommitTitle(text, tagName = "") {
  const tag = tagName || "";
  const version = tag.replace(/^v/i, "");
  const cleaned = (text || "")
    .replace(/^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?\s*[:\-–—]\s*/i, "")
    .replace(/\s*\[[^\]]+\]\s*$/g, "")
    .replace(/\s*\([^)]*(?:x64|arm64|windows|macos|linux|build|release)[^)]*\)\s*$/i, "")
    .trim();
  if (!cleaned || cleaned === tag || cleaned === version) return "";
  if (new RegExp(`^Termif\\s+${version.replaceAll(".", "\\.")}$`, "i").test(cleaned)) return "";
  return cleaned;
}

function classifyAsset(asset) {
  const name = asset.name.toLowerCase();
  const checksum = name.includes("checksum") || name.endsWith(".sha256") || name.endsWith(".sha256sum");
  const source = name.includes("source") || name.endsWith(".tar.gz") || name.endsWith(".zip") && !name.endsWith(".app.zip");
  const os = name.includes("windows") || name.endsWith(".msi") || name.endsWith(".exe") || name.includes("nsis")
    ? "windows"
    : name.includes("macos") || name.includes("darwin") || name.endsWith(".dmg") || name.endsWith(".app.zip")
      ? "macos"
      : name.includes("linux") || name.endsWith(".appimage") || name.endsWith(".deb") || name.endsWith(".rpm")
        ? "linux"
        : "other";
  const cpu = name.includes("arm64") || name.includes("aarch64") || name.includes("apple-silicon") ? "arm64" : "x64";
  const format = checksum
    ? "Checksum"
    : source
      ? "Source"
      : name.endsWith(".dmg")
        ? "DMG"
        : name.endsWith(".app.zip")
          ? "App ZIP"
          : name.endsWith(".msi")
            ? "MSI"
            : name.endsWith(".exe")
              ? "EXE"
              : name.endsWith(".appimage")
                ? "AppImage"
                : name.endsWith(".deb")
                  ? "DEB"
                  : name.endsWith(".rpm")
                    ? "RPM"
                    : "Artifact";
  return { os, cpu, format };
}

function osLabel(os) {
  return t(os === "macos" ? "macos" : os);
}

function cpuLabel(os, cpu) {
  if (os === "macos") return cpu === "arm64" ? t("appleSilicon") : t("intelMac");
  if (cpu === "arm64") return t("arm64");
  return `${t("intelAmd")} x64`;
}

function isInstaller(format) {
  return ["DMG", "MSI", "EXE", "AppImage", "DEB", "RPM", "App ZIP"].includes(format);
}

function assetKind(format) {
  if (isInstaller(format)) return "installer";
  if (format === "Checksum") return "checksum";
  return "file";
}

function assetLabel(format, os, cpu, primary = false) {
  if (primary && os === "macos" && cpu === "arm64" && format === "App ZIP") return "Apple Silicon app";
  if (primary && os === "macos" && format === "DMG") return cpu === "arm64" ? "Apple Silicon DMG" : "Intel DMG";
  if (primary && os === "windows" && format === "EXE") return "Windows EXE";
  if (primary && os === "windows" && format === "MSI") return "Windows MSI";
  if (primary && os === "linux" && format === "AppImage") return "Linux AppImage";
  if (primary && os === "linux" && format === "DEB") return "Linux DEB";
  if (format === "App ZIP") return currentLanguage === "ru" ? "App ZIP" : "App ZIP";
  if (format === "Checksum") return t("checksum");
  if (format === "Source") return t("sourceCode");
  if (format === "Artifact") return t("file");
  return format;
}

function assetTitle(meta, primary = false) {
  const fileType = assetLabel(meta.format, meta.os, meta.cpu, primary);
  return `${fileType} · ${osLabel(meta.os)} · ${cpuLabel(meta.os, meta.cpu)}`;
}

function assetIcon(kind) {
  if (kind === "installer") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 2v7m0 0l-3-3m3 3l3-3" />
        <path d="M3 12.5h10" />
      </svg>
    `;
  }
  if (kind === "checksum") {
    return `
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M8 1.8 13.2 4v4.1c0 3.5-2.3 5.7-5.2 6.9-2.9-1.2-5.2-3.4-5.2-6.9V4L8 1.8Z" />
        <path d="m5.1 8.2 1.7 1.7 3.9-3.9" />
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.8 1.8h5.1l3.3 3.3v9.1H3.8z" />
      <path d="M8.9 1.8v3.3h3.3" />
    </svg>
  `;
}

function assetSortValue(format) {
  return ["EXE", "MSI", "App ZIP", "DMG", "AppImage", "DEB", "RPM", "Checksum", "Source", "Artifact"].indexOf(format);
}

function preferredFormatOrder(os, cpu) {
  if (os === "windows") return ["EXE", "MSI"];
  if (os === "macos" && cpu === "arm64") return ["App ZIP", "DMG"];
  if (os === "macos") return ["DMG", "App ZIP"];
  if (os === "linux") return ["AppImage", "DEB", "RPM"];
  return ["Artifact", "Source"];
}

function pickPrimaryAsset(items, os, cpu) {
  const installers = items.filter(({ meta }) => isInstaller(meta.format) || meta.format === "Artifact" || meta.format === "Source");
  const order = preferredFormatOrder(os, cpu);
  return installers.sort((a, b) => {
    const aValue = order.includes(a.meta.format) ? order.indexOf(a.meta.format) : 99;
    const bValue = order.includes(b.meta.format) ? order.indexOf(b.meta.format) : 99;
    return aValue - bValue || assetSortValue(a.meta.format) - assetSortValue(b.meta.format);
  })[0] || items[0];
}

function releaseTimestamp(release) {
  const raw = release.published_at || release.created_at || release.updated_at || "";
  const timestamp = Date.parse(raw);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sortReleases(releases) {
  return releases.slice().sort((a, b) => releaseTimestamp(b) - releaseTimestamp(a));
}

function groupAssetsByPlatform(release) {
  const byOs = new Map(["windows", "macos", "linux", "other"].map((os) => [os, new Map()]));
  for (const asset of release.assets || []) {
    const meta = classifyAsset(asset);
    if (!byOs.has(meta.os)) byOs.set(meta.os, new Map());
    const cpuGroups = byOs.get(meta.os);
    if (!cpuGroups.has(meta.cpu)) cpuGroups.set(meta.cpu, []);
    cpuGroups.get(meta.cpu).push({ asset, meta });
  }
  return byOs;
}

function renderAssetLink(asset, meta, { primary = false } = {}) {
  const kind = assetKind(meta.format);
  const label = assetLabel(meta.format, meta.os, meta.cpu, primary);
  return `
    <a
      class="asset-link asset-link--${kind}${primary ? " primary-download-link" : ""}"
      href="${asset.browser_download_url}"
      title="${escapeHtml(assetTitle(meta, primary))}"
    >
      <span class="asset-icon asset-icon--${kind}" aria-hidden="true">${assetIcon(kind)}</span>
      ${primary
        ? `<span class="download-text"><strong>${escapeHtml(label)}</strong><span class="download-verb">${t("download")}</span></span>`
        : `<span>${escapeHtml(label)}</span>`}
    </a>
  `;
}

function renderDownloadChoice(os, cpu, items) {
  const sortedItems = items.slice().sort((a, b) => assetSortValue(a.meta.format) - assetSortValue(b.meta.format));
  const primary = pickPrimaryAsset(sortedItems, os, cpu);
  const secondary = sortedItems.filter(({ asset }) => asset.name !== primary.asset.name);

  return `
    <div class="download-choice">
      <div class="download-choice-main">
        <h4>${escapeHtml(cpuLabel(os, cpu))}</h4>
        ${renderAssetLink(primary.asset, primary.meta, { primary: true })}
      </div>
      ${secondary.length ? `
        <details class="secondary-assets">
          <summary>${t("otherFiles")}</summary>
          <div class="secondary-asset-list">
            ${secondary.map(({ asset, meta }) => renderAssetLink(asset, meta)).join("")}
          </div>
        </details>
      ` : ""}
    </div>
  `;
}

function renderPlatformBlock(os, cpuGroups) {
  const rows = [...cpuGroups.entries()]
    .sort(([cpuA], [cpuB]) => {
      if (cpuA === arch && cpuB !== arch) return -1;
      if (cpuB === arch && cpuA !== arch) return 1;
      return cpuA.localeCompare(cpuB);
    })
    .map(([cpu, items]) => renderDownloadChoice(os, cpu, items))
    .join("");

  return `
    <section class="platform-block">
      <div class="platform-block-head">
        <h4>${escapeHtml(osLabel(os))}</h4>
      </div>
      <div class="platform-rows">${rows}</div>
    </section>
  `;
}

function extractReleaseLinks(body) {
  const text = String(body || "");
  const compare = text.match(/https:\/\/github\.com\/[^\s)]+\/compare\/[^\s)]+/i)?.[0] || "";
  const commit = text.match(/https:\/\/github\.com\/[^\s)]+\/commit\/[a-f0-9]{7,40}/i)?.[0] || "";
  return { compare, commit };
}

function stripMarkdownLinks(line) {
  return line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/https:\/\/\S+/g, "").trim();
}

function renderChangelog(body) {
  const links = extractReleaseLinks(body);
  const rawLines = String(body || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const titleLine = rawLines
    .filter((line) => !/^#+\s*/.test(line))
    .map((line) => stripMarkdownLinks(line))
    .find((line) => line
      && !/^[-*]\s+/.test(line)
      && !/^release\s/i.test(line)
      && !/^v?[\d.]+\.{3}v?[\d.]+/i.test(line)
      && !/^[a-f0-9]{7,40}$/i.test(line));

  const metaLine = rawLines
    .map((line) => stripMarkdownLinks(line))
    .find((line) => /^release\s/i.test(line));

  const bullets = rawLines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => stripMarkdownLinks(line.replace(/^[-*]\s+/, "")))
    .filter(Boolean)
    .slice(0, 8);

  if (!titleLine && !metaLine && !bullets.length) return `<p class="changelog-empty">${t("noChangelog")}</p>`;

  return `
    ${titleLine ? `<p class="changelog-title">${escapeHtml(titleLine)}</p>` : ""}
    ${metaLine ? `<p class="changelog-meta">${escapeHtml(metaLine)}</p>` : ""}
    ${bullets.length ? `<ul>${bullets.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
    ${(links.compare || links.commit) ? `
      <div class="changelog-links">
        ${links.compare ? `<a href="${links.compare}">${t("compare")}</a>` : ""}
        ${links.commit ? `<a href="${links.commit}">${t("commit")}</a>` : ""}
      </div>
    ` : ""}
  `;
}

function renderReleaseCard(release, { featured = false, compact = false } = {}) {
  const grouped = groupAssetsByPlatform(release);
  const platformOrder = [platform, ...["windows", "macos", "linux"].filter((os) => os !== platform)];
  const platformSections = platformOrder
    .map((os) => {
      const cpuGroups = grouped.get(os);
      if (!cpuGroups || !cpuGroups.size) return "";
      return renderPlatformBlock(os, cpuGroups);
    })
    .join("");

  const title = cleanCommitTitle(release.name || release.tag_name, release.tag_name);
  const tag = escapeHtml(release.tag_name || "release");
  const published = formatReleaseDate(release.published_at);
  const releaseUrl = release.html_url || `https://github.com/${REPO}/releases/tag/${encodeURIComponent(release.tag_name || "")}`;
  const releaseLinks = extractReleaseLinks(release.body);
  const versionUrl = releaseLinks.compare || releaseUrl;
  const accent = featured ? t("latestRelease") : (release.prerelease ? t("preRelease") : t("olderRelease"));

  return `
    <article class="release-card ${featured ? "featured" : ""} ${compact ? "compact" : ""}">
      <div class="release-card-head">
        <div class="release-heading">
          <p class="release-kicker">${accent}</p>
          <h3><a href="${versionUrl}">${tag}</a></h3>
          ${title ? `<p class="release-title">${escapeHtml(title)}</p>` : ""}
        </div>
        <div class="release-meta">
          ${published ? `<span>${published}</span>` : ""}
          <a class="release-link" href="${releaseUrl}">${t("openRelease")}</a>
        </div>
      </div>
      <section class="changelog">
        <h4>${t("changelog")}</h4>
        ${renderChangelog(release.body)}
      </section>
      <div class="release-platforms">
        ${platformSections || `<div class="platform-block empty-state">${t("noAssets")}</div>`}
      </div>
    </article>
  `;
}

function findBestAsset(releases) {
  for (const release of releases) {
    const grouped = groupAssetsByPlatform(release);
    const currentPlatform = grouped.get(platform);
    const exactItems = currentPlatform?.get(arch);
    const fallbackItems = currentPlatform ? [...currentPlatform.values()][0] : null;
    const items = exactItems || fallbackItems;
    if (items?.length) return { release, ...pickPrimaryAsset(items, platform, arch) };
  }
  return null;
}

async function loadReleases() {
  const source = isMockMode ? MOCK_RELEASES_URL : LIVE_RELEASES_URL;
  const response = await window.fetch(source, isMockMode ? undefined : { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Release source returned ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload) ? sortReleases(payload) : [];
}

function renderDownloads(releases) {
  const grid = document.getElementById("download-grid");
  grid.innerHTML = "";

  if (!releases.length) {
    grid.innerHTML = `
      <article class="release-card empty-state">
        <h3>${t("noReleasesTitle")}</h3>
        <p>${t("noReleasesText")}</p>
        <a class="asset-link primary-download-link" href="https://github.com/${REPO}/releases">${t("openGithub")}</a>
      </article>
    `;
    return;
  }

  const [latest, ...older] = sortReleases(releases).slice(0, 12);
  grid.insertAdjacentHTML("beforeend", renderReleaseCard(latest, { featured: true }));

  if (older.length) {
    grid.insertAdjacentHTML("beforeend", `
      <details class="older-releases">
        <summary>${t("olderReleases")} (${older.length})</summary>
        <div class="older-releases-list">
          ${older.map((release) => renderReleaseCard(release, { compact: true })).join("")}
        </div>
      </details>
    `);
  }
}

function applyStaticText() {
  document.documentElement.lang = currentLanguage;
  document.querySelector('[href="#features"]').textContent = t("navFeatures");
  document.querySelector('[href="#downloads"]').textContent = t("navDownloads");
  document.querySelector(".hero .eyebrow").textContent = t("heroEyebrow");
  document.querySelector(".lede").textContent = t("heroLede");
  document.querySelector(".secondary").textContent = t("heroSecondary");
  document.getElementById("primary-download").textContent = t("detecting");
  document.getElementById("release-note").textContent = t("releaseLoads");
  document.querySelectorAll(".features article")[0].querySelector("h2").textContent = t("featureTerminalTitle");
  document.querySelectorAll(".features article")[0].querySelector("p").textContent = t("featureTerminalText");
  document.querySelectorAll(".features article")[1].querySelector("h2").textContent = t("featureSshTitle");
  document.querySelectorAll(".features article")[1].querySelector("p").textContent = t("featureSshText");
  document.querySelectorAll(".features article")[2].querySelector("h2").textContent = t("featureFilesTitle");
  document.querySelectorAll(".features article")[2].querySelector("p").textContent = t("featureFilesText");
  document.querySelector(".downloads .eyebrow").textContent = t("downloadsEyebrow");
  document.querySelector(".section-head h2").textContent = t("downloadsTitle");
  document.querySelector(".section-head > p").textContent = t("downloadsText");
  document.querySelector('footer a[href="terms.html"]').textContent = t("footerTerms");
  document.querySelector('footer a[href="privacy.html"]').textContent = t("footerPrivacy");
  document.querySelector("footer [data-github-link]").textContent = t("footerSource");
}

function setupLanguageSwitch(releasesRef) {
  const switcher = document.getElementById("language-switch");
  if (!switcher) return;
  switcher.querySelectorAll("button").forEach((button) => {
    const lang = button.dataset.lang;
    button.classList.toggle("active", lang === currentLanguage);
    button.setAttribute("aria-pressed", lang === currentLanguage ? "true" : "false");
    button.onclick = () => {
      currentLanguage = lang;
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
      applyStaticText();
      setupLanguageSwitch(releasesRef);
      if (releasesRef.current) renderDownloads(releasesRef.current);
      const mode = document.getElementById("release-mode");
      if (isMockMode && mode) mode.textContent = t("mockData");
    };
  });
}

async function init() {
  const releasesRef = { current: null };
  applyStaticText();
  setupLanguageSwitch(releasesRef);

  document.querySelectorAll("[data-github-link]").forEach((link) => {
    link.setAttribute("href", `https://github.com/${REPO}`);
  });

  const primary = document.getElementById("primary-download");
  const note = document.getElementById("release-note");
  const mode = document.getElementById("release-mode");

  primary.disabled = true;

  if (isMockMode && mode) {
    mode.hidden = false;
    mode.textContent = t("mockData");
    note.textContent = t("mockNote");
  }

  try {
    const releases = await loadReleases();
    releasesRef.current = releases;
    const best = findBestAsset(releases);

    if (best) {
      primary.disabled = false;
      primary.textContent = `${t("download")} ${assetLabel(best.meta.format, best.meta.os, best.meta.cpu, true)}`;
      primary.onclick = () => { window.location.href = best.asset.browser_download_url; };
      if (!isMockMode) {
        note.textContent = `${best.release.tag_name} · ${assetLabel(best.meta.format, best.meta.os, best.meta.cpu, true)}`;
      }
    } else {
      primary.textContent = t("openGithub");
      primary.disabled = false;
      primary.onclick = () => { window.location.href = `https://github.com/${REPO}/releases`; };
      note.textContent = t("noMatch");
    }

    renderDownloads(releases);
  } catch (error) {
    console.error(error);
    primary.textContent = t("openGithub");
    primary.disabled = false;
    primary.onclick = () => { window.location.href = `https://github.com/${REPO}/releases`; };
    note.textContent = isMockMode ? t("mockUnavailable") : t("unavailable");
    renderDownloads([]);
  }
}

init();
