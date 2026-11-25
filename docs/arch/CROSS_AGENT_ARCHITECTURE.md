# Cross-Agent Architecture

Code query, graph, and validation share [outline metadata](../spec/cli/CODE_OUTLINES.md).

## Purpose

This document defines the project memory kit across six adapters: Pi, OpenCode, Claude Code, Codex, Hermes, and Antigravity.

## Architectural Direction

Use shared source resources with thin generated agent adapters and one unified non-blocking advisory impact model.

```text
dotdotgod
├── packages/shared/                  # private shared source resources for generated adapters
├── packages/cli/                     # shared map, validation, query, and graph CLI
├── packages/context/                 # local execution, FTS5 retrieval, advisory hooks, stdio MCP
├── packages/pi/                      # generated Pi skills plus Pi extensions
├── packages/opencode/                # V2 plugin, native plan integration, advisory impact
├── packages/claude-code/             # generated Claude Code plugin commands, skills, advisory hooks
├── packages/codex/                   # generated Codex plugin skills, advisory hooks, MCP config
├── packages/hermes/                  # native Python lifecycle, per-session MCP, advisory impact
├── packages/antigravity/             # native Antigravity plugin, MCP, advisory hooks, C-2 /plan
├── scripts/generate-adapters.mjs     # shared workflow and adapter resource generator
└── scripts/build-adapter-runtime.mjs # esbuild bundler for self-contained adapter MCP/CLI/hooks
```

`packages/shared` owns workflows and initializer assets. `scripts/generate-adapters.mjs` renders adapter skills, commands, and platform guidance; `scripts/build-adapter-runtime.mjs` bundles self-contained MCP, CLI, parser, and hook artifacts into adapter packages so extracted tarballs run without workspace `node_modules`.

## Shared Source Responsibilities

`packages/shared` owns agent-neutral assets and contracts:

- `workflows/load.md`: common Load guidance using `dotdotgod map`, optional query, and README/tree fallback.
- `workflows/impact.md`: common graph-impact review guidance for post-edit related-doc/test/source checks before broad verification or handoff.
- `workflows/doc-clarify.md`: common documentation clarity workflow distributed solely through `@dotdotgod/skills`.
- `workflows/init.md`: common project initializer guidance using `dotdotgod init` with platform fallback placeholders.
- `initializer/scripts/init_project.sh`: deterministic fallback scaffold generator mirroring `dotdotgod init`.
- `initializer/references/agent-docs.md`: shared agent-doc naming reference.

Shared guidance must not depend on one agent's tool names, shortcuts, or extension APIs. Platform wrappers, frontmatter, command names, and runtime hooks stay in generated adapter resources or adapter code.

## Unified Non-Blocking Advisory Impact

All six adapters align on Pi's non-blocking advisory impact model backed by `.dotdotgod/context/impact.sqlite` (v2, 24-hour fixed TTL). Pending impact never blocks edits, tests, builds, commits, pushes, publishes, or other tools.

- **Pi (`before_agent_start`) & OpenCode (`session.hook('context')`)**: ephemeral per-turn reminders; session-bound MCP `withImpactReview` clears unchanged revisions on success.
- **Claude Code & Codex (`UserPromptSubmit` + `PostToolUse`)**: `PostToolUse` emits a single transition advisory when pending transitions `0 -> >0` and clears requested paths (`clearPaths`) on successful `project_impact`; `UserPromptSubmit` repeats per-turn reminders while pending > 0. `PreToolUse` is removed from `hooks.json`.
- **Antigravity (`PostToolUse` + `PreInvocation`)**: `PostToolUse` tracks CLI/App edits and clears on successful `project_impact` (`call_mcp_tool` or direct MCP); `PreInvocation` atomically claims unnotified rows once (`notified: 0 -> 1`) so persisted `injectSteps` do not repeat until new edits occur.
- **Hermes (`post_tool_call` + `before_llm`)**: native Python `sqlite3` interoperates with `impact.sqlite` v2; `before_llm` emits per-turn advisories and session-bound MCP clears on success.

## Adapter Responsibilities

### Pi Adapter

Package: `packages/pi/` (`@dotdotgod/pi`). Owns `skills/project-initializer/`, `extensions/plan-mode/`, and `extensions/load-project/`. Keeps host-managed MCP without forwarding aliases, pending-only `project_memory_load`, slash commands (`/dd:plan`, `/load`, `/dd:load`, `/impact-check`), `--dd-plan` startup flag, tool filtering, and durable advisory impact reminders.

### OpenCode Adapter

Package: `packages/opencode/` (`@dotdotgod/opencode`). Registers V2 commands/skills and bundled MCP, automatically persists concrete native plans, and shares `impact.sqlite` advisory tracking without blocking. See [OpenCode contract](../spec/OPENCODE_ADAPTER.md).

### Claude Code Adapter

