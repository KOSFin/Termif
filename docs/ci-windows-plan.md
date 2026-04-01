# Windows CI and Artifact Pipeline

## Overview

Termif uses a single GitHub Actions workflow, .github/workflows/ci-windows.yml, to cover both quality gates and artifact delivery for Windows.

The workflow is triggered by pull requests, pushes to main/develop, version tags beginning with v, and manual dispatch. This keeps one authoritative pipeline for validation and release preparation.

## Job Topology

The quality job runs on windows-latest and acts as the merge gate. It validates frontend build integrity, Rust formatting, clippy warnings as errors, Rust tests, and a no-bundle Tauri smoke build.

The build-artifacts job runs after quality for non-PR events. It resolves release metadata, normalizes version values for package.json, tauri.conf.json, and Cargo.toml, executes a bundled Tauri build, collects MSI/EXE/SIG outputs, and generates SHA-256 checksums.

The release job publishes a GitHub Release when pipeline metadata allows publication. Artifact packaging and release publication remain tied to workflow metadata rather than separate disconnected scripts.

## Versioning Strategy

Tagged builds treat tag names as source-of-truth release versions with SemVer validation and legacy normalization support.

Non-tag builds derive CI versions from base package version and run number, producing semver-compatible prerelease identifiers and deterministic CI release tags. This preserves compatibility with tooling expectations while keeping build lineage visible.

MSI packaging requires a numeric four-part version, so the workflow performs explicit MSI version projection during the bundle step.

## Artifact Contract

Bundle artifacts are collected from src-tauri/target/release/bundle and filtered to installer and signature outputs. A checksums.txt file is generated for MSI and EXE assets using SHA-256.

Artifacts are uploaded with normalized names derived from computed release tags, providing stable retrieval semantics for both CI and tagged release flows.

## Security and Reliability Posture

Jobs use scoped permissions and avoid unnecessary secret exposure. Build metadata mutation is explicit and temporary where required, with tauri.conf.json backup/restore behavior during MSI patching.

Pipeline reproducibility depends on pinned major toolchain versions, npm lockfile installs, and Rust caching through swatinem/rust-cache.

## Future Enhancements

The current pipeline is release-capable for unsigned artifacts. Planned enhancements include code-signing integration, stronger provenance metadata, and richer generated release notes while preserving the single-workflow operational model.
