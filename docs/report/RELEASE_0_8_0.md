# Release 0.8.0

## Standalone Skills and Migration

`@dotdotgod/skills` provides `ddg-planning`, its 17 role definitions and references, and `document-clarify`.

Breaking distribution change: Pi, Claude Code, Codex, Hermes and OpenCode no longer bundle `document-clarify`. Install it separately using the [migration guide](../../packages/skills/MIGRATION.md). The name, writing safeguards, attribution and CLI fallback remain intact. Refresh old adapter caches and verify one loaded provider; no automatic removal of user-owned installations is performed.

## Runtime and Validation

- Remove traced redundant internal validation in Pi, Hermes, shared hooks and Obsidian while preserving boundary checks.
- Return explicit map-unavailable evidence instead of a misleading unconfigured documentation tree.
- Correct initializer paths, host impact-review guidance and ignore-file preservation descriptions.
- Include symbol-store updates and regenerated adapter runtimes.

## Distribution and Verification

Eight public npm packages, workspace metadata and the Obsidian plugin align to 0.8.0. The shared resource package remains private. Publish the standalone skills package alongside existing public packages.

Workspace verification, package contents, five-target isolated repeated skill copy installation and project documentation validation are release gates. Native skill upgrade/discovery/rollback remains unverified across hosts; Claude Code executable was unavailable. Asset installation is not proof of native loading. The migration plan remains active for those checks.

Npm publication and GitHub artifact/attestation status must be checked after release execution; this document does not itself assert publication success.
