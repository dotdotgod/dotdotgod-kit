# Cross-Agent Architecture

Code query/graph/validation share [outline metadata](../spec/cli/CODE_OUTLINES.md).

## Purpose

This document defines the project memory kit for Pi, OpenCode, Claude Code, Codex, and Hermes.

## Architectural Direction

Use shared source resources with thin generated agent adapters.

```text
dotdotgod
├── packages/shared/           # private shared source resources for generated adapters
├── packages/cli/              # shared map, validation, query, and graph CLI
├── packages/context/          # local execution, FTS5 retrieval, hooks, and stdio MCP runtime
├── packages/pi/               # generated Pi skills plus Pi extensions
├── packages/claude-code/      # generated Claude Code plugin commands and skills
├── packages/codex/            # generated Codex plugin skills
├── packages/hermes/           # native lifecycle and per-session MCP routing
├── packages/opencode/         # V2 plugin, native plan integration and advisory impact
└── scripts/generate-adapters.mjs
```

Shared owns workflows and processing. Adapters bundle CLI/MCP; Claude/Codex add hooks. Generate parser assets before local installs/packing; tarballs need no build.

## Shared Source Responsibilities

`packages/shared` owns agent-neutral assets and contracts:

- `workflows/load.md`: common Load guidance using `dotdotgod map`, optional query, and README/tree fallback.
- `workflows/impact.md`: common graph-impact review guidance for post-edit related-doc/test/source checks before broad verification or handoff.
- `workflows/doc-clarify.md`: common documentation clarity workflow that uses memory-area metadata and dotdotgod default document roles while preserving behavior contracts.
- `workflows/init.md`: common project initializer guidance that uses `dotdotgod init` when available and provides platform-specific fallback script command placeholders when the CLI is absent.
- `initializer/scripts/init_project.sh`: deterministic fallback scaffold generator mirroring `dotdotgod init`.
- `initializer/references/agent-docs.md`: shared agent-doc naming reference.

Shared guidance must not depend on one agent's tool names, shortcuts, or extension APIs. Platform wrappers, frontmatter, command names, and runtime enforcement stay in generated adapter resources or adapter code.

## Adapter Responsibilities

### Pi Adapter

Package: `packages/pi/`

Current implementation:

- `package.json#pi`
- `skills/project-initializer/`
- `skills/document-clarify/`
- `extensions/plan-mode/`
- `extensions/load-project/`

Pi-specific behavior remains here:

- shared MCP execution/retrieval without aliases; plan/UI and pending-only project_memory_load remain Pi-owned
- slash command registration
- shortcut registration
- tool filtering
- session state
- active plan-file touch tracking and concise execute/stay/refine review prompts
- durable pending-impact tracking and advisory reminders, with no pending-based command blocks or approval dialogs

Plan Mode startup flag: `--dd-plan`. Its namespace allows other Pi extensions to own the generic `--plan` flag.

Commands:

- `/dd:plan`
- `/load`
- `/dd:load`
- `/impact-check`

### OpenCode Adapter

packages/opencode registers V2 commands/skills and bundled MCP. Native plan integration automatically saves concrete project plans; no dd:plan or duplicate native project tools exist. Shared state tracks advisory impact without blocking. See [contract](../spec/OPENCODE_ADAPTER.md).

### Claude Code Adapter

Package: `packages/claude-code/`

Current implementation:

- `.claude-plugin/plugin.json`
- `commands/dd/load.md`
- `commands/dd/plan.md`
- `commands/dd/init.md`
- `commands/dd/impact.md`
- `skills/project-load/`
- `skills/doc-first-planning/`
- `skills/project-initializer/`
- `skills/impact-review/`
- `skills/document-clarify/`

Responsibilities:

- Claude plugin manifest and installable resources
- generated self-contained core stdio MCP server and CLI artifacts for generic context tools and project load/impact/initialize operations
- packaged lifecycle hooks for load-required and impact-pending deny/retry routing
- project-memory initialization skill and `/dd:init` command
- project loading skill and `/dd:load` command
- planning workflow guidance using Claude-native command and skill components
- impact review workflow guidance using `/dd:impact` and `impact-review` for Pi-like changed-file graph checks without Pi runtime enforcement
- documentation clarity workflow guidance using `document-clarify` for config-aware docs copy improvements without changing behavior contracts
- generated Load guidance using `dotdotgod map` for the tree and `query` for focus
- optional hook documentation for advisory reminders, opt-in validation, and narrowly scoped plan-safety patterns

### Codex Adapter

Package: `packages/codex/`

Current implementation:

