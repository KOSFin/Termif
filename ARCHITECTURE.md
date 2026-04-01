# Termif Architecture

## Executive Summary

Termif is a Windows-first terminal workspace built as a Tauri v2 desktop shell with a React frontend and a Rust backend. The architecture is designed around one core principle: the active tab defines execution context for terminal, filesystem, status telemetry, and editing surfaces. This allows the product to behave like a single coherent workspace instead of a collection of isolated panels.

Current implementation is production-oriented for local and SSH session workflows, with explicit module seams reserved for plugin runtime and richer typed event infrastructure in future iterations.

## System Model

At runtime, Termif operates as two cooperating planes. The frontend plane renders interaction surfaces, maintains projected UI state, and translates user intent into backend commands. The backend plane owns process lifecycle, SSH transport, file operations, host and settings persistence, and telemetry loops. Communication occurs through Tauri invoke handlers plus channel-based terminal streaming and event emission for monitoring updates.

This split is intentional: all reliability-sensitive logic remains in Rust, while the frontend focuses on composition, responsiveness, and keyboard-first UX.

## Frontend Architecture

The frontend is organized around a single Zustand store that models tab graph, active context, file view state, SSH host inventories, editor buffers, and UI overlays. Components are intentionally thin: they render state and dispatch actions, while orchestration rules stay in store actions.

The app shell controls window framing, tab strip, command palette, settings panel, status bar, and docking layout. Terminal panes are mounted per active session and receive output through Tauri channel subscriptions. Sidebar tools remain context-aware: the same file manager component transparently switches between local and remote backends based on the active tab kind.

Keyboard behavior is implemented against event.code rather than locale-dependent characters, so primary shortcuts stay stable across keyboard layouts.

## Backend Architecture

The Rust backend centers on an application state container with four long-lived services: terminal manager, monitoring store, host store, settings store, and persistence service.

The terminal manager encapsulates two runtime types: local PTY sessions and SSH sessions. Both expose a common external contract for input, resize, close, and output streaming. Local sessions use portable-pty. SSH sessions use russh channels with command capture helpers for remote listing, remote read/write, and telemetry collection.

Settings and host inventories are managed as strongly typed repositories backed by JSON files in app data storage. Persistence writes use temporary files followed by rename to reduce corruption risk during crashes or interrupted writes.

## Session and Context Lifecycle

Termif supports three tab kinds: local shell tabs, SSH picker tabs, and SSH terminal tabs. Startup attempts to restore saved tab metadata from persisted UI state. Local tabs are rehydrated by spawning fresh local sessions. Saved SSH tabs are restored as SSH picker placeholders and converted to live SSH sessions once the user reconnects.

When active tab changes, file context is rebound immediately. Cached directory snapshots are displayed optimistically for responsiveness, then refreshed from backend unless cache freshness windows suppress redundant fetches.

Disconnect handling is explicit. Backend errors that match connection-loss signatures are promoted to tab-level disconnect reasons, shown in terminal overlays and status surfaces, and eligible for reconnect flows.

## Data Contracts and Persistence

The runtime model depends on three persisted JSON artifacts.

settings.json stores appearance, terminal, hotkeys, ssh, file_manager, experimental, and status_bar sections.

hosts.json stores managed SSH hosts, host groups, and override mappings for imported ~/.ssh/config aliases and group assignments.

ui_state.json stores tab presentation metadata and active tab selection.

This model currently favors transparent, inspectable state over opaque binary formats. It also allows pragmatic backward compatibility handling via defaulting and tolerant deserialization.

## Filesystem and Editor Semantics

Filesystem behavior follows active context. Local tabs call direct OS file operations for list/read/write/create/rename/delete/copy. SSH tabs route listing and text read/write through remote shell command execution with shell-safe quoting.

The editor subsystem supports preview and edit modes, local and remote files, dirty-state tracking, language detection, docking positions, split resizing, and popout workspace windows. Save actions are mode-aware and propagate backend errors directly to file-level error state.

## Monitoring Pipeline

Remote telemetry is polled in backend loops and emitted as per-session events. The frontend consumes these updates for status-bar visualization and server clock synchronization. Metrics include CPU, RAM, disk, connected users, and server time metadata when available. Poll cadence is configurable through settings with enforced lower bounds in UI.

## Security and Trust Notes

SSH host metadata may include optional passwords in managed host records. This is a usability feature and should be treated as sensitive state in downstream hardening work.

SSH strict host key checking is represented in settings, but current SSH handler behavior accepts server keys by default. This is a known trust gap and must remain visible in documentation and roadmap.

Plugin runtime is intentionally disabled. No third-party execution sandbox is active in the current release line.

## Extensibility Posture

The repository already reserves modules for plugins, ui_events, and broader core command/event separation. These modules provide structural alignment for future capability-gated extension runtime without forcing immediate implementation complexity into the stable product path.

Detailed extension direction is documented in [docs/plugin-system-proposal.md](docs/plugin-system-proposal.md).
