# Unified Runtime Migration

## Release Status

Version **0.12.0** introduces the unified CLI runtime topology. Existing 0.11.x
installs using the retired standalone packages should follow the upgrade steps
below.

## Upgrade An Existing Installation

1. Stop the affected host sessions. Record installed plugins and skill paths;
   back up the relevant host settings and anything locally customized. Preserve
   `docs/`, `dotdotgod.config.json`, graph/outline caches, context databases,
   global config/templates, and embedding runtime. The installer does not
   require deleting or rebuilding them or migrating impact rows.
2. Use the new CLI from a durable location. After the release, install the
   approved CLI version persistently; before release, use the source checkout
   or a matching pair of CLI/Pi tarballs in a durable development install.
   Do not bind a host to a disposable `npx`/`dlx`/temporary runtime.
   In the intended working directory run `dotdotgod adapter status`; use
   `--scope user` to inspect a user-scoped OpenCode installation separately.
3. Remove legacy registration through the old host's native flow first. The
   installer reports `legacy-coexist` / `LEGACY_COEXIST_CONFLICT` for detected
   old layouts and does not automatically delete or take ownership of them.
   Inspect actual paths and retain backups; do not wipe entire host caches.
4. Preview with `dotdotgod adapter install <host> --dry-run`. Inspect the
   binding and proposed changes, then rerun without `--dry-run`. Follow the
   printed native activation instructions, restart, and check both
   `adapter status <host>` and real workflow discovery. Verify only one
   dotdotgod MCP server/skill provider is active. The OpenCode project default
   applies to the current directory unless `--root` is supplied.

| Previous distribution | Migration |
| --- | --- |
| `@dotdotgod/context` | Use persistent `dotdotgod mcp` for direct stdio clients. Use the supported CLI package exports instead of old package or deep bundle imports. Check client root/session settings before restarting; don't move the project stores. |
| `@dotdotgod/claude-code` | Uninstall the old plugin and remove the old GitHub marketplace via Claude; check for an old dotdotgod bundle in the host cache. Then install `claude-code` and register the printed local marketplace. |
| `@dotdotgod/codex` | Remove the old plugin registration or development link with host-supported cleanup, then install `codex` and use the local marketplace. Native plan setup is separate: `dotdotgod adapter setup-plan codex <root>` previews; only 0.163.0 is supported for setup. |
| `@dotdotgod/antigravity` | Disable/remove the old bundled plugin or exact development link in the user's Antigravity profile. Install `antigravity`, restart, and check native discovery and `/plan` behavior. |
| `@dotdotgod/opencode` | Remove the old npm or local-plugin registration for dotdotgod; check both project JSON and JSONC if present. Preserve unrelated settings. Install `opencode` in the matching scope and reload. |
| `@dotdotgod/hermes` | Disable the old plugin and back up/remove only its old directory or development link. Install `hermes`, enable it, and restart. Keep host config and root labels. |
| `@dotdotgod/skills` or manual skill copies | Back up customized files. Inspect both project and user paths and remove only stale copies using the original installer or carefully scoped manual cleanup. Then install both optional skills with `--with-skills`; existing unowned copies are not adopted. |
| `@dotdotgod/pi` | Upgrade with Pi's package manager to the matching Pi package; the CLI is its sole runtime dependency. For optional skills only, preview `dotdotgod adapter install pi --with-skills --dry-run`. |
| Obsidian | Keep using the community plugin build or release files. `adapter install obsidian` is not supported. |

If optional skill migration is blocked by `SKILL_CONFLICT`, preserve the
existing files and retry the non-Pi host install without `--with-skills`, or
resolve the specific conflict before retrying. For OpenCode, use the same scope
on all commands. For uninstall, preview first and follow the printed native
cleanup; `--with-skills` removes only unshared, unchanged owned copies. If
rolling back, remove the new managed install before re-registering the old
host plugin, restore only backed-up settings/skills as necessary, and check
native discovery again. Do not downgrade or delete databases as installer cleanup.

## Maintainer Retirement Runbook

Registry operations are a separate approval gate, not part of documentation
validation or local testing. Before requesting release approval, confirm the
two tarballs, exact CLI export surface, host/skill migration and smoke evidence,
Obsidian community build, and remaining unverified host gates. Check registry
identity and exact package names/versions read-only. Publish only the CLI and Pi
in dependency order after explicit approval; verify that the replacement version
is available. Do not deprecate until migration instructions and replacements
are available and deprecation itself is approved. Preview the seven intended
mutations locally by rendering these commands, not by assuming npm supports a
nonmutating deprecate flag.

