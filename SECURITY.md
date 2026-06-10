# Security Policy

## Supported Versions

Termif is pre-1.0 software. Security fixes target the current `main` branch and the latest published GitHub Release when a release exists.

## Reporting a Vulnerability

Please do not open public issues for suspected vulnerabilities involving SSH credentials, host-key verification, arbitrary file access, update signing, or release artifact integrity.

Report privately through GitHub Security Advisories for this repository. Include:

- affected version or commit;
- operating system;
- reproduction steps;
- expected impact;
- any relevant logs with secrets removed.

## Sensitive Data Rules

Termif must not log passwords, private keys, passphrases, SSH payloads, or updater signing material. Reports and test cases should use disposable hosts and throwaway credentials.

## Local Data Storage

Termif is local-first. Backend-owned JSON files are stored in the Tauri app data directory for the current user:

- `settings.json` stores appearance, terminal, SSH, file manager, hotkey, and status bar settings.
- `hosts.json` stores managed SSH hosts, groups, and import overrides for `~/.ssh/config`.
- `ui_state.json` stores tab presentation metadata, active tab id, sidebar state, and selected sidebar tool.

Frontend snippets are currently stored in browser/WebView `localStorage` under `termif.snippets.v1`. Bounded per-tab terminal scrollback snapshots are stored in `localStorage` under `termif.terminal.log.*`. These logs are for UI restoration, not audit logging.

## Credentials and Host Keys

Imported SSH hosts are read from the user's standard `~/.ssh/config`; Termif does not copy private keys into its own store. Managed host entries can currently include an optional password in `hosts.json`. That is a known sensitive-data risk and should only be used with disposable or low-risk hosts until encrypted secret storage/keychain integration lands.

Termif has a `ssh.strict_host_key_checking` setting and host-key trust UI, but host-key enforcement is still a hardening area. Do not treat current host-key behavior as equivalent to OpenSSH's mature `known_hosts` model yet.

## Logging

Termif should not log passwords, private keys, passphrases, updater signing keys, or full SSH payloads. The app may surface command stderr, connection errors, file operation errors, and bounded terminal scrollback for local UI restoration.

## Trust Boundaries

The Rust backend owns SSH transport, local filesystem operations, settings persistence, and update integration. Frontend code should not introduce new persistence or execution paths that bypass backend validation.

## Security TODO

- Move managed host passwords to OS keychain/credential vault storage or remove password persistence.
- Align strict host-key checking with a durable known-hosts model and clear first-use/update prompts.
- Reduce Tauri asset protocol scope once background image/file-preview requirements are narrower.
- Add Windows code signing and macOS Developer ID signing/notarization.
- Add release provenance/attestation beyond checksum files.
