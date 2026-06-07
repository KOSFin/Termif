# Cross-Platform CI and Release Pipeline

## Overview

Termif uses a single GitHub Actions workflow, `.github/workflows/ci-release.yml`, to cover quality gates, platform bundles, artifact checksums, and GitHub Release publication for Windows, macOS, and Linux.

The workflow is triggered by pull requests, pushes to `main`/`develop`, version tags beginning with `v`, and manual dispatch. Pull requests run validation only. Pushes and tags additionally build downloadable installers.

## Job Topology

The `metadata` job computes SemVer-compatible build metadata, release tag, release name, prerelease state, and publication intent.

The `quality` job runs as a matrix on `windows-latest`, `macos-latest`, and `ubuntu-latest`. Each runner validates frontend lint, Vitest unit tests, frontend build integrity, Rust formatting, clippy warnings as errors, Rust tests, and a no-bundle Tauri smoke build.

The `build` job runs after quality for non-PR events. It builds native bundles per OS:

- Windows: MSI and NSIS EXE.
- macOS: DMG and zipped `.app`.
- Linux: DEB and AppImage.

The `release` job downloads all platform artifacts and publishes one GitHub Release when workflow metadata allows publication.

## Versioning Strategy

Tagged builds treat tag names as the source-of-truth release versions with SemVer validation.

Non-tag builds derive CI versions from the base package version and run number, producing prerelease identifiers and deterministic CI release tags. Windows MSI still receives a numeric four-part WiX version projection during the build step.

## Artifact Contract

Bundle artifacts are collected from `src-tauri/target/release/bundle`. Each platform upload includes installers plus a `checksums-<platform>.txt` file generated with SHA-256 hashes.

Release assets are intentionally native to the host OS instead of cross-compiled. This keeps packaging behavior aligned with Tauri and platform toolchain expectations.

## Platform Dependencies

Windows builds use the GitHub-hosted Windows runner and produce MSI/NSIS artifacts.

macOS builds use the GitHub-hosted macOS runner and produce DMG/App artifacts. Signing and notarization are not enabled by default.

Linux builds use Ubuntu with WebKitGTK, AppIndicator, SVG, OpenSSL, and AppImage packaging dependencies installed before validation and bundling.

## Security and Reliability Posture

Jobs use scoped permissions and avoid unnecessary secret exposure. Release publication is isolated to the final job with `contents: write`.

The pipeline is release-capable for unsigned artifacts. Planned hardening includes Windows code signing, macOS Developer ID signing/notarization, Linux repository metadata, and stronger provenance attestations.
