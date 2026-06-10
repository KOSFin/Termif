#!/usr/bin/env node
// Points git at the version-controlled hooks directory (scripts/hooks).
// Runs automatically via the package.json "prepare" script on `npm install`.
// Safe no-op when there is no .git directory (e.g. CI installs from a tarball).

import { execFileSync } from "node:child_process";
import fs from "node:fs";

try {
  if (!fs.existsSync(".git")) {
    process.exit(0);
  }
  execFileSync("git", ["config", "core.hooksPath", "scripts/hooks"], {
    stdio: "ignore",
  });
} catch {
  // Never fail an install because hook wiring is unavailable.
  process.exit(0);
}
