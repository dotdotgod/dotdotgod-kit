# @dotdotgod/pi

[![npm version](https://img.shields.io/npm/v/@dotdotgod/pi.svg)](https://www.npmjs.com/package/@dotdotgod/pi) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod-kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/pi) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](../../LICENSE)

> **Change a file, know what else must be checked.**

```bash
$ dotdotgod graph impact . --changed packages/cli/src/core.mjs --compact
```

```text
docs:
- docs/spec/REFERENCE_EXPANSION.md (91; incoming:implemented_by, semantic_similarity)
- docs/test/REFERENCE_EXPANSION.md (65.3; verified_by, semantic_similarity)
- docs/spec/LOAD_PROJECT.md (35.8; related_doc, semantic_similarity)

tests:
- packages/cli/test/core.test.mjs (78.6; semantic_similarity, incoming:semantic_similarity, verified_by)
- packages/cli/test/e2e.test.mjs (51.4; verified_by)

files:
- packages/cli/src/core.mjs (100; changed-file)
- packages/pi/extensions/plan-mode/index.ts (45; implemented_by, semantic_similarity)
```

`graph impact` ranks the specs, tests, architecture notes, config docs, and source files most likely to matter for a change. `--compact` keeps a short text summary, `--yml`/`--yaml` returns a compact structured agent-facing summary, and `--json` returns machine-readable detail. It uses the project-memory graph built from Markdown links, README routes, headings, traceability blocks, package metadata, memory areas, and deterministic routing hints.

Pi adapter for dotdotgod's context curation workflow. It gives Pi the most complete dotdotgod loop: initialize the fixed load-context surface, use explicit maintained graph links for impact-aware planning, execute verified steps, and archive completed work as future project memory.

Use this package when you want Pi to make repository work start from stable specs, tests, architecture, active plans, archive maps, and graph/cache metadata instead of raw chat history. During the loop, agents help keep README routes, traceability, plans, and archives current so `graph impact` quality stays useful over time.

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
- **Task-directed loading:** `/dd:load` starts from `dotdotgod load-snapshot` when available, then reads only relevant docs from the fixed memory surface.
- **Safe planning:** `/plan` keeps source/config changes blocked while request framing turns implementation-looking asks into durable plans under `docs/plan/` first.
- **Impact-aware context shaping:** Plan Mode can queue curated load when baseline docs are missing or context has narrowed to one docs area, and can use `dotdotgod expand --with-impact` for explicit `[[...]]` refs and `expand --fuzzy --with-impact` for high-signal natural references from the maintained graph.
- **Impact enforcement:** after source/config edits, Pi can remind the agent to run `dotdotgod_graph_impact` or `/impact-check`, return structured YML impact summaries, and block commit/push/publish commands until pending impact checks pass.
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

The Pi adapter relies on the CLI graph when available but does not ask agents to read a giant graph report. `load-snapshot` returns bounded cache status, graph size, memory areas, communities, and archive policy. `graph impact` and reference expansion use explicit maintained links to surface related specs, tests, source, and config for a change before broad scanning.

The graph uses more than traceability blocks: Markdown links, README routes, headings, package metadata, memory-area membership, commands, tests, and deterministic routing hints all contribute. Archive bodies are excluded by default; `docs/archive/README.md` is the map.

## Commands

```text
/plan           Toggle safe planning mode.
/todos          Show tracked plan progress during execution.
/impact-check   Run graph impact checks for pending or git-changed files.
/load           Load project memory for the current repository.
/dd:load        Stable namespaced alias for project memory loading.
```

## Included

- `project-initializer` skill: the starting point for `AGENTS.md`, thin agent entrypoints, docs folders, README indexes, and local memory/cache ignores.
- `plan-mode` extension: read-first planning mode with restricted tools, request framing, optional `--plan-extra-tools`, docs/plan writes, execution tracking, tiered hidden prompts, mandatory impact/validation guidance, `/todos`, `dotdotgod_graph_impact`, and `/impact-check`.
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`.

## Local Development

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
pnpm --filter @dotdotgod/pi run verify
pnpm --filter @dotdotgod/pi run pack:dry-run
```

## Learn More

See the [root README](../../README.md), [GitHub repository](https://github.com/dotdotgod/dotdotgod-kit), [`docs/concept/CONTEXT_CURATION.md`](../../docs/concept/CONTEXT_CURATION.md), [`docs/concept/CONTEXT_MECHANICS.md`](../../docs/concept/CONTEXT_MECHANICS.md), [`docs/spec/MEMORY_AREA_CONFIG.md`](../../docs/spec/MEMORY_AREA_CONFIG.md), and [`docs/spec/TRACEABILITY_CONFIG.md`](../../docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

The Pi adapter focuses on workflow: initialize the project memory scaffold, load a bounded snapshot, plan before source edits, and archive completed work for future sessions. Graph/cache output is a compact map; detail still comes from targeted file reads.
