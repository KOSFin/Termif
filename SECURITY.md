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

## Trust Boundaries

The Rust backend owns SSH transport, local filesystem operations, settings persistence, and update integration. Frontend code should not introduce new persistence or execution paths that bypass backend validation.
