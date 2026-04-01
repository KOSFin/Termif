# Termif Product Roadmap

## Direction

Termif is evolving from a technically complete Windows-first MVP into an operationally hardened terminal workspace product. The next roadmap cycle focuses less on adding isolated features and more on improving trust, execution consistency, and release quality for users who rely on SSH and file workflows daily.

## Current Product Baseline

The platform already ships custom app shell controls, local and SSH tabs, contextual file manager switching, host/group management, command palette orchestration, settings and hotkey customization, integrated editor workflows, persisted workspace metadata, and Windows CI artifact generation.

This means roadmap work now targets depth over breadth.

## Near-Term Priorities

### 1) Connection Trust and SSH Hardening

The product must close trust gaps in SSH validation and provide explicit host-key policy behavior that matches user expectations. Settings currently expose strict_host_key_checking semantics; runtime enforcement and UX feedback should align with that contract.

### 2) Session Reliability and Recovery

Reconnect behavior, stale session cleanup, and background wake-up handling need further stabilization under unstable networks. The objective is predictable terminal continuity without hidden reconnect loops.

### 3) Editor and Filesystem Maturity

Inline and popout editing are functional, but large-file behavior, remote latency tolerance, and conflict handling require refinement. Future work should preserve the current context-bound file model while improving resilience and user confidence around save operations.

### 4) Release Confidence for Windows

Artifact generation is active, but release lifecycle improvements are still needed around signing, checksum publication policy, and release metadata quality. This is essential for enterprise adoption where provenance and reproducibility are mandatory.

## Mid-Term Objectives

### Structured Input Evolution

The experimental input overlay direction remains valid, but should be implemented incrementally with strict compatibility expectations for native shell editing. Any structured input mode must remain optional and never degrade core terminal behavior.

### Capability-Gated Plugin Runtime

Plugin architecture remains a strategic investment. Runtime enablement should occur only after capability prompts, permission boundaries, and crash isolation guarantees are implemented to product standards.

### Cross-Platform Readiness

Although Windows is the only declared release target today, code boundaries should continue to avoid platform lock-in where unnecessary. Packaging and QA expansion can follow once Windows trust and reliability targets are met.

## Delivery Principles

Roadmap execution follows three rules. First, reliability work has priority over cosmetic expansion. Second, changes to terminal, SSH, and persistence contracts must be documented in the same cycle they ship. Third, every milestone should reduce operational ambiguity for users and maintainers.

## Exit Criteria for the Next Major Milestone

The next milestone is considered complete when SSH trust behavior matches settings semantics, reconnect workflows are stable under real network failures, editor/file operations present deterministic error recovery, and Windows releases ship with stronger integrity guarantees.
