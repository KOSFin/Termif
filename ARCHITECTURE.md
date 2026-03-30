# Termif Architecture

## Scope and Status

This document is the Step 1 architecture baseline for Termif.

Status at this stage:
- Product architecture: defined
- Module boundaries: defined
- Implementation roadmap: defined
- Plugin strategy: proposed (MVP stubs only)
- Settings and persistence models: defined
- CI artifact strategy for Windows: defined
- Product implementation: intentionally not started yet

This architecture is designed for Windows-first delivery with clean boundaries for future cross-platform expansion.

## Product Goals

Termif is a modern terminal desktop application with:
- Local terminal tabs
- SSH terminal tabs
- Contextual file manager (local for local tabs, remote for SSH tabs)
- Saved hosts and host groups
- Command palette
- Settings with configurable hotkeys
- Premium tab UX (rename/color/icon/context menu)
- Future plugin extensibility

Non-goals for MVP:
- Cloud sync
- Collaboration
- AI copilots
- Large plugin marketplace

## Technology Stack Decision

### Chosen stack

- Desktop shell: Tauri v2 (Rust backend + web frontend)
- Frontend UI: React + TypeScript + Vite
- State (frontend): Zustand + typed action creators
- Styling: CSS variables + design tokens + scoped component styles
- Terminal rendering: xterm.js + addons (fit, webgl/canvas renderer, search, unicode)
- Local PTY: ConPTY via Rust pty integration layer
- SSH transport: rust async SSH stack (russh family), with optional fallback connector strategy
- Remote file system: SFTP over the SSH session abstraction
- Persistence: SQLite for structured state + JSON/TOML for user-editable settings
- Event transport: typed backend event bus bridged to frontend via Tauri event channels

### Why this stack

- Tauri gives a native-feeling Windows app with Rust backend control and low overhead.
- React/TypeScript allows high-velocity, polished UI work for complex panels and interactions.
- xterm.js is mature for terminal rendering/selection/scrollback and supports performance tuning.
- Rust backend isolates reliability-critical concerns (PTY, SSH, persistence, filesystem ops).
- Typed event contracts maintain clean separation between domain and UI.

### Alternatives considered

- Pure Rust GUI (egui/iced/gpui): stronger Rust purity, but slower path to highly polished desktop UX for this specific product shape.
- Electron: easier web stack, but weaker memory/performance profile for the product goals.

## Architectural Principles

- Domain-first backend: business logic in Rust modules, not in UI components.
- UI as projection: frontend renders state and dispatches typed intents.
- Explicit boundaries: local terminal, SSH, filesystem, settings, palette, and plugin concerns are separated.
- Event-driven core: modules communicate via typed domain events and command handlers.
- Capability-based extension model: future plugins get explicit capability grants.
- Recovery-first operations: transient failures produce recoverable tab/session states.

## High-Level Component Model

1. App Shell
- Window frame layout, tab strip, sidebar, command palette, settings surfaces.

2. Session Runtime
- Manages terminal sessions (local/SSH), tab lifecycle, attach/detach, reconnect status.

3. Terminal I/O Core
- PTY/ConPTY orchestration, output buffering, viewport snapshots, command boundary metadata.

4. SSH Core
- Host sources, auth flow orchestration, channel/session lifecycle, SFTP bridge.

5. File Manager Core
- Unified file abstraction with backend adapters (local, remote SFTP).

6. Persistence Core
- Settings loader/saver, host database, session snapshots, command history storage.

7. Command System
- Command registry, palette search index, command execution middleware.

8. Plugin Host (future-facing)
- Disabled in MVP, but interfaces and hook points are defined.

## Proposed Repository Layout

```text
Termif/
  ARCHITECTURE.md
  ROADMAP.md
  CONTRIBUTING.md
  README.md
  docs/
    settings-model.md
    persistence-model.md
    plugin-system-proposal.md
    ci-windows-plan.md
  src/                        # Frontend (React/TS)
    app/
      shell/
      tabs/
      sidebar/
      palette/
      settings/
    features/
      terminal/
      ssh/
      file_manager/
      sessions/
    store/
    theme/
    components/
    hooks/
  src-tauri/
    Cargo.toml
    src/
      main.rs
      app/
      core/
        event_bus/
        commands/
        errors/
        models/
      pty/
      ssh/
      fs/
      sessions/
      persistence/
      settings/
      plugins/
      ui_events/
      config/
    crates/                   # Optional split as complexity grows
      termif-domain/
      termif-infra/
      termif-plugin-api/
  .github/
    workflows/
```

