# Termif Product Roadmap

## Direction

Termif is evolving from a technically complete desktop MVP into an operationally hardened cross-platform terminal workspace product. The next roadmap cycle focuses less on adding isolated features and more on improving trust, execution consistency, and release quality for users who rely on SSH and file workflows daily.

## Current Product Baseline

The platform already ships custom app shell controls, local and SSH tabs, contextual file manager switching, host/group management, command palette orchestration, settings and hotkey customization, integrated editor workflows, persisted workspace metadata, and Windows/macOS/Linux CI artifact generation. Recent hardening added system-aware theme switching, native macOS window transparency configuration, release landing-page automation, and SSH host-key pinning against `known_hosts`.

This means roadmap work now targets depth over breadth.

## Near-Term Priorities

### 1) Connection Trust and SSH Hardening

The product must continue improving SSH validation and provide explicit host-key policy behavior that matches user expectations. Runtime now verifies or records host keys; the next step is a richer fingerprint confirmation UI, visible key metadata, and better remediation when a host key changes.

### 2) Session Reliability and Recovery

Reconnect behavior, stale session cleanup, timeout handling, and background wake-up behavior need further stabilization under unstable networks. The objective is predictable terminal continuity without hidden reconnect loops or long opaque waits.

### 3) Editor and Filesystem Maturity

Inline and popout editing are functional, but large-file behavior, remote latency tolerance, and conflict handling require refinement. Future work should preserve the current context-bound file model while improving resilience and user confidence around save operations.

### 4) Cross-Platform Release Confidence

Artifact generation and a GitHub Pages download surface are active for Windows, macOS, and Linux, but release lifecycle improvements are still needed around signing, notarization, checksum publication policy, and release metadata quality. This is essential for enterprise adoption where provenance and reproducibility are mandatory.

## Mid-Term Objectives

### Structured Input Evolution

The experimental input overlay direction remains valid, but should be implemented incrementally with strict compatibility expectations for native shell editing. Any structured input mode must remain optional and never degrade core terminal behavior.

### Capability-Gated Plugin Runtime

Plugin architecture remains a strategic investment. Runtime enablement should occur only after capability prompts, permission boundaries, and crash isolation guarantees are implemented to product standards.

### Platform UX Depth

Platform UX should keep one shared design language while respecting OS conventions: Command-key shortcuts and left-side window controls on macOS, Ctrl-first workflows on Windows/Linux, POSIX shell defaults on Unix, native transparency where supported, and automatic light/dark adaptation based on platform capability.

## Delivery Principles

Roadmap execution follows three rules. First, reliability work has priority over cosmetic expansion. Second, changes to terminal, SSH, and persistence contracts must be documented in the same cycle they ship. Third, every milestone should reduce operational ambiguity for users and maintainers.

## Exit Criteria for the Next Major Milestone

The next milestone is considered complete when SSH trust behavior includes a clear fingerprint confirmation flow, reconnect workflows are stable under real network failures, editor/file operations present deterministic error recovery, and Windows/macOS/Linux releases ship with stronger integrity guarantees.
