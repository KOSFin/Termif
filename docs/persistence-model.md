# Persistence Model

## Goals

- Preserve user state and session continuity.
- Keep startup fast with controlled restore scope.
- Avoid data loss on crashes.

## Data Split

- SQLite: structured operational data
- TOML files: user-editable settings and keybindings
- Log/transcript files: append-only session logs (optional retention)

## SQLite Database

Location (Windows):
- %APPDATA%/Termif/state.db

Mode:
- WAL enabled
- Foreign keys enabled

Core tables:
- schema_migrations
- tab_metadata
- session_snapshots
- ssh_host_groups
- ssh_hosts
- command_history
- file_recents

### tab_metadata

Stores UI-facing tab properties:
- tab_id
- name
- color
- icon
- kind
- pinned
- last_active_at

### session_snapshots

Stores resumable references, not full process memory:
- session_id
- tab_id
- kind
- launch_profile
- cwd_or_remote_path
- host_id (nullable)
- reconnect_policy
- snapshot_version

### ssh_host_groups and ssh_hosts

Stores app-managed host data and grouping metadata.
Imported .ssh/config hosts are cached separately with source=imported and refresh timestamps.

### command_history

Stores deduplicated command history entries:
- command_text
- session_kind
- host_scope (nullable)
- last_used_at
- use_count

## Session Restore Policy

Configurable startup modes:
- none
- reopen_tabs_metadata_only
- reopen_and_reconnect_ssh

MVP default:
- reopen_tabs_metadata_only

## Terminal Log Strategy

Two layers are separated:
1. Viewport state (what user currently sees)
2. Session transcript state (historical output chunks)

Behavior for clear/cls:
- Clear View resets viewport buffer and marks boundary in transcript.
- Transcript remains available until retention or manual purge.

Benefits:
- Users can keep logs without forcing cluttered viewport.

## Crash Safety

- Atomic write for TOML files via temp + rename.
- SQLite transaction boundaries around multi-table updates.
- Restore routines are idempotent when stale rows are present.

## Retention and Cleanup

Configurable retention:
- max transcript age
- max transcript size per session
- max command history entries

Cleanup trigger:
- app startup
- periodic background cleanup

## Privacy

- No plaintext credential persistence in SQLite.
- Sensitive fields are excluded from diagnostic exports.
- Optional command-history disable setting for privacy-sensitive users.