**Approval required — command list, not setup instructions:**

```sh
npm deprecate '@dotdotgod/context@*' 'Use @dotdotgod/cli and dotdotgod mcp (0.12.0 or later).'
npm deprecate '@dotdotgod/claude-code@*' 'Use dotdotgod adapter install claude-code from @dotdotgod/cli.'
npm deprecate '@dotdotgod/codex@*' 'Use dotdotgod adapter install codex from @dotdotgod/cli.'
npm deprecate '@dotdotgod/antigravity@*' 'Use dotdotgod adapter install antigravity from @dotdotgod/cli.'
npm deprecate '@dotdotgod/opencode@*' 'Use dotdotgod adapter install opencode from @dotdotgod/cli.'
npm deprecate '@dotdotgod/hermes@*' 'Use dotdotgod adapter install hermes from @dotdotgod/cli.'
npm deprecate '@dotdotgod/skills@*' 'Install @dotdotgod/cli, then use dotdotgod adapter install <host> --with-skills.'
```

The retired shared asset workspace was private, so it is not on the registry
list. Deprecation adds a registry warning, not an unpublish. Record the actual
version ranges, commands and results. To undo an erroneous warning, use an
empty message on the same approved package/range (also a registry mutation).
Do not claim the registry changed until the operation is observed.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/adapters/index.mjs](../../packages/cli/src/adapters/index.mjs)
  - [packages/cli/src/adapters/hosts/claude-code.mjs](../../packages/cli/src/adapters/hosts/claude-code.mjs)
  - [packages/cli/src/adapters/hosts/codex.mjs](../../packages/cli/src/adapters/hosts/codex.mjs)
  - [packages/cli/src/adapters/hosts/opencode.mjs](../../packages/cli/src/adapters/hosts/opencode.mjs)
  - [packages/cli/src/adapters/hosts/antigravity.mjs](../../packages/cli/src/adapters/hosts/antigravity.mjs)
  - [packages/cli/src/adapters/hosts/hermes.mjs](../../packages/cli/src/adapters/hosts/hermes.mjs)
  - [packages/cli/src/adapters/optional-skills.mjs](../../packages/cli/src/adapters/optional-skills.mjs)
  - [packages/cli/package.json](../../packages/cli/package.json)
  - [packages/pi/package.json](../../packages/pi/package.json)
  - [package.json](../../package.json)
- Verified by:
  - [packages/cli/test/adapters/installer-lifecycle.test.mjs](../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
  - [packages/cli/test/adapters/optional-skills.test.mjs](../../packages/cli/test/adapters/optional-skills.test.mjs)
  - [packages/cli/test/adapters/host-artifacts.test.mjs](../../packages/cli/test/adapters/host-artifacts.test.mjs)
  - [packages/cli/test/adapters/packaging-contract.test.mjs](../../packages/cli/test/adapters/packaging-contract.test.mjs)
- Related docs:
  - [docs/spec/cli/ADAPTER.md](cli/ADAPTER.md)
  - [docs/spec/WORKSPACE_VERIFICATION.md](WORKSPACE_VERIFICATION.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
  - [docs/test/SKILL_INSTALLATION.md](../test/SKILL_INSTALLATION.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/adapters/index.mjs","packages/cli/src/adapters/hosts/claude-code.mjs","packages/cli/src/adapters/hosts/codex.mjs","packages/cli/src/adapters/hosts/opencode.mjs","packages/cli/src/adapters/hosts/antigravity.mjs","packages/cli/src/adapters/hosts/hermes.mjs","packages/cli/src/adapters/optional-skills.mjs","packages/cli/package.json","packages/pi/package.json","package.json"],"verifiedBy":["packages/cli/test/adapters/installer-lifecycle.test.mjs","packages/cli/test/adapters/optional-skills.test.mjs","packages/cli/test/adapters/host-artifacts.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs"],"relatedDocs":["docs/spec/cli/ADAPTER.md","docs/spec/WORKSPACE_VERIFICATION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","docs/test/SKILL_INSTALLATION.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}
```
