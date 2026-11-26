# Standalone Skill Installation

## Unified Installer Coverage

Use a durable CLI and private HOME/XDG/host settings. Test both skills
(`ddg-planning` and `document-clarify`) and preserve an unrelated sentinel.

```bash
dotdotgod adapter install pi --with-skills --dry-run
dotdotgod adapter install pi --with-skills
dotdotgod adapter status pi --json
dotdotgod adapter uninstall pi --with-skills --dry-run
dotdotgod adapter uninstall pi --with-skills
```

Pi is a skills-only target. Claude Code, Codex, Antigravity, OpenCode and
Hermes can opt in to the same skill assets on host install. Use the
[scope matrix](../spec/cli/ADAPTER.md#optional-skills) and
[migration guide](../spec/ADAPTER_MIGRATION.md) for duplicate or legacy copies.
Confirm preview/status are read-only, unmanaged copies fail closed, and files
are preserved while another host owns the same install. Verify unchanged files
are removed only on explicit final-owner removal, and that user-edited files
are not overwritten or removed. Compare the full skill trees, including
`agents/openai.yaml` for `document-clarify` and all planning role/reference files.

Run `node --test packages/cli/test/adapters/optional-skills.test.mjs` for
ownership, conflicts, project isolation, and integrity checks. The
`packages/cli/test/document-clarify.test.mjs` suite checks skill guidance and
the absence of built-in duplicate copies. Neither test proves native discovery.

## Native discovery smoke

For each installed host and supported scope:

1. Record binary version, project directory, profile and resolved installed paths.
2. Start a fresh session or use the documented reload operation. Grant project trust only for the disposable fixture, through normal host controls.
3. Confirm exactly one copy of each optional skill is discoverable and explicitly load them. Pi 1.5.0 documents `/skill:ddg-planning` and `/reload`; verify the other hosts' own invocation mechanisms rather than assuming identical slash syntax.
4. Ask only to identify the loaded skill and read COMMON, TEMPLATES and the implementer definition. Do not start planning or implementation.
5. Capture actual resource paths and bounded tool/output evidence. A model assertion alone does not prove which files loaded.
6. Remove the fixture installation, restart/reload, and check that it is no longer discovered. Preserve unrelated skills and settings.

Hermes 0.23.1 exposes `hermes skills trust` and `hermes skills list --source local`; project trust can affect discovery. Do not silently change real trust/profile state. Installer listing is not a native Hermes discovery result.

## Historical Skills CLI Results

These results are from the pre-unification Skills CLI path, not the CLI installer or a published remote source.

| Target | Project copy assets | Native discovery/load | Version / blocker |
| --- | --- | --- | --- |
| Codex | Pass | Not run | 0.166.0; isolated native session not exercised |
| Claude Code | Pass | Blocked | Binary unavailable |
| Pi | Pass | Not run | 1.5.0; isolated native session not exercised |
| Hermes Agent | Pass | Not run | 0.23.1; isolated trust/profile session not exercised |
| OpenCode | Pass | Not run | 2.2.0; isolated standalone session not exercised |

The multi-host copy installation produced identical 23-file trees at `.agents/skills/ddg-planning`, `.claude/skills/ddg-planning`, and `.hermes/skills/ddg-planning`. Codex, Pi and OpenCode share the first location in this installer. Repeated installation passed byte comparison before removal; named unfiltered removal cleared all installed skill files and preserved unrelated evidence files.

Global scope, symlink mode, remote installation/update and native discovery are unverified. Do not claim five-host native compatibility from the asset results. Record native verification for the new installer separately.

## Historical Document Clarify Migration

Migration asset checks passed on 2026-11-10: actual npm archives contained two clarification assets only in `@dotdotgod/skills`, none in five adapters, and included `MIGRATION.md`. Skills CLI 1.7.6 installed/reinstalled identical standalone files for all five targets in disposable project scopes; existing `ddg-planning` files and a sentinel survived. Native upgrade/discovery and rollback remain unverified; Claude Code is unavailable. These results do not verify the unified installer.
