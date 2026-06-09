import fs from "node:fs";
import path from "node:path";

const dir = process.env.RELEASE_ARTIFACT_DIR ?? "release-artifacts";
const repo = requiredEnv("GITHUB_REPOSITORY");
const tag = requiredEnv("RELEASE_TAG");
const version = requiredEnv("APP_VERSION");
const prerelease = process.env.PRERELEASE === "true";

if (prerelease) {
  console.log("Skipping latest.json for prerelease channel.");
  process.exit(0);
}

const files = fs.readdirSync(dir).sort();
const platforms = {
  "windows-x86_64": selectArtifact("termif-windows-x64-", [".msi", ".exe"]),
  "darwin-x86_64": selectArtifact("termif-macos-x64-", [".app.tar.gz"]),
  "darwin-aarch64": selectArtifact("termif-macos-arm64-", [".app.tar.gz"]),
  "linux-x86_64": selectArtifact("termif-linux-x64-", [".AppImage"]),
};

const manifest = {
  version,
  notes: `Termif ${version}`,
  pub_date: new Date().toISOString(),
  platforms: Object.fromEntries(
    Object.entries(platforms).map(([platform, artifact]) => [
      platform,
      {
        signature: readSignature(artifact),
        url: `https://github.com/${repo}/releases/download/${tag}/${encodeName(artifact)}`,
      },
    ]),
  ),
};

fs.writeFileSync(path.join(dir, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${path.join(dir, "latest.json")}`);

function selectArtifact(prefix, extensions) {
  for (const ext of extensions) {
    const found = files.find((name) => name.startsWith(prefix) && name.endsWith(ext) && !name.endsWith(".sig"));
    if (found) return found;
  }
  throw new Error(`No updater artifact found for ${prefix} (${extensions.join(", ")})`);
}

function readSignature(artifact) {
  const sigPath = path.join(dir, `${artifact}.sig`);
  if (!fs.existsSync(sigPath)) {
    throw new Error(`Missing updater signature for ${artifact}`);
  }
  return fs.readFileSync(sigPath, "utf8").trim();
}

function encodeName(name) {
  return name.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
