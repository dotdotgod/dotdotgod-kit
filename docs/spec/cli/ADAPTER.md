# Adapter Installer

## Commands

```text
dotdotgod adapter install <host> [--dry-run] [--use-path] [--with-skills] [--scope <user|project>] [--root <dir>] [--json]
dotdotgod adapter uninstall <host> [--dry-run] [--with-skills] [--scope <user|project>] [--root <dir>] [--json]
dotdotgod adapter status [<host>] [--scope <user|project>] [--root <dir>] [--json]
dotdotgod adapter setup-plan codex [<root>] [--catalog <path>] [--codex <bin>] [--confirm] [--json]
```

Use `dotdotgod help adapter` or `dotdotgod adapter <subcommand> --help`.
Adapter installation does not initialize a repository. The CLI also does not
run native registration or enablement commands for you. A successful
`status` describes on-disk installer state, not native discovery or trust.

## Hosts And Scope

| Host | Scope and files | After install |
| --- | --- | --- |
| `claude-code` | User; local marketplace at `~/.dotdotgod/adapters/claude-code/` | Run the printed `claude plugin marketplace add` and `claude plugin install` commands; restart. |
| `codex` | User; local marketplace at `$CODEX_HOME/plugins/dotdotgod-marketplace/` (default home `~/.codex`) | Register the printed local marketplace and plugin through Codex, review trust, then restart. The installer does not edit `config.toml`. |
| `antigravity` | User; direct placement at `~/.gemini/config/plugins/dotdotgod/` | Restart, then `agy plugin enable dotdotgod` if needed. |
| `opencode` | Project by default; `<root>/.dotdotgod/adapters/opencode/` with one relative entry in project `opencode.jsonc` (preferred) or existing `opencode.json`. User scope uses `~/.dotdotgod/adapters/opencode/` and `opencode/opencode.jsonc` under absolute `$XDG_CONFIG_HOME` or `~/.config`. | Reload OpenCode. Keep generated `.dotdotgod/` files out of Git. |
| `hermes` | User; native Python plugin at `~/.hermes/plugins/dotdotgod/`; `config.yaml` is untouched | Run `hermes plugins enable dotdotgod` and restart. |
| `pi` | User; optional skills only, no host marker | Install the native adapter separately with `pi install npm:@dotdotgod/pi`. |

`--root` applies only to project-scoped OpenCode; it defaults to the current
directory. Hostless `status` lists all six targets, with its scope/root
arguments selecting only the OpenCode location. Obsidian uses the
[community plugin flow](../../../packages/obsidian/README.md), not this command.

## Runtime Binding

Install from a durable CLI location, such as `npm install -g @dotdotgod/cli`
or a persistent source checkout. The default pins real Node and CLI entry
paths and checks Node >=22.5.0 and built-in SQLite support. Temporary and
package-executor cache paths (including npx/dlx/bunx caches) cannot be pinned.
For a durable checkout use `node packages/cli/bin/dotdotgod.mjs adapter …`.
`--use-path` instead checks a persistent `dotdotgod` on PATH and the Node it
actually uses, then records only the command name. It warns about restricted GUI
PATH and writable PATH directories. Prefer the pinned mode for GUI hosts.

Hosts invoke the shared `mcp` and `hook <host> <event>` entrypoints. Hermes
bridges per session; OpenCode uses a restricted CLI-relative module for
in-process advisory state. If the pinned installation moves, upgrade or
reinstall from its new durable location and refresh the native host registration.

## Managed State

Install and uninstall previews perform preflight without writing. Status is
read-only. States are `not-installed`, `installed`, `broken-runtime`,
`version-drift`, `partial`, `modified`, and `legacy-coexist`. State lives
in `~/.dotdotgod/adapters/state/<host>.json` (user) or
`<root>/.dotdotgod/adapters/state/opencode.json` (project). The installer
does not adopt unmanaged files or silently overwrite modified or legacy
installs. Reinstall can complete a partial managed install; uninstall
removes only verified owned files and the owned OpenCode entry, not user
config, plans, context stores, graph caches, or unrelated entries.
Follow the printed native cleanup separately; see [migration](../ADAPTER_MIGRATION.md).

JSON output uses `schemaVersion: 1`, `ok`, and `command`. Error responses
include a typed `error.code` and structured recovery argv (not commands
executed by the installer). Usage errors exit 2; operational failures exit 1.
Paths in JSON are data and may be absolute; human output masks HOME.

