import fs from "node:fs";

const VALID_CHANNELS = new Set(["stable", "beta", "alpha", "rc", "nightly", "unstable"]);

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const baseVersion = packageJson.version;
const ref = process.env.GITHUB_REF ?? "";
const refName = process.env.GITHUB_REF_NAME ?? "";
const runNumber = process.env.GITHUB_RUN_NUMBER ?? "0";
const commitMessage = process.env.COMMIT_MESSAGE ?? "";
const versionInput = (process.env.RELEASE_VERSION_INPUT ?? "").trim();
const channelInput = normalizeChannel(process.env.RELEASE_CHANNEL_INPUT ?? "");
const publishInput = process.env.PUBLISH_RELEASE_INPUT ?? "true";
const isActionsTagPush =
  ref.startsWith("refs/tags/v") &&
  process.env.GITHUB_ACTOR === "github-actions[bot]" &&
  process.env.GITHUB_EVENT_NAME === "push";
const skipCi = hasMarker(commitMessage, ["skip ci", "ci skip"]);
const skipRelease = skipCi || isActionsTagPush || hasMarker(commitMessage, ["skip release", "release skip", "no release"]);

const source = resolveVersionSource();
const noRelease = !source.version || skipRelease;

let appVersion = noRelease ? normalizeVersion(baseVersion) : source.version;
let channel = noRelease ? "none" : resolveChannel(appVersion, source.text);

if (!noRelease && !hasPrerelease(appVersion) && channel !== "stable") {
  appVersion = `${appVersion}-${channel}.${runNumber}`;
}

const prerelease = !noRelease && (channel !== "stable" || hasPrerelease(appVersion));
const stableUpdate = !noRelease && !prerelease;
const publishRelease = !noRelease && publishInput !== "false";
const releaseTag = noRelease ? "" : `v${appVersion}`;
const releaseName = noRelease
  ? ""
  : prerelease
    ? `Termif ${appVersion} (${channel})`
    : `Termif ${appVersion}`;

const outputs = {
  app_version: appVersion,
  release_tag: releaseTag,
  release_name: releaseName,
  release_channel: channel,
  prerelease: String(prerelease),
  stable_update: String(stableUpdate),
  publish_release: String(publishRelease),
  skip_ci: String(skipCi),
  release_reason: noRelease
    ? noReleaseReason()
    : `Resolved ${appVersion} from ${source.kind}.`,
};

for (const [key, value] of Object.entries(outputs)) {
  console.log(`${key}=${value}`);
}

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs).map(([key, value]) => `${key}=${escapeOutput(value)}`).join("\n") + "\n",
  );
}

function resolveVersionSource() {
  if (ref.startsWith("refs/tags/v")) {
    return { kind: "tag", version: normalizeVersion(refName), text: refName };
  }

  if (versionInput) {
    return { kind: "workflow input", version: normalizeVersion(versionInput), text: `${versionInput} ${channelInput}` };
  }

  const commitVersion = findVersion(commitMessage);
  return {
    kind: "commit message",
    version: commitVersion ? normalizeVersion(commitVersion) : "",
    text: commitMessage,
  };
}

function findVersion(text) {
  const match = text.match(/(?:^|[^0-9A-Za-z])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z])/);
  return match?.[1] ?? "";
}

function normalizeVersion(value) {
  const version = value.trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Version '${value}' must be SemVer, for example 1.2.3 or 1.2.3-beta.1`);
  }
  return version;
}

function resolveChannel(version, text) {
  if (channelInput !== "auto") return channelInput;

  const marker = text.match(/\[(?:release[-_ ]?)?channel:\s*(stable|beta|alpha|rc|nightly|unstable)\]/i)
    ?? text.match(/\[(stable|beta|alpha|rc|nightly|unstable)\]/i);
  if (marker) return normalizeChannel(marker[1]);

  const prerelease = version.split("-")[1]?.split("+")[0] ?? "";
  const prereleaseChannel = prerelease.split(".")[0]?.toLowerCase() ?? "";
  if (VALID_CHANNELS.has(prereleaseChannel)) return prereleaseChannel;
  if (prerelease) return "unstable";
  return "stable";
}

function normalizeChannel(value) {
  const channel = value.trim().toLowerCase() || "auto";
  if (channel === "auto") return "auto";
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(`Release channel '${value}' must be stable, beta, alpha, rc, nightly, unstable or auto`);
  }
  return channel;
}

function hasPrerelease(version) {
  return version.includes("-");
}

function hasMarker(text, markers) {
  const normalized = text.toLowerCase();
  return markers.some((marker) => normalized.includes(`[${marker}]`));
}

function noReleaseReason() {
  if (skipCi) return "Commit contains [skip ci] or [ci skip]; release publishing is disabled.";
  if (isActionsTagPush) return "Tag push was created by github-actions[bot]; release publishing is disabled to avoid a release loop.";
  if (skipRelease) return "Commit contains a release skip marker; release publishing is disabled.";
  return "No SemVer version marker found; release publishing is disabled.";
}

function escapeOutput(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\n/g, "%0A")
    .replace(/\r/g, "%0D");
}
