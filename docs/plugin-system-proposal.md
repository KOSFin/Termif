# Plugin System Proposal

## Current State

Termif currently ships without active plugin runtime. The plugins module exists as a structural placeholder only, and no third-party code loading path is enabled in the production execution path.

This is deliberate. Terminal and SSH workflows demand strong trust guarantees, and plugin support will be introduced only after capability boundaries and operational safeguards reach product quality.

## Strategic Goal

The plugin system is intended to extend user workflows without weakening reliability or security. The architecture target is contribution-level extensibility, not unrestricted process-level embedding.

## Proposed Runtime Direction

The preferred direction is a capability-gated WASM runtime with a versioned host API. Compared with native dynamic libraries, this model offers stronger isolation, clearer ABI governance, and better containment for plugin faults.

A native trusted-plugin path may be considered later for internal distributions, but it should not be the default public extension model.

## Capability and Permission Model

Plugins should declare requested capabilities in manifest metadata. End users should explicitly approve high-trust capabilities before activation, and approvals should be revocable.

Initial capability domains are expected to include command registration, sidebar contributions, file and tab context actions, terminal hooks, settings extensions, bounded plugin storage, and optional outbound networking under strict policy.

## Host API Surface (Proposed)

The host API should be intentionally small in early phases: register commands, contribute UI entries, subscribe to selected event streams, and emit user-facing notifications. Any API that can mutate runtime state should carry clear input contracts, timeout limits, and deterministic error semantics.

## Lifecycle Model

A mature plugin lifecycle should include discovery, manifest validation, API compatibility checks, capability consent, activation, runtime health monitoring, and controlled deactivation. Repeated plugin faults should trigger automatic quarantine rather than repeated crash loops.

## Security Constraints

Default posture should remain deny-by-default. Plugins should not get filesystem, credential, or network access unless explicitly granted. Secret material must remain inaccessible to plugin code unless a dedicated security-reviewed API exists.

Future signing and trust policy work should support organizational allowlists and stricter enterprise deployment modes.

## Product Integration Targets

Plugin UX should integrate into the existing command palette, sidebar, file context menu, and tab context surfaces. Terminal-specific hooks are valuable but high risk and should be introduced after baseline plugin sandbox controls are proven.

## Rollout Recommendation

The safest rollout path is phased: define manifest and capability schema first, ship runtime behind explicit feature gating, enable command-level extensions before deep runtime hooks, then expand capability breadth only after stability and telemetry confidence are established.