## Module Breakdown

### Frontend modules

- app/shell
  - Window layout, top bar, sidebar toggle, split management.
- app/tabs
  - Tab strip, context menu, color/icon metadata editing, plus/dropdown new-tab controls.
- features/terminal
  - xterm lifecycle, input focus, selection, clipboard, scrollback viewport sync.
- features/ssh
  - Host picker UI, group management UI, credential prompt modal, connection progress states.
- features/file_manager
  - Browser panel, breadcrumbs/tree, context menus, preview/open/edit actions, CD Here action.
- app/palette
  - Command palette overlay and fuzzy search results.
- app/settings
  - Settings sections and hotkey editor.
- store
  - Normalized UI state, optimistic actions, event reconciliation.

### Backend modules

- core/models
  - Strongly typed domain entities and value objects.
- core/commands
  - Intent handlers from UI actions to domain operations.
- core/event_bus
  - Pub/sub internal channel and UI event gateway.
- pty
  - ConPTY process spawn, shell integration, stdout/stderr streaming, resize handling.
- sessions
  - Session graph and tab binding, reconnect policy, lifecycle state machine.
- ssh
  - Host import/parser, credential resolution, connection orchestration, SFTP adapters.
- fs
  - Unified filesystem service with LocalFsAdapter and RemoteSftpAdapter.
- persistence
  - SQLite repositories, migration logic, crash-safe snapshots.
- settings
  - Layered config, schema validation, change notifications.
- plugins
  - Plugin manifest parser, capability registry, disabled host runtime in MVP.
- ui_events
  - Typed DTO mapping from domain events to frontend event payloads.

## Data Flow and Event Model

### Command path

1. UI dispatches intent (for example: OpenSshHost(host_id)).
2. Tauri command handler validates payload and forwards to core command bus.
3. Domain command handler performs operation using services.
4. Domain emits events (SessionConnecting, SessionConnected, SessionErrored).
5. UI event bridge publishes typed events to frontend store.
6. Frontend reconciles state and updates visible view.

### Event categories

- session.*: opened, closed, connecting, connected, disconnected, restored
- terminal.*: output_chunk, input_state, prompt_boundary, cleared, resized
- ssh.*: host_imported, auth_required, auth_failed, handshake_progress
- fs.*: listing_updated, operation_success, operation_failed
- settings.*: reloaded, changed
- palette.*: command_registered, command_executed
- plugin.* (future): loaded, rejected, hook_invoked

### State ownership

- Backend is source of truth for runtime sessions, SSH state, file backends, persistence.
- Frontend maintains projection state and transient interaction state (focus, menus, local forms).

## Terminal Strategy and Editable Input Feasibility

## Local terminal foundation

- Use ConPTY for Windows shell sessions.
- Spawn shells via a shell profile registry (PowerShell, CMD, custom profile path).
- Stream output to xterm.js.
- Keep output buffer and metadata in backend for persistence and diagnostics.

## Modern editable input requirement

A full Warp-style structured input model requires semantic shell integration and command block ownership.

### MVP realistic implementation

- xterm.js terminal with thin cursor style and robust text selection.
- Native shell line editing remains primary editor (PowerShell PSReadLine, bash/readline in SSH).
- Mouse placement and selection are supported by terminal emulator and shell capabilities.
- Prompt boundary detection via shell integration markers where available (for example OSC 133 style markers from prompt scripts).
- Basic command recall/suggestions from persisted history exposed in command palette and quick suggestions panel.

### Post-MVP path to stronger editable model

- Add optional Input Overlay Mode:
  - Detect active prompt region.
  - Render editable overlay for current command buffer.
  - Submit composed command to shell channel.
- Provide shell integration scripts for PowerShell and bash/zsh remote shells.
- Add structured command blocks and per-command metadata.

This staged approach avoids overpromising Warp parity in MVP while preserving architecture hooks to evolve there.

## Session and Tab Architecture

## Core entities

