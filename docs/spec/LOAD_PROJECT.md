# Load Project

## Purpose

`load-project` is a Pi extension that starts a project-content read-only memory loading turn.

It helps the agent inspect the dotdotgod scaffold and summarize the current project context. Explicit manual `/load` defaults to a fuller curated project memory load, while automatic prompt-injected refreshes should request compact mode. Both modes avoid reading every repository file or every archive body.

## Commands

- `/load`: load project memory for the current working directory in full mode.
- `/dd:load`: stable namespaced alias for the same behavior.
- `/load compact` or `/dd:load compact`: request the compact/delta-oriented summary for prompt-injected refreshes or already-loaded sessions.

`/dd:load` exists because other extensions may also register `/load`. Pi resolves duplicate extension commands with suffixes, so the namespaced command provides a clearer dotdotgod entrypoint.

## Mode Selection

Use full mode for explicit manual project-memory loads, first-session orientation, or deliberate context resets where the user asks for the complete working map. Do not repeat full mode just because a follow-up task starts in an already-loaded session.

Use compact mode for automatic refreshes, Plan Mode context shaping, resumed sessions that already have stable project background, and follow-up work where only deltas, relevant active plans, or next reads are needed.

After either mode, agents should prefer targeted reads over broad scans:

- `docs/spec/` for user-facing behavior and CLI/API contracts.
- `docs/arch/` for implementation boundaries, architecture rationale, and code conventions.
- `docs/test/` for verification strategy and regression coverage.
- `docs/plan/` for active task intent, only after listing available entries.
- `docs/archive/README.md` as a routing map only when completed work or reports are directly relevant.

## Read-Only Behavior

The command does not modify source, docs, or config files. This is a project-content read-only boundary, not a guarantee that ignored cache files never change.

It first tries to run `dotdotgod load-snapshot <cwd> --json` and include a bounded snapshot summary in the loader prompt. The CLI read can lazily refresh `.dotdotgod/` cache metadata when the cache is missing or stale. If the CLI is unavailable or returns invalid JSON, the command falls back to a lightweight snapshot of expected memory files and docs directories, then sends a read-only loader prompt to the agent.

When the CLI snapshot is available, the prompt keeps the documentation directory summary compact and asks the agent to use memory areas, communities, cache metadata, archive policy, and README indexes before reading individual docs. Command guidance, command/event lists, and per-community path-heavy details are reserved for explicit full or verbose loads. The bounded fallback lists only a small number of discovered markdown files per docs area so repositories without a valid snapshot remain usable without flooding the prompt.

The agent is instructed to use read-only tools such as:

- `read`
- `ls`
- `grep`
- `find`

## Baseline Files

The loader checks for these baseline files:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `README.md`
- `docs/README.md`
- `docs/spec/README.md`
- `docs/test/README.md`
- `docs/arch/README.md`
- `docs/plan/README.md`
- `docs/archive/README.md`

## Documentation Loading Rules

The loader prompt asks the agent to:

- use the `load-snapshot` summary first when present, including cache status, lazy refresh metadata, graph size, compact memory-area labels, compact community labels, and archive inclusion policy
- start with `AGENTS.md`, `README.md`, and `docs/README.md` when they are not already clear from the loaded context
- summarize product, architecture, code conventions, infrastructure/runtime dependencies, and verification context at the detail level requested by the load mode
- inspect docs/spec, docs/arch, and docs/test selectively unless a task needs a full refresh
- follow `README.md` indexes, including domain directories such as `docs/<area>/<domain>/README.md`
- follow expanded convention directories such as `docs/arch/conventions/README.md`
- list `docs/plan` first and read only relevant active plan files
- exclude `docs/archive` from the documentation directory summary
- use `docs/archive/README.md` or targeted archive paths only when the user request or current task makes completed plans/reports relevant
- distinguish completed plan archives under `docs/archive/plan/` from temporary reports under `docs/archive/report/` when archive lookup is needed

## Debug Measurement

When the Pi adapter is started with `--dd-context-debug`, `/load` and `/dd:load` record local JSONL measurement events before and after sending the load prompt.

The event includes prompt character/word/approx-token counts, context usage when available, git state, the docs directories included in the default summary, and whether the CLI load snapshot succeeded. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

## Response Shape

In compact mode, the agent should summarize:

- compact project-memory status: what is available, stale, missing, or newly refreshed
- relevant docs map: only docs areas or README indexes likely needed for the current request
- active plan hints: active plan paths only when relevant
- next recommended reads: a short, bounded list, or a note that no further reads are needed

In full mode, the agent may include the fuller project summary, key working rules, commands and verification methods, documentation map, active plans, relevant archive notes, and open TODO/TBD items. Full mode is the default for explicit manual `/load`; compact mode should be used by automated prompts and follow-up refreshes unless the user asks for full.

## Current Snapshot Integration

`/load` and `/dd:load` use the unified CLI load snapshot as the preferred bounded project-memory map. Compact prompts include compact cache, refresh, graph, memory-area, memory-policy, and community metadata but do not embed command/event-heavy details, the full graph, or archive bodies. Default full/verbose loads may include command guidance and more detailed area/community entries. `docs/archive/README.md` remains included as the archive map; other archive bodies remain excluded by default.

The snapshot includes `commandGuidance` so agents see environment-aware commands:

- `local-source`: use `node packages/cli/bin/dotdotgod.mjs` in the dotdotgod repository.
- `project-install`: use `npx dotdotgod` when `@dotdotgod/cli` is declared or installed.
- `missing-install`: recommend `npm install -D @dotdotgod/cli`, then `npx dotdotgod`.

Installing `@dotdotgod/pi` does not provide the `dotdotgod` binary.

## Hook Integration

Claude Code and Codex adapters may document optional start hooks that remind agents to use `dotdotgod load-snapshot <root> --json` or `/dd:load`/`dd:load` when project memory is needed. Those hooks do not replace the explicit load workflow. `load-snapshot` remains a bounded agent-facing map and may lazily refresh `.dotdotgod/` cache metadata when the cache is missing or stale, so hook examples should label automatic snapshot calls as cache-aware opt-ins.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/load-project/index.ts](../../packages/pi/extensions/load-project/index.ts)
  - [packages/pi/extensions/load-project/utils.ts](../../packages/pi/extensions/load-project/utils.ts)
  - [packages/shared/workflows/load.md](../../packages/shared/workflows/load.md)
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/claude-code/hooks/README.md](../../packages/claude-code/hooks/README.md)
  - [packages/codex/hooks/README.md](../../packages/codex/hooks/README.md)
- Verified by:
  - [packages/pi/test/load-project-utils.test.ts](../../packages/pi/test/load-project-utils.test.ts)
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/README.md](../test/README.md)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/pi test`
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs load-snapshot . --json`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/load-project/index.ts","packages/pi/extensions/load-project/utils.ts","packages/shared/workflows/load.md","packages/cli/src/core.mjs","packages/claude-code/hooks/README.md","packages/codex/hooks/README.md"],"verifiedBy":["packages/pi/test/load-project-utils.test.ts","packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/README.md"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/VALIDATION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/pi test","pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs load-snapshot . --json"]}
```
