# Native Plan Storage

## Claude Code

`dotdotgod init <root> --claude-plans` opts into project-local native plans.
The CLI adds `plansDirectory: "./docs/plan"` to `.claude/settings.json`, using
the resolved documentation root instead of `docs` when configured. Other keys
and existing `plansDirectory` values are preserved. Dry-run reports the proposed
action without writes. Invalid JSON/non-object settings and settings symlinks
fail before scaffolding. No global settings, permissions or existing plans move.

The POSIX fallback has no settings-merge support; use the adapter's bundled
`mcp/cli.mjs` with Node when the installed CLI is unavailable. Native file naming
belongs to Claude Code, not the task README convention. Native Plan Mode does
not gain arbitrary shared-plan write permission. Mods are not required.

## Codex

`node <codex-plugin>/scripts/setup-plan.mjs <root> [--catalog FILE] [--codex BIN]
[--confirm]` prepares an explicit project-specific configuration profile for
Codex 0.163.0. The default is dry-run. It never changes the base user config.
The full existing catalog, from an explicit file, configured catalog or local
models cache, is copied with only native Plan Mode text changed. No catalog is
downloaded or model/provider silently substituted. Existing custom plan text,
permission/sandbox/profile choices and disabled collaboration instructions
require manual integration rather than replacement.

Confirmed setup creates a catalog under `.dotdotgod/codex-plan/`, a named
`$CODEX_HOME/dotdotgod-plan-<project-hash>.config.toml`, and `docs/plan/`.
Existing generated files are never overwritten. Launch with the reported
`codex --no-daemon --profile <name> --cd <root>` command and enter `/plan`.
This is an opt-in launch configuration, not automatic plugin activation.

The permission profile extends `:read-only`, reads the project and grants write
access to its concrete `docs/plan` subtree only. Writes include creation,
modification and deletion. The full subtree is allowed, not just README files.
Native instructions automatically save concrete plans in
`docs/plan/<task-slug>/README.md`, update the same task and retain native
questions/finalization and user-controlled mode switching. Unmodified sessions
remain conversational in native Plan Mode and save only after leaving it.

Leaving Plan Mode does not select implementation permissions. The user must
choose them separately. Managed policy and sandbox checks remain effective.
Unsupported versions or conflicting settings stop setup without broad fallback.
Profiles govern local native files/commands; MCP servers and hooks have separate
execution boundaries and must not be used to bypass planning restrictions.

## Antigravity

Antigravity native `/plan` uses **Option C-2**: native
`<artifactDirectoryPath>/implementation_plan.md`, inline comments, and the host
**Proceed** approval gate remain 100% host-owned and untouched.

- On a successful `PostToolUse` write/edit targeting exact
  `<realpath(artifactDirectoryPath)>/implementation_plan.md` (ignoring reads,
  sibling/workspace paths, `walkthrough.md`, `task.md`, and `scratch/**`), the
  hook reads the artifact read-only (`O_RDONLY | O_NOFOLLOW | O_NONBLOCK`,
  `fstat` regular-file `dev`/`ino` check, 2 MiB cap) and stores its SHA-256
  content hash in `.dotdotgod/context/impact.sqlite` `plan_notices` (24-hour
  TTL, storing no `$HOME` path).
- Hooks NEVER write workspace files and never bypass `/plan` read-only gates.
- On the next `PreInvocation`, `claimPlanNotice` emits a one-time advisory
  (`notified: 0 -> 1`, re-armed only when content hash changes) reminding the
  model to save the concrete plan to `<docRoot>/plan/<task-slug>/README.md` and
  `<docRoot>/plan/README.md` via native file write tools only when workspace
  writes are permitted. If writes are restricted or denied, the native artifact
  is kept.
- Writing `<docRoot>/plan/**/*.md` clears `plan_notices`. Moving completed plans
  to `<docRoot>/archive/plan/<task-slug>/` remains explicit.

## Adapter Boundaries

Planning and archive Markdown under `<docRoot>/(plan|archive)` does not create
pending advisory impact records across adapters; all six adapters keep pending
impact strictly advisory and non-blocking. Hook and MCP internal caches/state
are not claimed to be confined by the model's plan permission profile. Hermes
has no native Plan Mode. OpenCode keeps its separate native plan-agent
integration.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/claude-plans.mjs](../../packages/cli/src/claude-plans.mjs)
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
  - [packages/codex/src/native-plan.mjs](../../packages/codex/src/native-plan.mjs)
  - [packages/codex/scripts/setup-plan.mjs](../../packages/codex/scripts/setup-plan.mjs)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
  - [packages/context/src/hooks-antigravity.mjs](../../packages/context/src/hooks-antigravity.mjs)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
- Verified by:
  - [packages/cli/test/claude-plans.test.mjs](../../packages/cli/test/claude-plans.test.mjs)
  - [packages/codex/test/native-plan.test.mjs](../../packages/codex/test/native-plan.test.mjs)
  - [packages/claude-code/scripts/smoke-plans.mjs](../../packages/claude-code/scripts/smoke-plans.mjs)
  - [packages/codex/scripts/smoke-plan.mjs](../../packages/codex/scripts/smoke-plan.mjs)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
  - [packages/context/test/hooks-antigravity.test.mjs](../../packages/context/test/hooks-antigravity.test.mjs)
- Related docs:
  - [docs/test/NATIVE_PLAN_STORAGE.md](../test/NATIVE_PLAN_STORAGE.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
  - [docs/spec/ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)
- Design decisions:
  - [docs/arch/NATIVE_PLAN_INTEGRATION.md](../arch/NATIVE_PLAN_INTEGRATION.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/claude-plans.mjs","packages/cli/src/init.mjs","packages/codex/src/native-plan.mjs","packages/codex/scripts/setup-plan.mjs","packages/context/src/hooks.mjs","packages/context/src/hooks-antigravity.mjs","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/claude-plans.test.mjs","packages/codex/test/native-plan.test.mjs","packages/claude-code/scripts/smoke-plans.mjs","packages/codex/scripts/smoke-plan.mjs","packages/context/test/hooks.test.mjs","packages/context/test/hooks-antigravity.test.mjs"],"relatedDocs":["docs/test/NATIVE_PLAN_STORAGE.md","docs/spec/PROJECT_INITIALIZER.md","docs/spec/ANTIGRAVITY_ADAPTER.md"],"designDecisions":["docs/arch/NATIVE_PLAN_INTEGRATION.md"]}
```
