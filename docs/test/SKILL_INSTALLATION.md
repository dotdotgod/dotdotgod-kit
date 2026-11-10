# Standalone Skill Installation

## Scope

Verify standalone skill installation. The earlier `ddg-planning` results below predate the exclusive `document-clarify` migration and do not verify it. Asset installation and native host discovery are separate gates. The package guide is [packages/skills/README.md](../../packages/skills/README.md).

## Reproducible asset smoke

Use Node.js compatible with the selected Skills CLI version. The tested versions were Node.js 22.23.2 and Skills CLI 1.7.6. Run from a disposable Git project, with an absolute source-checkout package path:

```bash
npx skills@1.7.6 add /absolute/path/to/dotdotgod-kit/packages/skills \
  --skill ddg-planning \
  --agent codex claude-code pi hermes-agent opencode --copy --yes
npx skills@1.7.6 list --json
```

Check all 23 files against the source directory, including 17 role definitions, four references, the role index and `SKILL.md`. Validate relative file targets. Repeat installation to the same disposable targets and confirm assets remain intact. Put an unrelated sentinel file beside the installation and verify removal preserves it.

Named removal without an agent filter removes the shared installation:

```bash
npx skills@1.7.6 remove ddg-planning --yes
```

With this CLI version, removal filtered to the five named agents left the shared `.agents/skills/ddg-planning` directory behind. Other agents also consume that shared location. Do not describe filtered removal as removing every discoverable copy; inspect the resulting files and `skills list` output.

For global tests, isolate HOME and host-specific configuration/profile roots first. Never run global smoke commands against the user's actual skill directories. Test default symlinking separately from `--copy`; a copy-mode pass does not verify symlink behavior. For local sources, reinstall to refresh contents. Verify remote update behavior against an accessible revision before documenting it as tested.

## Native discovery smoke

For each installed host and supported scope:

1. Record binary version, project directory, profile and resolved installed paths.
2. Start a fresh session or use the documented reload operation. Grant project trust only for the disposable fixture, through normal host controls.
3. Confirm exactly one `ddg-planning` is discoverable and explicitly load it. Pi 1.5.0 documents `/skill:ddg-planning` and `/reload`; verify the other hosts' own invocation mechanisms rather than assuming identical slash syntax.
4. Ask only to identify the loaded skill and read COMMON, TEMPLATES and the implementer definition. Do not start planning or implementation.
5. Capture actual resource paths and bounded tool/output evidence. A model assertion alone does not prove which files loaded.
6. Remove the fixture installation, restart/reload, and check that it is no longer discovered. Preserve unrelated skills and settings.

Hermes 0.23.1 exposes `hermes skills trust` and `hermes skills list --source local`; project trust can affect discovery. Do not silently change real trust/profile state. Installer listing is not a native Hermes discovery result.

## Recorded results

This record covers the local checkout, not a published remote source.

| Target | Project copy assets | Native discovery/load | Version / blocker |
| --- | --- | --- | --- |
| Codex | Pass | Not run | 0.166.0; isolated native session not exercised |
| Claude Code | Pass | Blocked | Binary unavailable |
| Pi | Pass | Not run | 1.5.0; isolated native session not exercised |
| Hermes Agent | Pass | Not run | 0.23.1; isolated trust/profile session not exercised |
| OpenCode | Pass | Not run | 2.2.0; isolated standalone session not exercised |

The multi-host copy installation produced identical 23-file trees at `.agents/skills/ddg-planning`, `.claude/skills/ddg-planning`, and `.hermes/skills/ddg-planning`. Codex, Pi and OpenCode share the first location in this installer. Repeated installation passed byte comparison before removal; named unfiltered removal cleared all installed skill files and preserved unrelated evidence files.

Global scope, symlink mode, remote installation/update and native discovery are unverified. Do not claim five-host native compatibility from the asset results. Complete the matrix in available isolated environments before closing the implementation plan.

## Document Clarify Migration

Use the same disposable procedure with `--skill document-clarify`. Compare the full file set and bytes, including `agents/openai.yaml`, then reinstall and verify unrelated skill/sentinel preservation. Install `ddg-planning` separately and confirm its files do not change. See the [migration guide](../../packages/skills/MIGRATION.md).

Pack all five adapters and verify none contains `skills/document-clarify`; the standalone package must contain the complete shared workflow, metadata and notices. Native checks must cover old-adapter to standalone/new-adapter transition, reverse transition, stale caches, host-supported reinstall and exactly one actual loaded provider after restart. Do not change real trust/profile settings or infer loading from installer listing. Record blocked hosts separately.

Migration asset checks passed on 2026-11-10: actual npm archives contained two clarification assets only in `@dotdotgod/skills`, none in five adapters, and included `MIGRATION.md`. Skills CLI 1.7.6 installed/reinstalled identical standalone files for all five targets in disposable project scopes; existing `ddg-planning` files and a sentinel survived. Native upgrade/discovery and rollback remain unverified; Claude Code is unavailable. The active plan retains those gates; earlier results remain historical.

## Repository checks

```bash
pnpm --filter @dotdotgod/skills run pack:dry-run
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

Review package contents for the complete skill tree. No plugin manifests, hook enforcement, automatic agent registration, model execution or npm-install discovery should be inferred from these checks.
