import fs from "node:fs";
import { execFileSync } from "node:child_process";

const appVersion = requiredEnv("APP_VERSION");
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || "0");
const repository = process.env.GITHUB_REPOSITORY ?? "";
const stableUpdate = process.env.STABLE_UPDATE === "true";
const updaterPubkey = process.env.TAURI_UPDATER_PUBKEY ?? "";

if (stableUpdate && !updaterPubkey.trim()) {
  throw new Error("Stable updater builds require TAURI_UPDATER_PUBKEY secret/env.");
}

execFileSync(process.execPath, ["scripts/sync-version.mjs", "--version", appVersion], { stdio: "inherit" });

const tauriPath = "src-tauri/tauri.conf.json";
const tauriConfig = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
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

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