- `.codex-plugin/plugin.json`
- `skills/project-load/`
- `skills/doc-first-planning/`
- `skills/project-initializer/`
- `skills/impact-review/`
- `skills/document-clarify/`

Responsibilities:

- Codex plugin manifest and package resources
- generated self-contained core stdio MCP server and CLI artifacts plus local MCP configuration for project workflows
- trust-reviewed lifecycle hooks for load-required and impact-pending deny/retry routing
- reusable skills for initialization, loading, planning, impact-review, and documentation clarity workflows
- generated Load guidance using `dotdotgod map` for the tree and `query` for focus
- `AGENTS.md`-first instruction flow
- command-like trigger phrases: `dd:init`, `dd:load`, `dd:plan`, and `dd:impact`
- optional MCP/tooling integration when useful
- optional hook documentation for trusted Codex configuration layers

Codex adapter design should not depend on Pi-style command parity. Its trusted hook gates remain host-specific; Pi/OpenCode now track pending impact without commit blocking.

### Hermes Adapter

packages/hermes owns Python lifecycle/root routing and a per-session Node MCP
client over generated shared server/CLI artifacts; same-root SQLite stays shared.
Labels route projects, not access grants; host/OS permissions control access.
Session IDs are optional, not permissions.
No Plan Mode is ported. See [Hermes behavior](../spec/HERMES_ADAPTER.md) and
[verification](../test/HERMES_ADAPTER.md).

## Hook Boundaries

Claude Code and Codex hooks are optional workflow accelerators, not required setup and not Pi Plan Mode parity. Adapter packages may document hook examples for session start, prompt submission, tool boundaries, batch-level feedback, stop-time hygiene, failure logging, and session cleanup, but hooks must stay opt-in unless a future package deliberately ships a safe advisory default.

Claude Code plugins support skills, commands, agents, hooks, MCP, LSP and monitors; hooks use hooks/hooks.json or the manifest. Codex supports skills/apps/MCP and plugin hooks with plugin_hooks enabled; non-managed hooks require trust review. These adapters retain opt-in hook guidance and default skill/command parity.

Default examples should be advisory or read-only. `dotdotgod status` is safe for stop-time cache reporting because it does not rebuild the cache. `dotdotgod validate . --include-local-memory --check-index` is appropriate as an explicit validation hook because it checks docs and Markdown/outline fingerprints without rebuilding. `dotdotgod query` and `dotdotgod graph ...` are useful for context and impact, but they may refresh ignored `.dotdotgod/` caches, so hook docs must label them as cache-aware opt-ins.

Claude Code hook guidance may reference current lifecycle events such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `Stop`, `StopFailure`, and `SessionEnd` when useful. It must not present undocumented plan-mode transition hooks such as `PrePlanMode`, `PostPlanMode`, plan accept, or plan reject as available unless Claude Code officially documents them. SDLC guidance should frame hooks as optional guardrails around plan, implement, verify, review, and archive phases, with `AGENTS.md` remaining the cross-agent project brain.

Hooks must be narrow and tested. Plan-only source/config blocks require explicit state. Hooks must not automatically run workspace verification/indexing, initialize projects, archive plans or claim complete mutation interception.

## Packaging Strategy

Use a pnpm workspace monorepo:

```text
packages/cli/
packages/pi/
packages/claude-code/
packages/codex/
packages/hermes/
```

Published package names:

- `@dotdotgod/cli`
- `@dotdotgod/pi`
- `@dotdotgod/claude-code`
- `@dotdotgod/codex`

The @dotdotgod/hermes npm tarball installs as a native Hermes plugin; npm
installation alone does not activate it.

The root package is private and only orchestrates workspace verification and publishing.

Use fixed versions initially. Independent versions are only worth the overhead when adapter release cadences diverge.

## Migration Rules

- Keep current Pi behavior compatible after resources live under `packages/pi/`.
- Use `dd` for new namespaces and command prefixes.
- Edit common workflow text in `packages/shared`, then run `pnpm run generate`.
- Keep generated text tracked; run generate for ignored parser assets before source-local plugin installs/packing.
- Use `pnpm run verify:generated` to catch drift when generated files are edited directly.
- Keep `AGENTS.md` and docs scaffold stable across adapters.
- Keep platform-specific UX enforcement in adapter code, but keep cross-agent quality contracts such as plan validation in the shared CLI.

## Verification Strategy

Run pnpm run generate, verify:generated, verify and pack:dry-run. Maintained
[verification guidance](../test/README.md) and
[cross-agent smoke](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md) cover Pi local/npm
installation, Claude plugin schemas/commands, Codex discovery/skill triggers and
initializer dry-run/fallback parity. Hermes adds its isolated pinned-host smoke.