- TabId, SessionId, HostId, BackendId
- TabKind: Local | SshHostPicker | SshTerminal
- SessionKind: LocalShell | SshShell
- TabPresentation: name, color, icon, badge, pinned, dirty

## Tab lifecycle state machine

- Creating -> Initializing -> Active
- Active -> Reconnecting (SSH transient)
- Active -> Closed
- Reconnecting -> Active | Failed
- Failed -> Retrying | Closed

## Session manager responsibilities

- Create local/SSH sessions
- Attach terminal streams
- Persist tab metadata and optional restorable snapshots
- Restore on startup according to user policy
- Rebind contextual sidebar backend on active-tab change

## Reconnect behavior

- Local tabs: no reconnect, reopen shell on demand
- SSH tabs: exponential backoff reconnect policy with user cancellation
- UI always shows explicit connection state

## File Manager Architecture

## Unified filesystem trait

```text
trait FileBackend {
  fn kind(&self) -> BackendKind;                 // Local or Remote
  async fn list(path) -> Result<Vec<FileEntry>>;
  async fn stat(path) -> Result<FileMeta>;
  async fn read(path, range) -> Result<Vec<u8>>;
  async fn write(path, bytes, mode) -> Result<()>;
  async fn mkdir(path) -> Result<()>;
  async fn rename(from, to) -> Result<()>;
  async fn delete(path, recursive) -> Result<()>;
  async fn copy(from, to) -> Result<()>;
}
```

## Context binding

- Active tab change triggers backend rebinding:
  - Local tab -> LocalFsAdapter rooted in local machine path context
  - SSH tab -> RemoteSftpAdapter bound to SSH session
- Sidebar view model reads from active backend only.

## MVP navigation mode

- Breadcrumbs (clickable)
- Back/forward stack
- Refresh action
- File list with optional expandable rows
- Context menu actions:
  - Preview
  - Edit/Open
  - Download (remote)
  - Copy Path
  - Copy Filename
  - Rename
  - Delete
  - New File
  - New Folder
  - Refresh
  - CD Here

## CD Here behavior

- Local session: emit shell-specific command or direct working-dir update where supported.
- SSH session: send remote shell cd command with escaped target path.

## SSH Architecture

## Layered design

1. Host sources
- ImportedHostSource from ~/.ssh/config
- ManagedHostRepository from app storage

2. Credential handling
- Password prompt modal when required and absent
- Key-based auth from configured key path
- Optional Windows Credential Manager integration in later phase

3. Connection orchestrator
- Resolve host config
- Resolve auth strategy
- Emit progress events
- Establish SSH session and terminal channel
- Expose SFTP backend for file manager

4. UI workflow
- New SSH tab starts as SshHostPicker tab
- User selects host
- Modal prompt when credentials needed
- Progress view updates in-tab
- On success tab transitions to SshTerminal

## Host grouping model

- HostGroup(id, name, order)
- HostEntry(id, source, group_id, alias, address, user, port, auth_kind)
- source = imported | managed
- Imported entries are read-only except alias display overrides.

## Command Palette Architecture

## Command registry

- Static core command registrations in backend.
- Frontend contributes UI-only commands (focus pane, toggle overlay).
- Future plugin commands register through plugin API.

## Command definition

- command_id
- title
- category
- optional hotkey
- availability predicate
- execute handler

## MVP command set

- New default terminal tab
- New tab with shell profile
- Open SSH connection flow
- Open settings
- Toggle sidebar
- Rename current tab
- Change current tab color
- Refresh file manager
- Create file/folder
- Open selected file
- Preview selected file

## Settings Architecture

## Storage layers

1. Built-in defaults
2. User settings file (TOML)
3. Optional machine overrides (enterprise future)
4. Runtime temporary overrides

## Settings sections

- appearance
- terminal
- hotkeys
- ssh
- file_manager
- experimental

## MVP support level

- Fully wired in MVP:
  - appearance basics (theme accents, density)
  - terminal basics (font, cursor style, scrollback)
  - hotkeys
  - ssh defaults (connect timeout, known-host behavior)
  - file manager defaults (show hidden, default sort)
- Experimental section exists but feature flags may be no-op initially.

## Validation and migration

- serde schema with version key
- migration pipeline for backward compatibility
- invalid values rejected with detailed UI error message

