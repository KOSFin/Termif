# Contributing to Termif

## Principles

- Keep boundaries clean: UI and domain logic stay separated.
- Prefer typed models and typed events over ad-hoc maps.
- Keep MVP scope focused.
- Avoid hidden global mutable state.

## Architecture Rules

- Frontend components do not implement transport or persistence logic.
- Tauri commands map to explicit backend command handlers.
- Backend modules communicate through typed events and services.
- New features should include state and error-flow definitions.

## Coding Guidelines

- Use idiomatic Rust patterns (Result, enums, traits, ownership discipline).
- Favor composition and small focused modules.
- Add comments only where behavior is not obvious.
- Keep function names explicit and consistent.

## Testing Expectations

- Unit tests for pure domain logic.
- Integration tests for command handlers and persistence repositories.
- Manual UX verification for keyboard-heavy interactions.

## Error Handling

- Return typed domain errors.
- Map technical errors to user-friendly UI messages.
- Log connection and filesystem failures with operation context.

## Pull Request Checklist

- Architecture alignment confirmed
- New code located in correct module
- No boundary leaks (UI logic in backend or vice versa)
- Tests updated or risk documented
- Docs updated when contracts/models changed

## Commit Style

- Keep commits focused by feature or subsystem.
- Avoid broad mixed refactors in feature PRs.

## Security Notes

- Do not log secrets.
- Treat credentials as sensitive and short-lived.
- Require explicit capability grants for future plugin APIs.