Package: `packages/claude-code/` (`@dotdotgod/claude-code`). Ships `.claude-plugin/plugin.json`, `/dd:{load,plan,init,impact}` commands, four generated skills (`project-load`, `doc-first-planning`, `project-initializer`, `impact-review`), bundled MCP/CLI/hook artifacts (`${CLAUDE_PLUGIN_ROOT}`), and non-blocking advisory hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`). `document-clarify` stays separate in `@dotdotgod/skills`.

### Codex Adapter

Package: `packages/codex/` (`@dotdotgod/codex`). Ships `.codex-plugin/plugin.json`, four generated skills with `dd:{init,load,plan,impact}` trigger phrases, `AGENTS.md`-first flow, local `.mcp.json`, bundled MCP/CLI/hook artifacts, and trust-reviewed non-blocking advisory hooks (`SessionStart`, `UserPromptSubmit`, `PostToolUse`).

### Hermes Adapter

Package: `packages/hermes/` (`@dotdotgod/hermes`). Owns Python lifecycle/root routing (`__init__.py`, `runtime.py`, `policy.py`, `impact.py`), per-session Node MCP client over bundled server/CLI artifacts, and Path 1 non-blocking advisory impact via `post_tool_call` + `impact.sqlite`. Labels route projects, not access grants; no Plan Mode is ported. See [Hermes behavior](../spec/HERMES_ADAPTER.md) and [verification](../test/HERMES_ADAPTER.md).

### Antigravity Adapter

Package: `packages/antigravity/` (`@dotdotgod/antigravity`).

- `plugin.json`: Antigravity plugin manifest (`name: "dotdotgod"`, `logo: "assets/logo.svg"`, three `suggestedPrompts`, zero-prompt activation).
- `mcp_config.json`: stdio server key `context` (exposed as `dotdotgod_context`, `${PLUGIN_ROOT}/mcp/server.mjs`), resolving workspace root via MCP `roots/list`.
- `hooks.json`: `PostToolUse` and `PreInvocation` invoking `node ./scripts/hook-runtime.mjs <event>` (no `PreToolUse`, `SessionStart`, or `Stop`).
- `rules/AGENTS.md`: always-on router active only when `dotdotgod.config.json` or `.dotdotgod/` exists, enforcing approval and untrusted-data boundaries.
- `skills/`: three short generated skills (`dd-init`, `dd-load`, `dd-impact`) exposed as `/dd-*` with `dd:*` triggers (no root `commands/` folder or separate planning skill; `document-clarify` stays in `@dotdotgod/skills`).
- Native `/plan` Option C-2: hooks observe `<artifactDirectoryPath>/implementation_plan.md` read-only and emit a 1-time `PreInvocation` save advisory; native write tools persist `<docRoot>/plan/<task-slug>/README.md`.

See [Antigravity contract](../spec/ANTIGRAVITY_ADAPTER.md) and [verification](../test/ANTIGRAVITY_ADAPTER.md).

## Hook Boundaries

Packaged hooks across Claude Code, Codex, and Antigravity are narrow, fail-open, and strictly advisory. They never block host commands or file edits, never read legacy `.dotdotgod/context/runtime/*.json`, never initialize repositories, never run full verification or indexing, and never claim complete external mutation interception.

Optional user-configured hook documentation may illustrate read-only `dotdotgod status`, explicit `dotdotgod validate . --include-local-memory --check-index`, and cache-aware `dotdotgod query` / `dotdotgod graph` opt-ins. Docs must not present undocumented plan-transition hooks (`PrePlanMode`/`PostPlanMode`) as available.

## Packaging Strategy

Workspace packages published under fixed versions (`pnpm run publish:all`):

- `@dotdotgod/cli` (`packages/cli/`)
- `@dotdotgod/context` (`packages/context/`)
- `@dotdotgod/pi` (`packages/pi/`)
- `@dotdotgod/opencode` (`packages/opencode/`)
- `@dotdotgod/claude-code` (`packages/claude-code/`)
- `@dotdotgod/codex` (`packages/codex/`)
- `@dotdotgod/hermes` (`packages/hermes/`, installed as a native Hermes plugin)
- `@dotdotgod/antigravity` (`packages/antigravity/`, validated/installed via `agy plugin`)

The root package is private and orchestrates generation, bundling, verification, and dry-run packing.

## Migration And Generation Rules

- Edit shared workflow text in `packages/shared`, then run `pnpm run generate` (`scripts/generate-adapters.mjs` + `scripts/build-adapter-runtime.mjs`).
- Keep generated text tracked; generate ignored parser assets before source-local plugin installs or packing.
- Run `pnpm run verify:generated` to catch direct-edit drift.
- Keep `AGENTS.md`, `dotdotgod.config.json`, and docs scaffold contracts stable across all six adapters.

## Verification Strategy

Run `pnpm run generate`, `pnpm run verify:generated`, `pnpm run verify:contract`, `agy plugin validate --strict packages/antigravity`, `pnpm run verify`, and `pnpm run pack:dry-run`. Maintained [verification guidance](../test/README.md) and [cross-agent smoke](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md) cover all six adapters plus isolated Hermes pinned-host and Antigravity CLI/App smoke checks.

## Standalone Documentation Skill

`workflows/doc-clarify.md` generates only the standalone skill in `@dotdotgod/skills`. See [migration](../../packages/skills/MIGRATION.md).
