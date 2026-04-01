# Contributing to Termif

Termif accepts contributions that preserve product direction, architectural coherence, and operational reliability. The repository is not maintained as a generic code dump. Every accepted change is expected to strengthen one or more of the following: execution stability, UX integrity, maintainability of subsystem boundaries, or release confidence for Windows delivery.

## Contribution Contract

A pull request should explain product intent first, then implementation mechanics. Reviewers need to understand what user-visible behavior changed, what assumptions were introduced, and what failure paths were considered.

The codebase is structured to keep Rust as the runtime authority and React as the interaction plane. Contributions that invert this relationship, for example by moving persistence logic into frontend components, are considered architectural regressions even when functionally correct.

## Design and Boundary Expectations

Frontend changes should remain declarative and state-driven. Complex behavior belongs in store actions or backend contracts rather than ad-hoc component effects.

Backend changes should preserve typed models, explicit error propagation, and deterministic command contracts. If a backend command can fail, the failure should remain actionable at the UI boundary instead of being collapsed into anonymous errors.

When introducing a new feature, contributors are expected to define the state transition model and the error model. Silent fallback behavior must be justified, because hidden recovery paths make terminal and SSH workflows harder to debug.

## Quality Gates

The Windows CI workflow is the primary merge gate. Formatting, linting, tests, and build validation are enforced in automation. Contributions that bypass CI assumptions or require undocumented manual patching are not acceptable.

For UX-heavy changes, include keyboard-path verification notes. Termif is keyboard-centric, so changes that accidentally degrade shortcut routing, tab focus behavior, or command palette accessibility are treated as high risk.

## Documentation Discipline

Documentation is part of the product surface. If you modify models, runtime behavior, command contracts, or persistence semantics, update the relevant documentation in the same pull request. Delayed documentation updates create version skew and increase onboarding cost.

## Security and Trust Expectations

Never log credentials, key material, or sensitive connection payloads. Any code path handling SSH secrets should minimize retention and avoid accidental serialization in debug output.

Plugin runtime is currently disabled. Do not introduce dynamic execution shortcuts that emulate plugin behavior without security review.

## Pull Request Readiness

A contribution is review-ready when behavior is scoped, architecture boundaries remain intact, failure handling is explicit, and docs reflect final semantics. Small focused pull requests are preferred over broad mixed refactors because they reduce regression surface and simplify release verification.
