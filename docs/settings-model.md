# Settings Model

## Scope

This document describes the active settings contract implemented in the Rust backend and consumed by the React frontend. It replaces older TOML-based drafts. Current settings persistence is JSON-based and stored in the Tauri app data directory.

## Storage and Ownership

Settings are persisted in settings.json and managed by SettingsStore in the backend. On startup, settings are loaded with default fallback semantics. On save, the backend writes the full settings object atomically through the persistence service.

There is no machine-policy overlay or multi-file layering in the current implementation. Effective settings are computed as one persisted document merged with model defaults during deserialization.

## Canonical Shape

The AppSettings model has these top-level sections:

- appearance
- terminal
- hotkeys
- ssh
- file_manager
- experimental
- status_bar

Representative JSON shape:

```json
{
	"appearance": {
		"accent_color": "#61a0ff",
		"ui_density": "comfortable",
		"tab_switching_mode": "mru"
	},
	"terminal": {
		"default_shell": "powershell",
		"font_family": "Cascadia Code",
		"font_size": 13,
		"cursor_style": "bar",
		"scrollback_lines": 20000,
		"syntax_highlighting": false
	},
	"hotkeys": [
		{
			"command_id": "palette.open",
			"primary": "Ctrl+Shift+P",
			"alternates": []
		}
	],
	"ssh": {
		"connect_timeout_seconds": 15,
		"strict_host_key_checking": true
	},
	"file_manager": {
		"show_hidden": false,
		"default_sort": "name"
	},
	"experimental": {
		"input_overlay_mode": false
	},
	"status_bar": {
		"enabled": true,
		"show_resource_monitor": true,
		"show_server_time": true,
		"resource_poll_interval_seconds": 8
	}
}
```

## Runtime Behavior

The frontend requests settings through load_settings and submits updates through save_settings. Changes are applied as whole-object updates rather than patch deltas. This keeps synchronization straightforward at the cost of requiring callers to preserve unknown fields when future schema growth appears.

Hotkeys are modeled as user-defined bindings but remain normalized in runtime through a default catalog in frontend hotkey handling. Missing commands inherit defaults, while user-defined entries override by command_id.

## Validation and Defaults

Validation currently relies on typed serde deserialization and frontend input constraints. There is no separate schema_version field yet. Backward compatibility is achieved through default values on model fields and tolerant optional fields.

The status_bar section explicitly uses serde defaulting, so older settings files without status_bar remain valid and receive default status bar behavior.

## Known Gaps

The ssh.strict_host_key_checking flag is persisted and editable, but full runtime host key enforcement is not yet aligned with this setting. This discrepancy is tracked in roadmap hardening priorities.

## Forward Compatibility Direction

Future evolution should preserve JSON readability while adding explicit version metadata only when migration complexity justifies it. Until then, additive fields with defaults remain the preferred compatibility path.