## Persistence Model

## Data stores

- SQLite: sessions, tab metadata, hosts/groups, command history index, migrations table
- Files:
  - settings.toml
  - keybindings.toml
  - logs (rolling)
  - optional terminal transcript archives

## Clear/cls behavior design

- Terminal visual clear updates viewport state only.
- Historical output remains in persisted session log segments.
- UI can offer "Clear View" and "Purge Session Log" as separate explicit actions.

## Plugin Architecture Proposal (Future-Ready)

## Runtime strategy

- Preferred future model: WASM plugins (WASI) hosted in Rust using wasmtime.
- Why: safety boundary, portable ABI, controlled capability grants.

## Plugin capabilities (planned)

- Command palette contributions
- Sidebar tool contributions
- File action contributions
- Tab action contributions
- Session lifecycle hooks
- Custom preview handlers
- SSH connection hooks
- Settings blocks contributions

## API boundary

- Manifest + capability requests + versioned API contracts
- Host-provided functions:
  - register_command
  - register_sidebar_panel
  - register_file_action
  - subscribe_event
- Plugin invoked through event and command dispatch only; no raw host memory access.

## Security model

- Capability allowlist per plugin
- Explicit user approval dialog
- No filesystem/network access unless granted
- Signed plugin support planned for release phase

MVP status:
- Plugin modules and trait boundaries present
- Plugin loading disabled by default

## Performance and Reliability Considerations

- Use chunked terminal output events to avoid UI thread pressure.
- Backpressure on PTY and SSH output channels.
- Bounded caches for file listing and history suggestions.
- Lazy rendering for large directories and long tab lists.
- Debounced settings writes.
- Crash-safe persistence with SQLite WAL mode.

## Windows-Specific Considerations

- ConPTY lifecycle and resize race handling.
- Shell profile discovery for PowerShell 7, Windows PowerShell, CMD.
- Path normalization and drive-letter semantics in local file manager.
- Optional Windows Credential Manager integration for managed secrets.
- Signed installer path reserved for release workflow.

## Assumptions, Tradeoffs, and Risks

## Assumptions

- Windows is the primary supported target in MVP.
- Users already have at least one local shell installed.
- SSH keys/config can be accessed from user profile.

## Tradeoffs

- Using xterm.js gives immediate mature terminal UX but Warp-like structured editing is incremental, not immediate.
- Hybrid UI stack (Rust + TS) adds interface complexity but greatly improves UX velocity.
- SQLite + TOML split keeps editable settings simple while preserving relational app state.

## Risks and mitigations

1. Risk: Warp-like editable input expectations exceed MVP feasibility.
- Mitigation: Explicit staged plan with shell integration markers and overlay mode roadmap.

2. Risk: SSH auth edge cases on Windows (agent forwarding, key formats).
- Mitigation: Connector abstraction and detailed auth telemetry; fallback strategy.

3. Risk: Remote file ops latency impacts UX.
- Mitigation: cancellable requests, optimistic loading states, cached directory snapshots.

4. Risk: State desynchronization between frontend and backend.
- Mitigation: backend-authoritative state IDs and idempotent events.

5. Risk: Large scrollback memory growth.
- Mitigation: segmented logs with retention policy and optional disk spill.

## Phased Implementation Plan (Summary)

- Phase A: Scaffold and shell UI surfaces
- Phase B: Local terminal sessions
- Phase C: Local file manager context binding
- Phase D: SSH hosts and connection flow
- Phase E: SSH remote file manager
- Phase F: Preview/edit window
- Phase G: Persistence and restore
- Phase H: CI workflows and release baseline

Detailed phase tasks are in ROADMAP.md.

## GitHub Actions Plan (Summary)

- Workflow 1 (CI): build/test on Windows for push and pull request
- Workflow 2 (Artifacts): build distributables and upload artifacts
- Workflow 3 (Release later): tag-based release and optional code signing integration

Detailed workflow design is in docs/ci-windows-plan.md.

## Architecture Approval Gate

Per the requested execution order, implementation starts only after architecture approval.

Approval checklist:
- Stack approved
- Module boundaries approved
- MVP terminal editing scope approved
- SSH and file-manager behavior approved
- Plugin and settings direction approved
- CI plan approved
