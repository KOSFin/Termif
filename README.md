<p align="center">
	<img src="src-tauri/icons/icon.ico" alt="Termif icon" width="96" height="96" />
</p>

<h1 align="center">Termif</h1>

<p align="center">
	Cross-platform terminal workspace with native shell sessions, SSH orchestration, contextual file operations, and integrated editing.
</p>

<p align="center">
	<img alt="Platform Windows macOS Linux" src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-0A7A3E" />
	<img alt="Desktop Tauri" src="https://img.shields.io/badge/Desktop-Tauri%20v2-1B7F6B" />
	<img alt="Backend Rust" src="https://img.shields.io/badge/Backend-Rust-8C4A2F" />
	<img alt="Frontend React TypeScript" src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%205-2457A6" />
	<img alt="Terminal xterm" src="https://img.shields.io/badge/Terminal-xterm.js-2F2F2F" />
	<img alt="CI Cross Platform" src="https://img.shields.io/badge/CI-Cross--Platform-green" />
</p>

<p align="center">
	<a href="https://kosfin.github.io/Termif/">
		<img alt="Download from site" src="https://img.shields.io/badge/Download-Website-61AFEF?style=for-the-badge" />
	</a>
	<a href="https://github.com/KOSFin/Termif/releases">
		<img alt="GitHub Releases" src="https://img.shields.io/badge/GitHub-Releases-98C379?style=for-the-badge&logo=github" />
	</a>
</p>

Language: 🇬🇧 [English](README.md) | 🇷🇺 [Русский](README.ru.md)

Documentation hubs: 🇬🇧 [Documentation](docs/README.md) | 🇷🇺 [Документация](docs/README.ru.md)

## What Termif Is

Termif is a desktop terminal product for operators and developers who move constantly between local and remote environments. The application combines low-latency local PTY sessions, SSH session orchestration, and a context-bound file workspace in one frame. Instead of treating terminal, files, and editor as disconnected utilities, Termif keeps those surfaces synchronized around the active tab context and connection state.

The product now targets Windows, macOS, and Linux from the same codebase. Platform differences are isolated to shell/profile resolution, keyboard conventions, window controls, filesystem roots, and release packaging, while terminal, SSH, editor, and workspace behavior remain shared.

## Product Capabilities

Termif ships a custom app shell with premium tab behaviors, including rename, color tagging, duplication, fast close, and keyboard-driven switching with MRU or positional mode. The top-level command palette orchestrates workspace actions without forcing users through deep menu trees. A native-feeling title bar, custom window controls, and layout docking keep interaction density high without losing clarity.

Local sessions run through portable PTY integration and stream output to xterm.js in real time. SSH sessions are provisioned through a host picker that merges imported ~/.ssh/config hosts and managed hosts, supports grouping, allows alias overrides, and can persist quick-connect definitions. When remote sessions degrade, the UI surfaces explicit disconnect reasons and uses reconnect flows instead of silent failure.

The sidebar is contextual. For local tabs, it operates on local filesystem paths. For SSH tabs, it resolves the remote path via the active session and performs remote listing, read, and write operations. The editor layer supports preview and edit modes, tracks dirty state, opens in docked mode or separate windows, and keeps remote versus local provenance visible per file tab.

Snippets provide lightweight command storage in the sidebar with collapsible text sections and one-click execution into the active terminal. They are intentionally local to the client environment.

The status bar supplies SSH runtime telemetry with CPU, RAM, disk, user counts, and server clock snapshots, while local clock and visibility controls remain configurable from settings.

## Runtime Architecture

Termif is built as a Tauri v2 desktop shell with a React + TypeScript frontend and a Rust backend.

The frontend handles interaction surfaces, state projection, and keyboard orchestration. A centralized Zustand store coordinates tabs, host state, file context, editor workspace, and UI overlays. xterm.js handles rendering, and terminal output is delivered through Tauri channels rather than polling.

The backend owns session lifecycle, SSH transport, filesystem operations, settings, host persistence, and monitoring loops. Local shell sessions are spawned through portable-pty. SSH execution, shell channels, and remote command capture run through russh. Persistence is file-based JSON in the Tauri app data directory with atomic temp-file replacement for writes.

For architectural deep dive, read [ARCHITECTURE.md](ARCHITECTURE.md).

## Persistence and Data Behavior

Termif persists operational state in JSON artifacts that are explicitly scoped by concern: settings.json for runtime preferences, hosts.json for managed hosts/groups/import overrides, and ui_state.json for tab presentation metadata and active tab restoration. Snippets and bounded per-tab terminal logs are currently persisted in frontend localStorage and bound to the client environment.

On startup, Termif attempts to recover saved tab metadata and reconstruct local or SSH-picker tabs. Local shells start as fresh processes while their previous visible scrollback can be replayed from the saved tab log. SSH tabs restore as detached tabs that can reconnect explicitly. If restoration is missing or invalid, the product falls back to creating a default local tab to preserve a bootable workspace.

Detailed model and compatibility rules are documented in [docs/persistence-model.md](docs/persistence-model.md) and [docs/settings-model.md](docs/settings-model.md).

## Platform Support

Release packaging targets Windows MSI/NSIS installers, macOS DMG/App bundles, and Linux DEB/AppImage packages. GitHub Actions validates and builds on Windows, macOS, and Ubuntu, then publishes platform artifacts with SHA-256 checksum files.

Local shell defaults follow the host platform: PowerShell on Windows, zsh on macOS, and bash on Linux. App shortcuts use Ctrl on Windows/Linux and Command on macOS, while terminal control sequences such as Ctrl+C remain available to the running shell. SSH host import/export resolves the user's platform home directory and uses the standard `~/.ssh/config` location on every OS.

## Screenshots

![Main workspace Mac](docs/screenshots/mac-main-screen.png)
![Main workspace Mac](docs/screenshots/mac-mainscreen-wtht-sidebar.png)
![Main workspace](docs/screenshots/main-workspace.png)
![Settings and command palette](docs/screenshots/settings-and-palette.png)

## Failure Semantics and Error Surfacing

Termif surfaces concrete failures rather than generic UI states. If a session id is stale, backend calls return session not found. If SSH authentication fails, the UI receives an explicit password/key rejected message. Remote list/read/write commands propagate stderr payloads when available. Unsupported operations, such as invoking remote-only behavior on local sessions, return deterministic unsupported operation errors. Missing ~/.ssh/config files are handled as an empty import set instead of a fatal condition.

## Documentation Map

[ARCHITECTURE.md](ARCHITECTURE.md) describes runtime boundaries and execution paths.

[ROADMAP.md](ROADMAP.md) tracks product direction and delivery themes.

[CONTRIBUTING.md](CONTRIBUTING.md) defines repository standards and review contract.

[docs/settings-model.md](docs/settings-model.md), [docs/persistence-model.md](docs/persistence-model.md), [docs/plugin-system-proposal.md](docs/plugin-system-proposal.md), and [docs/ci-release-plan.md](docs/ci-release-plan.md) cover subsystem specifications.

## License and Fork Policy

Termif is distributed under the Termif Attribution License 1.0. Forking and modification are allowed, including commercial distribution, as long as attribution obligations are preserved. In practice, derivative repositories and redistributed products must keep copyright notices and provide visible credit to the original Termif project.

Full legal text: [LICENSE](LICENSE).
