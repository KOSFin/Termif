# Persistence Model

## Scope

This document describes the persistence behavior currently implemented in Termif. It supersedes earlier SQLite and TOML proposals. The active model is JSON-file persistence in the Tauri app data directory, plus localStorage for frontend snippets and bounded terminal tab logs.

## Persisted Artifacts

Termif writes three backend-owned JSON files:

- settings.json
- hosts.json
- ui_state.json

Each file maps to a bounded domain and is loaded independently.

settings.json stores runtime preferences and interaction policy such as appearance, terminal options, hotkeys, SSH options, and status bar configuration.

hosts.json stores SSH groups, managed hosts, and override maps for imported host aliases/group assignments derived from ~/.ssh/config.

ui_state.json stores tab presentation metadata, active tab identity, sidebar visibility, and the selected sidebar tool used for startup restoration.

On the frontend, command snippets are stored in localStorage under termif.snippets.v1. Terminal scrollback snapshots are stored per tab under termif.terminal.log.\*, capped by the frontend to avoid unbounded growth.

## Write Strategy and Crash Behavior

Backend writes use a temp-file replacement strategy: serialize JSON, write to filename.tmp, then rename to final filename. This reduces corruption risk during interrupted writes and avoids partial-file states under normal filesystem semantics.

If a file is missing, the backend falls back to model defaults. If UI state is invalid or cannot be applied, startup continues by creating a default local tab so the workspace remains bootable.

## Session Restoration Semantics

Termif restores tab metadata, not live process memory. Local tabs are recreated by spawning fresh local shell sessions. When a saved terminal log exists for the restored tab id, the frontend replays that log into xterm before live output resumes, so users can still inspect the previous scrollback after an app restart. Persisted SSH tabs are restored as detached SSH tabs unless and until users reconnect, which prevents silent credential or trust assumptions during boot.

This approach favors deterministic startup and explicit reconnection over hidden remote side effects.

## Runtime Caches vs Persistence

Directory listings are cached in memory with short freshness windows for responsive navigation, but these caches are not persisted. Runtime terminal channel buffering remains ephemeral; the per-tab localStorage log is a bounded UI transcript for user recall rather than a backend session replay contract.

The product therefore distinguishes between durable workspace state and transient runtime acceleration structures.

## Sensitive Data Considerations

Managed SSH host entries can include an optional password field. This improves quick-connect usability but introduces sensitive persistence risk. Downstream hardening work should prioritize secret handling improvements and storage protections.

Imported host data from ~/.ssh/config is not duplicated into managed host arrays by default; instead, imported hosts are parsed and merged with override maps from hosts.json.

## Non-Persisted Domains

Termif does not currently persist complete terminal transcripts, command history databases, or plugin state stores in the active implementation. The saved terminal tab log is capped frontend scrollback, not an audit-grade transcript store. Earlier plans describing SQLite transcript and history tables are not yet shipped behavior.
