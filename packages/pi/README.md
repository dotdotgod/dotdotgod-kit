# @dotdotgod/pi

Pi adapter for dotdotgod's context curation workflow. **Start with the `project-initializer` skill**: it creates the structured project memory scaffold that makes `/dd:load`, `/plan`, and future agent handoffs useful.

Use it when you want Pi to turn a repository into durable agent memory: shared rules, specs, architecture, test strategy, active plans, archived decisions, and a bounded load snapshot.

## Start Here: Initialize Project Memory

After installing the package, ask Pi to initialize or normalize the project memory scaffold. The bundled skill is named `project-initializer` and is triggered by requests like:

```text
Initialize this project with dotdotgod.
Set up AGENTS.md, CLAUDE.md, CODEX.md, and docs folders.
Create a doc-first project baseline for this repository.
```

For deterministic setup, the skill uses the bundled shell script:

```bash
sh skills/project-initializer/scripts/init_project.sh --dry-run --project-name <name> <project-root>
sh skills/project-initializer/scripts/init_project.sh --project-name <name> <project-root>
```

The initializer is the first step: it creates the structure that later lets `/dd:load` find the right context and `/plan` write durable task intent.

## What You Get

- **Project initializer skill:** create `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs indexes, active-plan space, archive map, and local memory ignores.
- **Structured project memory:** give project knowledge a stable home before the agent starts loading or planning.
- **Task-directed loading:** `/dd:load` starts from a bounded `dotdotgod load-snapshot` map when available, then reads only relevant docs.
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

This is the core context curation idea: instead of putting more raw files into context, give the agent a predictable map of what matters, where current intent lives, how to verify changes, and which past decisions are worth revisiting.

## Install

```bash
pi install npm:@dotdotgod/pi
```

Published install/uninstall smoke has been verified for `0.1.5`:

```bash
pi install npm:@dotdotgod/pi
pi uninstall npm:@dotdotgod/pi
```

For local development:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

## Included

- `project-initializer` skill: the starting point; creates `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs folders, README indexes, and local memory ignores.
- `plan-mode` extension: read-first planning mode with restricted tools, docs/plan writes, execution tracking, tiered hidden prompts, and `/todos`.
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`, using `dotdotgod load-snapshot` when available with a lightweight fallback.

## Expected Improvements

- New sessions can start from the same durable project map instead of ad-hoc file scanning.
- Agents can distinguish stable project truth (`docs/spec`, `docs/arch`, `docs/test`) from current task intent (`docs/plan`).
- Archive history stays discoverable without forcing every completed plan body into the default context.
- Planning and verification become explicit artifacts rather than hidden chat state.
- Graph/cache metadata stays bounded in `.dotdotgod/`, with agent-facing output limited to summaries, omitted counts, and archive policy.

## Commands

```text
/plan      Toggle safe planning mode.
/todos     Show tracked plan progress during execution.
/load      Load project memory for the current repository.
/dd:load   Stable namespaced alias for project memory loading.
```

## Compared with Graphify-Style Memory

The Pi adapter does not ask the agent to read a full graph report on every task. `/dd:load` uses a compact snapshot-first prompt, keeps archive bodies out of the default context, and relies on targeted reads when more detail is needed.

The emphasis is different:

- **dotdotgod:** curate durable project memory and task intent first; use bounded graph/cache summaries as a map.
- **Graphify-style reports:** generate a broader graph/report from a corpus, which can help on large repeated queries but may add overhead on small tasks.

Plan Mode focuses on preserving intent, safety constraints, verification, and completed-step state rather than compressing the whole repository.

See the workspace root README for the cross-agent package map.
