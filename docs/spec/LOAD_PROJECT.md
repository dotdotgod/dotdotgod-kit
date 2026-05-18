# Load Project

## Purpose

`load-project` is a Pi extension that starts a read-only project memory loading turn.

It helps the agent inspect the dotdotgod scaffold and summarize the current project context. This is a full curated project memory load: it covers the default memory surface needed for project work, but it does not read every repository file or every archive body.

## Commands

- `/load`: load project memory for the current working directory.
- `/dd:load`: stable namespaced alias for the same behavior.

`/dd:load` exists because other extensions may also register `/load`. Pi resolves duplicate extension commands with suffixes, so the namespaced command provides a clearer dotdotgod entrypoint.

## Read-Only Behavior

The command does not modify source, docs, or config files.

It first tries to run `dotdotgod load-snapshot <cwd> --json` and include a bounded snapshot summary in the loader prompt. The CLI read can lazily refresh `.dotdotgod/` cache metadata when the cache is missing or stale. If the CLI is unavailable or returns invalid JSON, the command falls back to a lightweight snapshot of expected memory files and docs directories, then sends a read-only loader prompt to the agent.

When the CLI snapshot is available, the prompt keeps the documentation directory summary compact and asks the agent to use memory areas, memory policy, communities, cache metadata, command guidance, and README indexes before reading individual docs. The lightweight fallback still lists discovered markdown files so repositories without a valid snapshot remain usable.

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

- use the `load-snapshot` summary first when present, including cache status, lazy refresh metadata, graph size, bounded memory-area summaries, bounded community summaries, and archive inclusion policy
- start with `AGENTS.md`, `README.md`, and `docs/README.md` when they are not already clear from the loaded context
- summarize product, architecture, code conventions, infrastructure/runtime dependencies, and verification context
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

The agent should summarize:

- project summary
- key working rules
- available commands and verification methods
- documentation map
- active plans
- relevant archive notes
- open TODO/TBD items or questions to clarify

## Current Snapshot Integration

`/load` and `/dd:load` use the unified CLI load snapshot as the preferred bounded project-memory map. The prompt includes compact cache, refresh, graph, memory-area, memory-policy, community, and command-guidance metadata but does not embed the full graph or archive bodies. `docs/archive/README.md` remains included as the archive map; other archive bodies remain excluded by default.

The snapshot includes `commandGuidance` so agents see environment-aware commands:

- `local-source`: use `node packages/cli/bin/dotdotgod.mjs` in the dotdotgod repository.
- `project-install`: use `npx dotdotgod` when `@dotdotgod/cli` is declared or installed.
- `missing-install`: recommend `npm install -D @dotdotgod/cli`, then `npx dotdotgod`.

Installing `@dotdotgod/pi` does not provide the `dotdotgod` binary.

## Hook Integration

Claude Code and Codex adapters may document optional start hooks that remind agents to use `dotdotgod load-snapshot <root> --json` or `/dd:load`/`dd:load` when project memory is needed. Those hooks do not replace the explicit load workflow. `load-snapshot` remains a bounded agent-facing map and may lazily refresh `.dotdotgod/` cache metadata when the cache is missing or stale, so hook examples should label automatic snapshot calls as cache-aware opt-ins.

## Future Extension Points

The command is intentionally a runtime extension entrypoint. It can later grow into:

- bounded graph impact reports grouped by related files, docs, tests, commands, events, package resources, and symbols
- vector search
- graph search
- `dd_search` or related LLM-callable tools
- `/dd:index`, `/dd:search`, or `/dd:status` commands

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/pi/extensions/load-project/index.ts",
    "packages/pi/extensions/load-project/utils.ts",
    "packages/shared/workflows/load.md",
    "packages/cli/src/core.mjs",
    "packages/claude-code/hooks/README.md",
    "packages/codex/hooks/README.md"
  ],
  "verifiedBy": [
    "packages/pi/test/load-project-utils.test.ts",
    "packages/cli/test/core.test.mjs",
    "packages/cli/test/e2e.test.mjs",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/spec/CROSS_AGENT_SUPPORT.md",
    "docs/arch/CROSS_AGENT_ARCHITECTURE.md",
    "docs/arch/EXTENSION_ARCHITECTURE.md",
    "docs/arch/VALIDATION_ARCHITECTURE.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/pi test",
    "pnpm --filter @dotdotgod/cli test",
    "node packages/cli/bin/dotdotgod.mjs load-snapshot . --json"
  ]
}
```
