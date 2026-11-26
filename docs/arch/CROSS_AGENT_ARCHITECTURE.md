# Cross-Agent Architecture

Code query, graph, and validation share [outline metadata](../spec/cli/CODE_OUTLINES.md).

## Purpose

This document defines the project memory kit across six adapters: Pi, OpenCode, Claude Code, Codex, Hermes, and Antigravity.

## Workspace And Shared Assets

- [CLI](../../packages/cli/README.md) (`packages/cli`): public package; owns the
  documentation/graph CLI, context services, hooks, the installer, and all
  adapter assets. `bin/dotdotgod.mjs` dispatches `mcp`, `mcp-bridge`, and `hook`
  before loading ordinary CLI commands.
- [Pi](../../packages/pi/README.md) (`packages/pi`): public native package with
  extensions and an initializer skill. Depends only on the CLI at runtime;
  Pi SDK and UI libraries are peers.
- [Obsidian](../../packages/obsidian/README.md) (`packages/obsidian`): private
  workspace package builds the community plugin. The root workspace is private.

`packages/cli/assets/` owns workflows, initializer templates and POSIX fallback,
host-specific files, and optional skills. Keep shared workflow text host-neutral.
Host renderers under `packages/cli/src/adapters/hosts/` supply platform paths,
frontmatter, command names, and bindings at installation time. OpenCode and
Hermes ship thin host code, not private copies of the CLI.

`scripts/generate-adapters.mjs` synchronizes three asset sets: canonical
initializer templates, Pi's initializer resources, and the optional
`document-clarify` skill. Edit the canonical inputs, run `pnpm run generate`
and check drift with `pnpm run verify:generated`. There is no adapter runtime
bundling step. Parser patches ship once in the CLI; see
[outline metadata](../spec/cli/CODE_OUTLINES.md).

## Unified Non-Blocking Advisory Impact

All six adapters align on Pi's non-blocking advisory impact model backed by `.dotdotgod/context/impact.sqlite` (v3, 24-hour fixed TTL). Pending impact never blocks edits, tests, builds, commits, pushes, publishes, or other tools.

- **Pi (`before_agent_start`) & OpenCode (`session.hook('context')`)**: ephemeral per-turn reminders; session-bound MCP `withImpactReview` clears unchanged revisions on success.
- **Claude Code & Codex (`UserPromptSubmit` + `PostToolUse`)**: `PostToolUse` emits a single transition advisory when pending transitions `0 -> >0` and clears requested paths (`clearPaths`) on successful `project_impact`; `UserPromptSubmit` repeats per-turn reminders while pending > 0. `PreToolUse` is removed from `hooks.json`.
- **Antigravity (`PostToolUse` + `PreInvocation`)**: `PostToolUse` tracks CLI/App edits and clears on successful `project_impact` (`call_mcp_tool` or direct MCP); `PreInvocation` atomically claims unnotified rows once (`notified: 0 -> 1`) so persisted `injectSteps` do not repeat until new edits occur.
- **Hermes (`post_tool_call` + `before_llm`)**: native Python `sqlite3` interoperates with `impact.sqlite` v3; `before_llm` emits per-turn advisories and session-bound MCP clears on success.

## Host And Installer Responsibilities

The [installer contract](../spec/cli/ADAPTER.md) separates file placement and
explicit host activation. Claude Code and Codex receive local marketplaces;
Antigravity receives a directly discoverable plugin; OpenCode receives a
local ESM plugin and an owned configuration entry; Hermes receives Python
plugin files and a binding to the CLI bridge. Pi uses its own package
manager; the CLI's Pi target only participates in the shared skill ledger.

`runtime-binding.mjs` selects canonical, stable Node and CLI paths by default.
`--use-path` opts into a validated but host-environment-dependent discovery path.
`marker-store.mjs` records managed files and config entries by host and scope;
`optional-skills.mjs` tracks skill owners separately. Writes preflight inputs
and compare byte snapshots before atomic per-file replacements. Staging
markers support interrupted installs; per-file atomicity is not a multi-file
transaction or a guarantee against concurrent lost updates. See
[context execution](CONTEXT_EXECUTION_ARCHITECTURE.md) for runtime internals.

## Hook Boundaries

Packaged hooks across Claude Code, Codex, and Antigravity are narrow, fail-open, and strictly advisory. They never block host commands or file edits, never read legacy `.dotdotgod/context/runtime/*.json`, never initialize repositories, never run full verification or indexing, and never claim complete external mutation interception.

Optional user-configured hook documentation may illustrate read-only `dotdotgod status`, explicit `dotdotgod validate . --include-local-memory --check-index`, and cache-aware `dotdotgod query` / `dotdotgod graph` opt-ins. Docs must not present undocumented plan-transition hooks (`PrePlanMode`/`PostPlanMode`) as available.

## Packaging And Verification

Only the CLI and Pi are npm publish targets. There are no per-host runtime
tarballs or bundled copies of MCP, CLI or parser code. See
[workspace verification](../spec/WORKSPACE_VERIFICATION.md),
[packaging and smoke tests](../test/README.md), and the
[migration and retirement runbook](../spec/ADAPTER_MIGRATION.md).
