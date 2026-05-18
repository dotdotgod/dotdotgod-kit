# @dotdotgod/pi

[![npm version](https://img.shields.io/npm/v/@dotdotgod/pi.svg)](https://www.npmjs.com/package/@dotdotgod/pi) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod-181717?logo=github)](https://github.com/dotdotgod/dotdotgod/tree/main/packages/pi) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](../../LICENSE)

> **Change a file, know what else must be checked.**

Pi adapter for dotdotgod's context curation workflow. It gives Pi the most complete dotdotgod loop: initialize a project-memory scaffold, load bounded context, plan before source edits, execute explicit steps, verify, and archive completed work.

Impact/context in practice:

```text
Initialize docs scaffold → /dd:load bounded memory → /plan durable intent
        ↓                         ↓                         ↓
 specs/arch/tests/archive map   graph/cache summaries       execute + verify + archive
```

Use this package when you want Pi to make repository work start from stable specs, tests, architecture, active plans, archive maps, and graph/cache metadata instead of raw chat history.

## Start Here: Run the Project Initializer Skill

After installing the package, open Pi in your repository and ask it to initialize or normalize the project memory scaffold. The bundled skill is named `project-initializer`; it uses `dotdotgod init` when the CLI is available, but it also includes a shell fallback.

```bash
pi install npm:@dotdotgod/pi
```

Use natural language in Pi:

```text
Initialize this project with dotdotgod.
Set up AGENTS.md, CLAUDE.md, CODEX.md, and docs folders.
Create a doc-first project baseline for this repository.
```

A good first-run flow is:

1. Install the package.
2. Start Pi in the target repository.
3. Ask: `Initialize this project with dotdotgod.`
4. Review the files the skill plans to create or skip.
5. Let the skill create the scaffold.
6. Run `/dd:load` to load bounded project memory.
7. Use `/plan` before implementation work.

## What You Get

- **Project initializer skill:** create `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs indexes, active-plan space, archive map, and local memory/cache ignores.
- **Task-directed loading:** `/dd:load` starts from `dotdotgod load-snapshot` when available, then reads only relevant docs.
- **Safe planning:** `/plan` keeps source/config changes blocked while the agent writes or updates durable task intent under `docs/plan/`.
- **Impact-aware context shaping:** Plan Mode can use `dotdotgod expand --with-impact` for explicit `[[...]]` refs and `expand --fuzzy --with-impact` for high-signal natural references.
- **Execution continuity:** completed plan steps are reported with explicit `[DONE:n]` markers so progress survives long sessions and compaction.
- **Reusable history:** completed work moves to `docs/archive/plan/`, while `docs/archive/README.md` remains the lightweight history map.
- **Cross-agent conventions:** the same `AGENTS.md`, docs, plan, and archive structure works with dotdotgod's CLI, Claude Code, and Codex packages.

## The Memory Shape Initialized by the Skill

```text
AGENTS.md                    # canonical working rules for agents
CLAUDE.md                    # thin Claude Code pointer to AGENTS.md
CODEX.md                     # thin Codex pointer to AGENTS.md
docs/
  README.md                  # project documentation map
  spec/README.md             # behavior, requirements, product truth
  arch/README.md             # architecture, conventions, boundaries
  test/README.md             # verification strategy and smoke tests
  plan/README.md             # active local plans, ignored by git
  archive/README.md          # completed-work history map, ignored by git
```

By default, `docs/spec/**` has two roles: it is stable shared/fresh project memory, and it is the traceability-enforced behavior-spec path. Those knobs are separate: projects can customize memory classification with `memory.areas` and traceability enforcement with `traceability.required` / `traceability.exclude`.

## Graph and Bounded Loading

The Pi adapter relies on the CLI graph when available but does not ask agents to read a giant graph report. `load-snapshot` returns bounded cache status, graph size, memory areas, communities, and archive policy. `graph impact` and reference expansion can surface related specs, tests, source, and config for a change before broad scanning.

The graph uses more than traceability blocks: Markdown links, README routes, headings, package metadata, memory-area membership, commands, tests, and deterministic routing hints all contribute. Archive bodies are excluded by default; `docs/archive/README.md` is the map.

## Commands

```text
/plan      Toggle safe planning mode.
/todos     Show tracked plan progress during execution.
/load      Load project memory for the current repository.
/dd:load   Stable namespaced alias for project memory loading.
```

## Included

- `project-initializer` skill: the starting point for `AGENTS.md`, thin agent entrypoints, docs folders, README indexes, and local memory/cache ignores.
- `plan-mode` extension: read-first planning mode with restricted tools, optional `--plan-extra-tools`, docs/plan writes, execution tracking, tiered hidden prompts, and `/todos`.
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`.

## Local Development

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
pnpm --filter @dotdotgod/pi run verify
pnpm --filter @dotdotgod/pi run pack:dry-run
```

## Learn More

See the [root README](../../README.md), [GitHub repository](https://github.com/dotdotgod/dotdotgod), [`docs/concept/CONTEXT_CURATION.md`](../../docs/concept/CONTEXT_CURATION.md), [`docs/concept/CONTEXT_MECHANICS.md`](../../docs/concept/CONTEXT_MECHANICS.md), [`docs/spec/MEMORY_AREA_CONFIG.md`](../../docs/spec/MEMORY_AREA_CONFIG.md), and [`docs/spec/TRACEABILITY_CONFIG.md`](../../docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

The Pi adapter focuses on workflow: initialize the project memory scaffold, load a bounded snapshot, plan before source edits, and archive completed work for future sessions. Graph/cache output is a compact map; detail still comes from targeted file reads.
