# @dotdotgod/pi

> **Change a file, know what else must be checked.**

Pi adapter for dotdotgod's context curation workflow. **Start with the `project-initializer` skill**: it creates the structured project memory scaffold that lets `/dd:load` and `/plan` start source changes with the right specs, tests, commands, and task intent in view.

Use it when you want Pi to turn a repository into durable agent memory: shared rules, specs, architecture, test strategy, active plans, archived decisions, and a bounded load snapshot.

The adapter is designed for builders who want coding agents to help with implementation while product intent, design rationale, verification standards, and project memory stay explicit. The initializer, `/dd:load`, and `/plan` workflow give those decisions a stable place outside the chat transcript.

## Start Here: Run the Project Initializer Skill

After installing the package, open Pi in your repository and ask it to initialize or normalize the project memory scaffold. The bundled skill is named `project-initializer`; it uses `dotdotgod init` when the CLI is already available, but it does not require the CLI and falls back to its bundled shell script when needed.

Use natural language in Pi:

```text
Initialize this project with dotdotgod.
Set up AGENTS.md, CLAUDE.md, CODEX.md, and docs folders.
Create a doc-first project baseline for this repository.
```

A good first-run flow is:

1. Install the package with `pi install npm:@dotdotgod/pi`.
2. Start Pi in the target repository.
3. Ask: `Initialize this project with dotdotgod.`
4. Review the files the skill plans to create or skip.
5. Let the skill create the scaffold.
6. Then use `/dd:load` to load the new project memory and `/plan` for implementation planning.

The initializer is the first step: it creates the structure that later lets `/dd:load` find the right context and `/plan` write durable task intent before implementation begins.

## What You Get

- **Project initializer skill:** create `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs indexes, active-plan space, archive map, and local memory/cache ignores.
- **Structured project memory:** give project knowledge a stable home before the agent starts loading or planning.
- **Task-directed loading:** `/dd:load` starts from a bounded `dotdotgod load-snapshot` map with memory-area summaries when available, then reads only relevant docs.
- **Safer planning:** `/plan` keeps source/config changes blocked while the agent writes or updates a durable plan under `docs/plan/`.
- **Execution continuity:** completed plan steps are reported with explicit `[DONE:n]` markers, making progress recoverable after long sessions or compaction.
- **Reusable history:** completed work moves to `docs/archive/plan/`, while `docs/archive/README.md` remains the lightweight history map for future tasks.
- **Cross-agent conventions:** the same `AGENTS.md`, docs, plan, and archive structure also works with dotdotgod's Claude Code and Codex adapters.

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

This is the core context curation idea: give the agent a predictable map of what matters, what product decisions have been made, where current intent lives, how to verify changes, and which past decisions are worth revisiting.

## Install

```bash
pi install npm:@dotdotgod/pi
```

For local development:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

## Included

- `project-initializer` skill: the starting point; creates `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs folders, README indexes, and local memory/cache ignores.
- `plan-mode` extension: read-first planning mode with restricted tools, optional `--plan-extra-tools` additions for installed external tools, docs/plan writes, execution tracking, tiered hidden prompts, and `/todos`.
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`, using `dotdotgod load-snapshot` when available with bounded cache, graph, memory-area, community, and archive-policy summaries plus a lightweight fallback.

## Expected Improvements

- New sessions can start from the same durable project map.
- Agents can distinguish stable project truth (`docs/spec`, `docs/arch`, `docs/test`) from current task intent (`docs/plan`).
- README indexes act as routing tables: the CLI records them as `routes_to` edges, while docs paths become memory-area metadata for specs, architecture, tests, active plans, and archive maps.
- Archive history stays discoverable without forcing every completed plan body into the default context.
- Product intent, planning, and verification become explicit artifacts.
- Graph/cache metadata stays bounded in `.dotdotgod/`, with agent-facing output limited to summaries, memory areas, omitted counts, and archive policy.

## Commands

```text
/plan      Toggle safe planning mode.
/todos     Show tracked plan progress during execution.
/load      Load project memory for the current repository.
/dd:load   Stable namespaced alias for project memory loading.
```

## Compared with Graphify-Style Memory

The Pi adapter focuses on workflow: initialize the project memory scaffold, load a bounded snapshot, plan before source edits, and archive completed work for future sessions. `/dd:load` uses graph/cache output as a compact map, then relies on targeted reads for detail.

Graphify-style memory can be useful for broad automatic extraction across large or messy corpora. dotdotgod is stronger when you want durable project rules, specs, tests, plans, and archive maps to define the review path before an agent changes files.

See the workspace root README and [`docs/concept/GRAPHIFY_COMPARISON.md`](../../docs/concept/GRAPHIFY_COMPARISON.md) for the full comparison.
