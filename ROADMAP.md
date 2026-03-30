# Termif Roadmap

## Delivery Policy

Execution follows the required order:
1. Architecture approval
2. Repository scaffolding
3. App shell
4. Local terminal tabs
5. Local contextual file manager
6. SSH host browser and connection flow
7. Remote file manager for SSH tabs
8. File preview/edit window
9. Persistence and restore
10. GitHub Actions Windows artifact workflow

## Phase 1: Architecture Approval (Current)

Goals:
- Finalize architecture and constraints
- Confirm MVP boundaries and tradeoffs

Exit criteria:
- ARCHITECTURE.md accepted
- Risks and assumptions accepted

## Phase 2: Scaffold Repository

Scope:
- Create module folders aligned with architecture
- Add core model crates/modules
- Add event contract stubs
- Add docs baseline and coding conventions

Exit criteria:
- Buildable shell project
- No business logic in ad-hoc locations

## Phase 3: App Shell and UX Frame

Scope:
- Main window layout
- Top tab strip with premium states
- Sidebar toggle in top-left
- Sidebar host area and file manager slot
- Command palette shell
- Settings shell with section navigation

Exit criteria:
- User can open app and create/close/switch basic tabs
- Sidebar toggles cleanly

## Phase 4: Local Terminal Sessions

Scope:
- ConPTY integration
- Shell profiles (default, PowerShell, CMD)
- xterm rendering, scrollback, selection, resize
- Tab metadata (rename/color/icon)

Exit criteria:
- Stable local shell tabs
- Terminal output/input reliability

## Phase 5: Contextual Local File Manager

Scope:
- Local backend adapter
- Breadcrumb mode and refresh/back
- File/folder actions and context menus
- CD Here integration with local terminal tab

Exit criteria:
- File manager responds to active local tab context

## Phase 6: SSH Host Browser and Connection Flow

Scope:
- Import from .ssh/config
- Managed hosts and groups CRUD
- SSH host-picker tab UI
- Credential modal and connection progress UX

Exit criteria:
- User can choose/import host and connect into SSH terminal tab

## Phase 7: Remote File Manager (SSH)

Scope:
- SFTP backend adapter
- Context switch from local to remote by active tab
- Remote-specific actions (download)
- CD Here for remote session

Exit criteria:
- Sidebar reflects active SSH tab remote filesystem

## Phase 8: File Preview and Edit Window

Scope:
- Secondary window for preview/edit
- Multi-tab file viewer/editor
- Save flow and unsaved-change guard

Exit criteria:
- Usable text preview/edit flow for local and remote files

## Phase 9: Persistence and Restore

Scope:
- Settings and hotkeys persistence
- Hosts/groups persistence
- Tab/session restore policy
- Command history store
- Visual clear vs retained logs behavior

Exit criteria:
- Restarting app restores configured state and selected session metadata

## Phase 10: CI and Windows Artifacts

Scope:
- GitHub Actions Windows CI workflow
- Artifact upload for binaries/installers
- Reproducible build notes and release-ready structure

Exit criteria:
- Downloadable Windows artifacts generated on CI

## MVP Completion Definition

MVP is complete when:
- Premium tab strip UX and sidebar UX are in place
- Local and SSH tabs both function
- Contextual file manager (local/remote) works
- Command palette executes core commands
- Settings/hotkeys are editable and persisted
- File preview/edit is usable
- Windows artifact workflow is active

## Post-MVP Priorities

- Advanced editable command input overlay mode
- Plugin runtime enablement with capability prompts
- Improved terminal semantic blocks
- Better remote diff/sync actions
- Release signing and update channel
