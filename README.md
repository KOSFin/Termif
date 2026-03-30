# Termif

Termif is a Windows-first modern terminal app with a Rust/Tauri backend and React UI.

## Current MVP Baseline

Implemented now:
- premium top tab strip: rename, color, duplicate, close, local/SSH visual distinction
- top-left sidebar toggle
- contextual sidebar file manager: local for local tabs, remote listing for SSH tabs
- new tab controls: plus for default terminal, dropdown for shell/SSH flow
- SSH host browser tab: imported `.ssh/config` hosts, managed hosts, host groups
- command palette
- settings panel with appearance/terminal/hotkeys/ssh/file manager/experimental sections
- local terminal sessions + SSH sessions (via `ssh` command)
- file preview/edit in separate windows with tabbed editor workspace
- persisted settings, hosts/groups, and UI tab metadata
- GitHub Actions Windows CI + artifact workflows

## Stack

- Tauri v2 + Rust
- React + TypeScript + Vite
- xterm.js for terminal rendering
- portable-pty for local PTY sessions
- JSON persistence in app data (`settings.json`, `hosts.json`, `ui_state.json`)

## Run Locally

Prerequisites:
- Node.js 22+
- Rust stable
- Windows with WebView2 runtime

Commands:
- `npm ci`
- `npm run tauri:dev`

Build artifact locally:
- `npm run tauri:build`

## Concrete Error Cases Handled

- local shell spawn failure returns user-facing backend error
- missing/stale session id returns explicit `session not found`
- SSH non-zero connection or remote file listing errors are surfaced to UI
- file operation failures (`create`, `rename`, `delete`, `write`) return explicit error text
- missing `.ssh/config` safely returns empty imported host list
- invalid saved UI state falls back to creating a default local tab

## Architecture and Docs

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [ROADMAP.md](ROADMAP.md)
- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/settings-model.md](docs/settings-model.md)
- [docs/persistence-model.md](docs/persistence-model.md)
- [docs/plugin-system-proposal.md](docs/plugin-system-proposal.md)
- [docs/ci-windows-plan.md](docs/ci-windows-plan.md)

## Notes

- plugin runtime is stubbed/disabled in MVP, with architecture hooks in place
- advanced Warp-style structured editable input is staged; MVP uses shell-native editing with a thin cursor and command suggestions