## Optional Skills

`--with-skills` installs `ddg-planning` and `document-clarify`. For Pi it is
required on both install and uninstall. User destinations are
`~/.agents/skills/` (Codex, OpenCode, Pi), `~/.claude/skills/`,
`~/.gemini/config/skills/`, and `~/.hermes/skills/`. Project-scoped OpenCode
uses `<root>/.agents/skills/`. Each scope has a separate
`.dotdotgod/adapters/state/skills.json` ownership ledger.

Unowned same-named directories cause `SKILL_CONFLICT` without writes.
For the five host integrations, ordinary uninstall detaches an owner but
retains the skill files. `uninstall --with-skills` removes files only when
no other owner remains and all managed bytes are intact; a shared copy is
preserved. An untouched orphan can be reclaimed or explicitly removed later.

## Codex Plan Setup

`adapter setup-plan codex` is separate from installation and supports Codex
0.163.0 only. It previews by default; `--confirm` writes new files without
overwriting existing files or changing base Codex settings. Launch manually
with the reported command. See [native Plan Mode storage](../NATIVE_PLAN_STORAGE.md).

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/commands/adapter.mjs](../../../packages/cli/src/commands/adapter.mjs)
  - [packages/cli/src/commands/adapter-format.mjs](../../../packages/cli/src/commands/adapter-format.mjs)
  - [packages/cli/src/adapters/index.mjs](../../../packages/cli/src/adapters/index.mjs)
  - [packages/cli/src/adapters/runtime-binding.mjs](../../../packages/cli/src/adapters/runtime-binding.mjs)
  - [packages/cli/src/adapters/fs-safety.mjs](../../../packages/cli/src/adapters/fs-safety.mjs)
  - [packages/cli/src/adapters/marker-store.mjs](../../../packages/cli/src/adapters/marker-store.mjs)
  - [packages/cli/src/adapters/jsonc-edit.mjs](../../../packages/cli/src/adapters/jsonc-edit.mjs)
  - [packages/cli/src/adapters/optional-skills.mjs](../../../packages/cli/src/adapters/optional-skills.mjs)
  - [packages/cli/src/adapters/codex-plan.mjs](../../../packages/cli/src/adapters/codex-plan.mjs)
- Verified by:
  - [packages/cli/test/adapters/cli-and-format.test.mjs](../../../packages/cli/test/adapters/cli-and-format.test.mjs)
  - [packages/cli/test/adapters/installer-lifecycle.test.mjs](../../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
  - [packages/cli/test/adapters/runtime-binding.test.mjs](../../../packages/cli/test/adapters/runtime-binding.test.mjs)
  - [packages/cli/test/adapters/fs-and-marker.test.mjs](../../../packages/cli/test/adapters/fs-and-marker.test.mjs)
  - [packages/cli/test/adapters/jsonc-edit.test.mjs](../../../packages/cli/test/adapters/jsonc-edit.test.mjs)
  - [packages/cli/test/adapters/optional-skills.test.mjs](../../../packages/cli/test/adapters/optional-skills.test.mjs)
  - [packages/cli/test/adapters/codex-plan.test.mjs](../../../packages/cli/test/adapters/codex-plan.test.mjs)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](../CROSS_AGENT_SUPPORT.md)
  - [docs/spec/ADAPTER_MIGRATION.md](../ADAPTER_MIGRATION.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../../arch/CROSS_AGENT_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/commands/adapter.mjs","packages/cli/src/commands/adapter-format.mjs","packages/cli/src/adapters/index.mjs","packages/cli/src/adapters/runtime-binding.mjs","packages/cli/src/adapters/fs-safety.mjs","packages/cli/src/adapters/marker-store.mjs","packages/cli/src/adapters/jsonc-edit.mjs","packages/cli/src/adapters/optional-skills.mjs","packages/cli/src/adapters/codex-plan.mjs"],"verifiedBy":["packages/cli/test/adapters/cli-and-format.test.mjs","packages/cli/test/adapters/installer-lifecycle.test.mjs","packages/cli/test/adapters/runtime-binding.test.mjs","packages/cli/test/adapters/fs-and-marker.test.mjs","packages/cli/test/adapters/jsonc-edit.test.mjs","packages/cli/test/adapters/optional-skills.test.mjs","packages/cli/test/adapters/codex-plan.test.mjs"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/ADAPTER_MIGRATION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}
```
