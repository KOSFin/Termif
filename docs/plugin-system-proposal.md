# Plugin System Proposal

## Objective

Design for future extensibility without compromising security, stability, or performance.

MVP status:
- Plugin interfaces and hook points defined
- Runtime loading disabled

## Runtime Choice

Preferred design:
- WASM plugins executed in a WASI-compatible runtime (wasmtime)

Why:
- Strong isolation from host process memory
- Versionable ABI surface
- Capability-gated APIs
- Better safety than unrestricted native dynamic libraries

Alternative for internal trusted plugins only:
- Native Rust dynamic library mode (future optional, gated)

## Plugin Package Model

Each plugin includes:
- manifest.toml
- wasm module
- optional assets

Manifest fields:
- id
- version
- api_version
- name
- requested_capabilities
- contributed_commands
- contributed_panels

## Capability Model

Capabilities are explicit and user-granted.

Initial capability categories:
- commands.register
- events.subscribe
- sidebar.panel
- file.actions
- tab.actions
- terminal.hooks
- ssh.hooks
- settings.section
- storage.kv
- network.outbound (high-trust, off by default)

## API Surface (Host Functions)

Planned host calls:
- register_command(command_spec)
- register_sidebar_panel(panel_spec)
- register_file_action(action_spec)
- register_tab_action(action_spec)
- subscribe_event(event_filter)
- publish_notification(notification)

Planned event callbacks to plugin:
- on_command_invoked
- on_session_event
- on_file_context
- on_ssh_connection_event

## Lifecycle

- Discover plugin manifests
- Validate signature/version/capabilities
- Resolve dependencies
- Activate plugin
- Deactivate/unload on errors or user request

Failure behavior:
- Plugin crash isolates to plugin runtime
- Host app remains healthy
- Plugin auto-disabled after repeated faults

## Security Plan

- Disabled by default in MVP
- Permission prompt on first enable
- No secret access APIs by default
- Sandboxed file/network based on capabilities
- Future plugin signing and trust policy

## Versioning

- Plugin API has semantic versioning
- Compatibility matrix enforced at load time
- Deprecation windows documented per API version

## UX Integration Targets

Future supported contributions:
- command palette entries
- sidebar tool panels
- extra file context menu actions
- tab context actions
- terminal session hooks
- custom preview handlers
- settings blocks/pages

## Operational Limits

- Resource quotas per plugin (CPU time/memory budgets)
- Timeout for command hooks
- Circuit breaker for repeated failures
