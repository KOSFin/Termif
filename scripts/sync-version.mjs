#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

const ROOT_PACKAGE = "package.json";
const ROOT_LOCK = "package-lock.json";
const TAURI_CONFIG = "src-tauri/tauri.conf.json";
const CARGO_TOML = "src-tauri/Cargo.toml";
const CARGO_LOCK = "src-tauri/Cargo.lock";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const explicitVersion = readArgValue("--version") ?? readArgValue("-v");
const version = resolveTargetVersion();

if (checkOnly) {
  checkVersions(version);
} else {
  syncVersions(version);
}

function readArgValue(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function resolveTargetVersion() {
  const value =
    explicitVersion ??
    process.env.APP_VERSION ??
    process.env.VERSION ??
    process.env.RELEASE_VERSION_INPUT ??
    versionFromGitRef() ??
    versionFromCommitMessage() ??
    JSON.parse(fs.readFileSync(ROOT_PACKAGE, "utf8")).version;

  return normalizeVersion(value);
}

function versionFromGitRef() {
  const ref = process.env.GITHUB_REF ?? "";
  const refName = process.env.GITHUB_REF_NAME ?? "";
  if (ref.startsWith("refs/tags/v")) return refName;
  return undefined;
}

function versionFromCommitMessage() {
  const message = process.env.COMMIT_MESSAGE ?? "";
  return findVersion(message);
}

function findVersion(text) {
  const match = text.match(/(?:^|[^0-9A-Za-z])v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z])/);
  return match?.[1];
}

function normalizeVersion(value) {
  const version = String(value ?? "").trim().replace(/^v/i, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Version '${value}' must be SemVer, for example 1.2.3 or 1.2.3-beta.1`);
  }
  return version;
}

function syncVersions(nextVersion) {
  writeJson(ROOT_PACKAGE, (pkg) => {
    pkg.version = nextVersion;
    return pkg;
  });

  if (fs.existsSync(ROOT_LOCK)) {
    writeJson(ROOT_LOCK, (lock) => {
      lock.version = nextVersion;
      if (lock.packages?.[""]) {
        lock.packages[""].version = nextVersion;
      }
      return lock;
    });
  }

  writeJson(TAURI_CONFIG, (config) => {
    config.version = nextVersion;
    return config;
  });

  replaceFile(CARGO_TOML, (content) =>
    content.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m, `$1${nextVersion}$2`),
  );

  if (fs.existsSync(CARGO_LOCK)) {
    replaceFile(CARGO_LOCK, (content) =>
      content.replace(/(\[\[package\]\]\nname = "termif"\nversion = ")[^"]+(")/, `$1${nextVersion}$2`),
    );
  }

  console.log(`Termif version synchronized to ${nextVersion}`);
}

function checkVersions(expectedVersion) {
  const mismatches = [];
  const packageJson = JSON.parse(fs.readFileSync(ROOT_PACKAGE, "utf8"));
  assertVersion(mismatches, ROOT_PACKAGE, packageJson.version, expectedVersion);

  if (fs.existsSync(ROOT_LOCK)) {
    const lock = JSON.parse(fs.readFileSync(ROOT_LOCK, "utf8"));
    assertVersion(mismatches, ROOT_LOCK, lock.version, expectedVersion);
    assertVersion(mismatches, `${ROOT_LOCK} packages[""]`, lock.packages?.[""]?.version, expectedVersion);
  }

  const tauri = JSON.parse(fs.readFileSync(TAURI_CONFIG, "utf8"));
  assertVersion(mismatches, TAURI_CONFIG, tauri.version, expectedVersion);

  assertVersion(mismatches, CARGO_TOML, readCargoTomlVersion(CARGO_TOML), expectedVersion);

  if (fs.existsSync(CARGO_LOCK)) {
    assertVersion(mismatches, CARGO_LOCK, readCargoLockTermifVersion(CARGO_LOCK), expectedVersion);
  }

  if (mismatches.length > 0) {
    console.error(`Version check failed; expected ${expectedVersion}`);
    for (const mismatch of mismatches) {
      console.error(`- ${mismatch}`);
    }
    process.exit(1);
  }

  console.log(`Version check passed: ${expectedVersion}`);
}

function assertVersion(mismatches, source, actual, expected) {
  if (actual !== expected) {
    mismatches.push(`${source}: ${actual ?? "<missing>"}`);
  }
}

function readCargoTomlVersion(path) {
  const content = fs.readFileSync(path, "utf8");
  return content.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
}

function readCargoLockTermifVersion(path) {
  const content = fs.readFileSync(path, "utf8");
  return content.match(/\[\[package\]\]\nname = "termif"\nversion = "([^"]+)"/)?.[1];
}

function writeJson(path, updater) {
  const current = JSON.parse(fs.readFileSync(path, "utf8"));
  const next = updater(current);
  fs.writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`);
}

function replaceFile(path, updater) {
  const current = fs.readFileSync(path, "utf8");
  const next = updater(current);
  fs.writeFileSync(path, next);
}
