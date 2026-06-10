# Cross-Platform CI and Release Pipeline

## Overview

Termif uses a single GitHub Actions workflow, `.github/workflows/ci-release.yml`, to cover quality gates, platform bundles, artifact checksums, and GitHub Release publication for Windows, macOS, and Linux.

The workflow is triggered by pull requests, pushes to `main`/`develop`, version tags beginning with `v`, and manual dispatch. Pull requests run validation only. Pushes to branches publish a release only when the last commit message contains a SemVer version marker.

## Job Topology

The `metadata` job computes SemVer-compatible build metadata, release channel, release tag, release name, prerelease state, stable-updater eligibility, and publication intent.

The `quality` job runs once on Ubuntu unless the commit explicitly contains `[skip ci]` or `[ci skip]`. It validates `npm run version:check`, frontend lint, Vitest unit tests, frontend build integrity, Rust formatting, clippy warnings as errors, and Rust tests. It does not run a Tauri smoke build; native Tauri compilation is reserved for the platform `build` jobs that produce artifacts.

The `build` job runs for non-PR events only when metadata found a release version and publishing is enabled. It runs in parallel with quality to reduce wall-clock time, while release publication still waits for both quality and build to pass. It builds native bundles per OS:

- Windows: MSI and NSIS EXE.
- macOS: DMG and zipped `.app` on both Intel (`macos-13`) and Apple Silicon (`macos-latest`).
- Linux: DEB and AppImage.

The `release` job downloads all platform artifacts and publishes one GitHub Release when workflow metadata allows publication.

## Versioning Strategy

Tagged builds treat tag names as the source-of-truth release versions with SemVer validation.

Non-tag builds no longer publish automatically. The last commit message or manual workflow input must contain a SemVer version such as `0.2.0`, `v0.2.0`, or `0.3.0-beta.1`. Release channel markers can be written anywhere in the commit message, for example `[stable]`, `[beta]`, `[rc]`, or `[channel: beta]`.

If the version has no prerelease suffix and no channel marker, it is treated as stable. If a non-stable channel is specified without a prerelease suffix, CI appends `-<channel>.<run_number>`.

Windows MSI still receives a numeric four-part WiX version projection during the build step.

All app version writes go through `scripts/sync-version.mjs`. Local maintainers can run `npm run version:sync -- --version 0.2.0` to update `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` when present, and `src-tauri/tauri.conf.json`. CI calls the same mechanism from `scripts/apply-build-metadata.mjs`.

Release publishing is disabled when the commit message contains `[skip release]`, `[release skip]`, `[no release]`, `[skip ci]`, or `[ci skip]`. Tag pushes created by `github-actions[bot]` are treated as release-loop candidates and do not publish another release.

## Artifact Contract

Bundle artifacts are collected from `src-tauri/target/release/bundle`. Each platform upload includes installers, updater artifacts when enabled, signatures, and a `checksums-<platform>.txt` file generated with SHA-256 hashes.

Stable releases also publish `latest.json`, generated from the signed updater artifacts. Prereleases do not publish `latest.json`, so the in-app updater installs only stable releases.

Release assets are intentionally native to the host OS instead of cross-compiled. This keeps packaging behavior aligned with Tauri and platform toolchain expectations.

## Platform Dependencies

Windows builds use the GitHub-hosted Windows runner and produce MSI/NSIS artifacts.

macOS builds use the GitHub-hosted macOS runner and produce DMG/App artifacts. Signing and notarization are not enabled by default.

Linux validation and builds use Ubuntu with WebKitGTK, AppIndicator, SVG, OpenSSL, and AppImage packaging dependencies installed before Rust checks and bundling.

## Security and Reliability Posture

Jobs use scoped permissions and avoid unnecessary secret exposure. Release publication is isolated to the final job with `contents: write`.

The updater pipeline requires Tauri updater signing secrets for stable releases:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` when the key is password-protected
- `TAURI_UPDATER_PUBKEY`

This is separate from Windows/macOS code signing. Planned hardening still includes Windows code signing, macOS Developer ID signing/notarization, Linux repository metadata, and stronger provenance attestations.
