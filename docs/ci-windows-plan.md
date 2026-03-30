# GitHub Actions Windows Build Plan

## Objectives

- Build Windows artifacts automatically
- Keep pipeline reproducible and release-ready
- Prepare for later signing and tagged releases

## Workflow Set

## 1) Continuous Integration

File:
- .github/workflows/ci-windows.yml

Triggers:
- pull_request
- push to main and develop

Jobs:
- setup: checkout, toolchain, node, cache
- frontend: install deps and build web assets
- backend: cargo fmt check, clippy, tests
- package-smoke: build app package in debug/release mode (configurable)

Outputs:
- test logs
- build logs
- optional debug binary artifact

## 2) Artifact Build Workflow

File:
- .github/workflows/build-windows-artifacts.yml

Triggers:
- workflow_dispatch
- push tags matching v*

Jobs:
- build-release:
  - install Rust stable (msvc target)
  - install Node LTS
  - build frontend
  - run tauri build for Windows
  - collect produced artifacts (exe/msi and updater package if configured)
  - upload artifacts with clear naming

Artifact naming convention:
- termif-windows-x64-${{ github.ref_name }}

## 3) Release Workflow (Later)

File:
- .github/workflows/release.yml (future)

Planned additions:
- release notes generation
- GitHub Release publish
- code signing integration
- checksum generation

## Reproducibility Measures

- Pin Rust toolchain (stable with optional rust-toolchain.toml)
- Pin Node major version
- Use lockfiles and frozen installs
- Cache cargo registry/target and npm cache

## Security Measures

- Minimal job permissions
- Secrets only in release workflow
- No secret echo in logs

## Minimum MVP CI Acceptance

- Successful Windows build on clean runner
- Artifacts uploaded and downloadable
- Failing tests/format/lints block merge on protected branch

## README Build Instructions Plan

README should include:
- prerequisites (Rust, Node, WebView2 runtime assumptions)
- local build commands
- local run command
- how to reproduce CI build locally
