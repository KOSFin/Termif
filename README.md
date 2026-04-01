<p align="center">
	<img src="src-tauri/icons/icon.ico" alt="Termif icon" width="96" height="96" />
</p>

<h1 align="center">Termif</h1>

<p align="center">
	Windows-first terminal workspace with native shell sessions, SSH orchestration, contextual file operations, and integrated editing.
</p>

<p align="center">
	<img alt="Platform Windows" src="https://img.shields.io/badge/Platform-Windows%2010%2B-0A7A3E" />
	<img alt="Desktop Tauri" src="https://img.shields.io/badge/Desktop-Tauri%20v2-1B7F6B" />
	<img alt="Backend Rust" src="https://img.shields.io/badge/Backend-Rust-8C4A2F" />
	<img alt="Frontend React TypeScript" src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%205-2457A6" />
	<img alt="Terminal xterm" src="https://img.shields.io/badge/Terminal-xterm.js-2F2F2F" />
	<img alt="CI Windows" src="https://img.shields.io/badge/CI-Windows-green" />
</p>

English is the default documentation language.

Language navigation: 🇬🇧 [English](README.md) | 🇷🇺 [Русский](README.ru.md)

Documentation hubs: 🇬🇧 [Documentation](docs/README.md) | 🇷🇺 [Документация](docs/README.ru.md)

## What Termif Is

Termif is a desktop terminal product for operators and developers who move constantly between local and remote environments. The application combines low-latency local PTY sessions, SSH session orchestration, and a context-bound file workspace in one frame. Instead of treating terminal, files, and editor as disconnected utilities, Termif keeps those surfaces synchronized around the active tab context and connection state.

The product is intentionally Windows-first in this generation. The shell layer, packaging model, and CI artifacts are all optimized for Windows distribution, while module boundaries in both frontend and backend keep the codebase ready for future platform expansion.

## Product Capabilities

Termif ships a custom app shell with premium tab behaviors, including rename, color tagging, duplication, fast close, and keyboard-driven switching with MRU or positional mode. The top-level command palette orchestrates workspace actions without forcing users through deep menu trees. A native-feeling title bar, custom window controls, and layout docking keep interaction density high without losing clarity.

Local sessions run through portable PTY integration and stream output to xterm.js in real time. SSH sessions are provisioned through a host picker that merges imported ~/.ssh/config hosts and managed hosts, supports grouping, allows alias overrides, and can persist quick-connect definitions. When remote sessions degrade, the UI surfaces explicit disconnect reasons and uses reconnect flows instead of silent failure.

The sidebar is contextual. For local tabs, it operates on local filesystem paths. For SSH tabs, it resolves the remote path via the active session and performs remote listing, read, and write operations. The editor layer supports preview and edit modes, tracks dirty state, opens in docked mode or separate windows, and keeps remote versus local provenance visible per file tab.

The status bar supplies SSH runtime telemetry with CPU, RAM, disk, user counts, and server clock snapshots, while local clock and visibility controls remain configurable from settings.

## Runtime Architecture

Termif is built as a Tauri v2 desktop shell with a React + TypeScript frontend and a Rust backend.

The frontend handles interaction surfaces, state projection, and keyboard orchestration. A centralized Zustand store coordinates tabs, host state, file context, editor workspace, and UI overlays. xterm.js handles rendering, and terminal output is delivered through Tauri channels rather than polling.

The backend owns session lifecycle, SSH transport, filesystem operations, settings, host persistence, and monitoring loops. Local shell sessions are spawned through portable-pty. SSH execution, shell channels, and remote command capture run through russh. Persistence is file-based JSON in the Tauri app data directory with atomic temp-file replacement for writes.

For architectural deep dive, read [ARCHITECTURE.md](ARCHITECTURE.md).

## Persistence and Data Behavior

Termif persists operational state in JSON artifacts that are explicitly scoped by concern: settings.json for runtime preferences, hosts.json for managed hosts/groups/import overrides, and ui_state.json for tab presentation metadata and active tab restoration. Snippets are currently persisted in frontend localStorage and bound to the client environment.

On startup, Termif attempts to recover saved tab metadata and reconstruct local or SSH-picker tabs. If restoration is missing or invalid, the product falls back to creating a default local tab to preserve a bootable workspace.

Detailed model and compatibility rules are documented in [docs/persistence-model.md](docs/persistence-model.md) and [docs/settings-model.md](docs/settings-model.md).

## Platform Support

Current release packaging targets Windows installers via MSI and NSIS bundles. Continuous integration runs on Windows and produces downloadable Windows artifacts. Linux and macOS are not declared as supported release targets in the current product line.

## Screenshots

![Main workspace](docs/screenshots/main-workspace.png)
![Settings and command palette](docs/screenshots/settings-and-palette.png)

## Failure Semantics and Error Surfacing

Termif surfaces concrete failures rather than generic UI states. If a session id is stale, backend calls return session not found. If SSH authentication fails, the UI receives an explicit password/key rejected message. Remote list/read/write commands propagate stderr payloads when available. Unsupported operations, such as invoking remote-only behavior on local sessions, return deterministic unsupported operation errors. Missing ~/.ssh/config files are handled as an empty import set instead of a fatal condition.

## Documentation Map

[ARCHITECTURE.md](ARCHITECTURE.md) describes runtime boundaries and execution paths.

[ROADMAP.md](ROADMAP.md) tracks product direction and delivery themes.

[CONTRIBUTING.md](CONTRIBUTING.md) defines repository standards and review contract.

[docs/settings-model.md](docs/settings-model.md), [docs/persistence-model.md](docs/persistence-model.md), [docs/plugin-system-proposal.md](docs/plugin-system-proposal.md), and [docs/ci-windows-plan.md](docs/ci-windows-plan.md) cover subsystem specifications.

## License and Fork Policy

Termif is distributed under the Termif Attribution License 1.0. Forking and modification are allowed, including commercial distribution, as long as attribution obligations are preserved. In practice, derivative repositories and redistributed products must keep copyright notices and provide visible credit to the original Termif project.

Full legal text: [LICENSE](LICENSE).
