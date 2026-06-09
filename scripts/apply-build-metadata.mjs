import fs from "node:fs";

const appVersion = requiredEnv("APP_VERSION");
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || "0");
const repository = process.env.GITHUB_REPOSITORY ?? "";
const stableUpdate = process.env.STABLE_UPDATE === "true";
const updaterPubkey = process.env.TAURI_UPDATER_PUBKEY ?? "";

if (stableUpdate && !updaterPubkey.trim()) {
  throw new Error("Stable updater builds require TAURI_UPDATER_PUBKEY secret/env.");
}

const packagePath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.version = appVersion;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tauriPath = "src-tauri/tauri.conf.json";
const tauriConfig = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
tauriConfig.version = appVersion;
tauriConfig.bundle = tauriConfig.bundle ?? {};
tauriConfig.bundle.createUpdaterArtifacts = stableUpdate;

if (process.platform === "win32") {
  const match = appVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`Version '${appVersion}' does not start with X.Y.Z`);
  const build = Math.max(1, runNumber % 65535 || 1);
  tauriConfig.version = `${match[1]}.${match[2]}.${match[3]}`;
  tauriConfig.bundle.windows = tauriConfig.bundle.windows || {};
  tauriConfig.bundle.windows.wix = tauriConfig.bundle.windows.wix || {};
  tauriConfig.bundle.windows.wix.version = `${match[1]}.${match[2]}.${match[3]}.${build}`;
}

tauriConfig.plugins = tauriConfig.plugins ?? {};
if (stableUpdate) {
  tauriConfig.plugins.updater = {
    pubkey: updaterPubkey.trim(),
    endpoints: [
      `https://github.com/${repository}/releases/latest/download/latest.json`,
    ],
    windows: {
      installMode: "passive",
    },
  };
} else {
  delete tauriConfig.plugins.updater;
}

fs.writeFileSync(tauriPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoPath = "src-tauri/Cargo.toml";
const cargoToml = fs.readFileSync(cargoPath, "utf8");
fs.writeFileSync(
  cargoPath,
  cargoToml.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${appVersion}$2`),
);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
