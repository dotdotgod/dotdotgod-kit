# @dotdotgod/pi

Pi adapter for dotdotgod's context curation workflow. **Start with the `project-initializer` skill**: it creates the structured project memory scaffold that makes `/dd:load`, `/plan`, and future agent handoffs useful.

Use it when you want Pi to turn a repository into durable agent memory: shared rules, specs, architecture, test strategy, active plans, archived decisions, and a bounded load snapshot.

## Start Here: Run the Project Initializer Skill

After installing the package, open Pi in your repository and ask it to initialize or normalize the project memory scaffold. The bundled skill is named `project-initializer`; you do not need to run its internal script yourself.

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

The initializer is the first step: it creates the structure that later lets `/dd:load` find the right context and `/plan` write durable task intent.

## What You Get

- **Project initializer skill:** create `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs indexes, active-plan space, archive map, and local memory ignores.
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

This is the core context curation idea: instead of putting more raw files into context, give the agent a predictable map of what matters, where current intent lives, how to verify changes, and which past decisions are worth revisiting.

## Install

```bash
pi install npm:@dotdotgod/pi
```

Published install/uninstall smoke has been verified for `0.1.8`:

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
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`, using `dotdotgod load-snapshot` when available with bounded cache, graph, memory-area, community, and archive-policy summaries plus a lightweight fallback.

## Expected Improvements

- New sessions can start from the same durable project map instead of ad-hoc file scanning.
- Agents can distinguish stable project truth (`docs/spec`, `docs/arch`, `docs/test`) from current task intent (`docs/plan`).
- README indexes act as routing tables: the CLI records them as `routes_to` edges, while docs paths become memory-area metadata for specs, architecture, tests, active plans, and archive maps.
- Archive history stays discoverable without forcing every completed plan body into the default context.
- Planning and verification become explicit artifacts rather than hidden chat state.
- Graph/cache metadata stays bounded in `.dotdotgod/`, with agent-facing output limited to summaries, memory areas, omitted counts, and archive policy.

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

### Where dotdotgod is better

- **Clear starting workflow:** the project-initializer skill creates a predictable memory scaffold before loading or planning.
- **Better retrieval priors:** docs paths and README indexes become memory-area metadata, `belongs_to_area` edges, and README `routes_to` edges before the graph query begins.
- **Lower default context pressure:** agents see bounded snapshots and README indexes instead of a full graph report by default, avoiding the case where a small question pays the cost of reading `GRAPH_REPORT` first.
- **Safer task execution:** Plan Mode preserves intent, safety constraints, verification, and completed-step state with `[DONE:n]` markers.
- **Better long-running project continuity:** active plans and archive indexes survive session resets, compaction, and agent handoff.
- **Archive discipline:** `docs/archive/README.md` stays visible as the history map, while completed plan/report bodies are read only when targeted.
- **Generic but conservative indexing:** the CLI follows gitignore-visible text/source/config files and avoids dependency, generated, cache, and secret-like paths by default, reducing the risk of repo-wide recursive indexing loops.
- **Layered context by default:** the always-visible layer is the project map and bounded snapshot; source files and archive bodies stay in the targeted-read layer.
- **Smaller skill surface:** the adapter keeps long-lived instructions focused on workflow and delegates repository facts to files and CLI snapshots instead of a large always-loaded skill report.

### Where Graphify-style memory can be better

- **More automatic corpus understanding:** broad graph/report generation can discover relationships without requiring a docs scaffold first.
- **Richer semantic extraction:** Graphify-style systems may handle dense prose, PDFs, images, videos, or other non-code artifacts better than dotdotgod's current deterministic first pass.
- **Better for large repeated exploratory queries:** if a large corpus is indexed once and queried many times, a richer graph/report can provide more immediate recall and may reduce repeated raw-file reads.
- **Less process discipline required upfront:** projects without `docs/spec`, `docs/arch`, `docs/test`, or archive conventions may get value faster from automatic extraction.
- **Potentially broader language coverage:** dotdotgod currently has focused deterministic extraction for Markdown, package metadata, and JS/TS-style structure; other languages are indexed mostly as file metadata until dedicated extractors are added.

Trade-off summary:

- dotdotgod is designed to avoid common query overhead problems: full report reads for small tasks, indexing dependency/generated directories, dense extraction retry cost, and large always-loaded skill instructions.
- Graphify-style memory can be stronger when the graph/report is high quality, reused across many broad questions, and the corpus benefits from semantic or multimodal extraction.

In short, dotdotgod is better when you want a durable workflow for project memory, planning, verification, and handoff. Graphify-style memory may be better when you want aggressive automatic extraction across a large, messy, multimodal corpus.

See the workspace root README for the cross-agent package map.
