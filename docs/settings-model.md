# Settings Model

## Goals

- Keep user-editable settings readable and portable.
- Support schema evolution without breaking existing installs.
- Allow runtime updates with predictable behavior.

## Storage

Primary settings file location (Windows):
- %APPDATA%/Termif/settings.toml

Hotkeys file location:
- %APPDATA%/Termif/keybindings.toml

Future machine policy location (optional):
- %PROGRAMDATA%/Termif/policy.toml

## Layering

Settings are resolved in order:
1. Built-in defaults
2. User settings.toml
3. Machine policy (future)
4. Runtime overrides (session only)

Effective value = latest layer that defines a valid value.

## Schema

Top-level sections:
- appearance
- terminal
- hotkeys
- ssh
- file_manager
- experimental

Required metadata:
- schema_version (integer)

Example skeleton:

```toml
schema_version = 1

[appearance]
ui_density = "comfortable"
accent_color = "#4aa3ff"
show_tab_icons = true

[terminal]
default_shell = "powershell"
font_family = "Cascadia Code"
font_size = 13
cursor_style = "bar"
scrollback_lines = 20000

[ssh]
connect_timeout_seconds = 15
strict_host_key_checking = true

[file_manager]
show_hidden = false
default_sort = "name"

[experimental]
input_overlay_mode = false
```

## Hotkey Model

Hotkeys are represented as command bindings:
- command_id
- primary binding
- optional secondary binding
- context predicate

Example:

```toml
schema_version = 1

[[bindings]]
command_id = "palette.open"
primary = "Ctrl+Shift+P"

[[bindings]]
command_id = "tab.new_default"
primary = "Ctrl+T"
```

## Validation

Validation passes:
1. Parse validity
2. Schema version support
3. Section shape and key type checks
4. Semantic checks (ranges, enums, conflicts)

Invalid values:
- Are rejected
- Emit settings.validation_failed event
- Show actionable UI error with key path
- Keep previous effective value

## Change Propagation

- UI updates a setting via typed command.
- Backend validates and writes atomically.
- Backend emits settings.changed with changed keys.
- Frontend applies minimal re-render based on affected section.

## Migration Strategy

- Migrations are versioned functions (v1->v2, v2->v3).
- Old files are migrated on load and persisted only after successful full migration.
- Backup old file before writing new version.

## Security and Privacy

- Settings never store plaintext passwords.
- Secrets are referenced by key ids where needed.
- Potentially sensitive paths are sanitized in logs.
