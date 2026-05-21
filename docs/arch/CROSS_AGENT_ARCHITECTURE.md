# Cross-Agent Architecture

## Purpose

This document defines how dotdotgod provides a cross-agent project memory kit for Pi, Claude Code, and Codex.

## Architectural Direction

Use shared source resources with thin generated agent adapters.

```text
dotdotgod
├── packages/shared/           # private shared source resources for generated adapters
├── packages/cli/              # shared CLI for validation, snapshots, and graph indexing
├── packages/pi/               # generated Pi skills plus Pi extensions
├── packages/claude-code/      # generated Claude Code plugin commands and skills
├── packages/codex/            # generated Codex plugin skills
└── scripts/generate-adapters.mjs
```

`packages/shared` is the source of truth for common workflow text and initializer resources. Adapter packages keep generated concrete files checked in so local installs and npm tarballs work without a build step.

## Shared Source Responsibilities

`packages/shared` owns agent-neutral assets and contracts:

- `workflows/load.md`: common project memory loading guidance, including snapshot-first CLI guidance with manual README-index fallback.
- `workflows/plan.md`: common doc-first planning guidance.
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

- slash command registration
- shortcut registration
- tool filtering
- session state
- active plan-file touch tracking and concise execute/stay/refine review prompts
- pending changed-file impact reminders and `/impact-check` enforcement before commit, push, or publish commands

Commands:

- `/plan`
- `/todos`
- `/load`
- `/dd:load`
- `/impact-check`

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
- project-memory initialization skill and `/dd:init` command
- project loading skill and `/dd:load` command
- planning workflow guidance using Claude-native command and skill components
- impact review workflow guidance using `/dd:impact` and `impact-review` for Pi-like changed-file graph checks without Pi runtime enforcement
- documentation clarity workflow guidance using `document-clarify` for config-aware docs copy improvements without changing behavior contracts
- generated load guidance that prefers `dotdotgod load-snapshot` when available and falls back to README-index reads
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
- reusable skills for initialization, loading, planning, impact-review, and documentation clarity workflows
- generated load guidance that prefers `dotdotgod load-snapshot` when available and falls back to README-index reads
- `AGENTS.md`-first instruction flow
- command-like trigger phrases: `dd:init`, `dd:load`, `dd:plan`, and `dd:impact`
- optional MCP/tooling integration when useful
- optional hook documentation for trusted Codex configuration layers

Codex adapter design should not depend on Pi-style command parity. Impact review parity is guidance-oriented: Codex should run graph-impact checks when asked or prompted by trusted hooks, but the adapter must not claim Pi's automatic pending-impact state or commit-blocking behavior.

## Hook Boundaries

Claude Code and Codex hooks are optional workflow accelerators, not required setup and not Pi Plan Mode parity. Adapter packages may document hook examples for session start, prompt submission, tool boundaries, batch-level feedback, stop-time hygiene, failure logging, and session cleanup, but hooks must stay opt-in unless a future package deliberately ships a safe advisory default.

Current platform evidence: Claude Code plugins can ship skills, command markdown, agents, hooks, MCP servers, LSP servers, and monitors, and plugin hooks can live at `hooks/hooks.json` or in the manifest. Codex plugins primarily bundle skills, apps, and MCP servers; current Codex hook docs also allow plugin-bundled hooks only when users enable `plugin_hooks`, and non-managed hooks require trust review. Dotdotgod therefore keeps hooks as documented opt-in guidance for now and uses skills/commands for default cross-agent parity.

Default examples should be advisory or read-only. `dotdotgod status` is safe for stop-time cache reporting because it does not rebuild the cache. `dotdotgod validate . --include-local-memory --check-index` is appropriate as an explicit validation hook because it checks docs and markdown index fingerprints without refreshing the cache. `dotdotgod load-snapshot` and `dotdotgod graph ...` are useful for context and impact, but they may lazily refresh `.dotdotgod/`, so hook docs must label them as cache-aware opt-ins with possible cache-refresh side effects.

Claude Code hook guidance may reference current lifecycle events such as `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolBatch`, `Stop`, `StopFailure`, and `SessionEnd` when useful. It must not present undocumented plan-mode transition hooks such as `PrePlanMode`, `PostPlanMode`, plan accept, or plan reject as available unless Claude Code officially documents them. SDLC guidance should frame hooks as optional guardrails around plan, implement, verify, review, and archive phases, with `AGENTS.md` remaining the cross-agent project brain.

Blocking hooks should be narrow and project-local. A `PreToolUse` plan-safety hook should block source/config writes only when an explicit plan-only state signal exists and the hook payload has been tested. Hooks must not auto-run full workspace verification, auto-run `dotdotgod index`, auto-initialize projects, move plans to the archive, or attempt to recreate Pi's pending-impact state unless the target runtime exposes a tested complete interception boundary.

## Packaging Strategy

Use a pnpm workspace monorepo:

```text
packages/cli/
packages/pi/
packages/claude-code/
packages/codex/
```

Published package names:

- `@dotdotgod/cli`
- `@dotdotgod/pi`
- `@dotdotgod/claude-code`
- `@dotdotgod/codex`

The root package is private and only orchestrates workspace verification and publishing.

Use fixed versions initially. Independent versions are only worth the overhead when adapter release cadences diverge.

## Migration Rules

- Keep current Pi behavior compatible after resources live under `packages/pi/`.
- Use `dd` for new namespaces and command prefixes.
- Edit common workflow text in `packages/shared`, then run `pnpm run generate`.
- Keep generated adapter files checked in for zero-build local installs.
- Use `pnpm run verify:generated` to catch drift when generated files are edited directly.
- Keep `AGENTS.md` and docs scaffold stable across adapters.
- Keep platform-specific enforcement in adapter code, not in shared docs.

## Verification Strategy

Generation and package verification:

```bash
pnpm run generate
pnpm run verify:generated
pnpm run verify
pnpm run pack:dry-run
```

Pi verification:

```bash
pi install /path/to/dotdotgod/packages/pi
pi install npm:@dotdotgod/pi
```

Claude Code verification should add:

- Claude Code plugin schema/load test
- local plugin smoke test for `/dd:load`, `/dd:plan`, `/dd:init`, and `/dd:impact`

Codex verification should add:

- Codex plugin discovery/load test
- Codex skill trigger smoke tests for project loading, planning, initialization, and impact review
- `dotdotgod init` dry-run and fallback initializer dry-run parity across adapters
