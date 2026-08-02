# @dotdotgod/pi

[![npm version](https://img.shields.io/npm/v/@dotdotgod/pi.svg)](https://www.npmjs.com/package/@dotdotgod/pi) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/pi) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Pi adapter for dotdotgod's docs-first project-memory workflow.

Use this package when you want Pi to initialize project memory, load bounded repository context, plan before source edits, run impact-aware checks, and archive completed work for future sessions.

Pi is the fullest dotdotgod experience: it is the only adapter that enforces Plan Mode before source edits and can gate commit, push, and publish on pending impact checks. Throughout, the maintained graph stays a compact map for targeted reads, not a giant report to consume in full.

## Start Here

Install the adapter in Pi:

```bash
pi install npm:@dotdotgod/pi
```

Then open Pi in your repository and ask:

```text
Initialize this project with dotdotgod.
```

A good first run:

1. Install this package.
2. Start Pi in the target repository.
3. Ask Pi to initialize the project with dotdotgod.
4. Review the files the initializer will create or skip.
5. Run `/dd:load` to load bounded project memory.
6. Use `/dd:plan <request>` before implementation work.

## What It Adds to Pi

| Need | Pi command or feature |
| --- | --- |
| Create the docs-first project scaffold | `project-initializer` skill |
| Load project memory without broad file reads | `/dd:load` (full), `/dd:load:compact` (compact), or `/load` |
| Plan safely before source/config edits | `/dd:plan`, `/dd:plan <request>`, or startup flag `--dd-plan` |
| Review changed-file impact | `/impact-check` or `dotdotgod_graph_impact` |
| Improve docs clarity | `document-clarify` skill |
| Delegate analysis or implementation work | bundled `pi-subagents` resources |

## Project Initializer

The bundled `project-initializer` skill creates or normalizes this memory surface:

```text
AGENTS.md                    # canonical working rules for agents
CLAUDE.md                    # thin Claude Code pointer to AGENTS.md
CODEX.md                     # thin Codex pointer to AGENTS.md
dotdotgod.config.json        # complete editable default project policy
docs/
  README.md                  # project documentation map
  spec/README.md             # behavior, requirements, product truth
  arch/README.md             # architecture, conventions, boundaries
  test/README.md             # verification strategy and smoke tests
  plan/README.md             # active local plans, ignored by git
  archive/README.md          # completed-work history map, ignored by git
```

The package includes `@dotdotgod/cli` as a runtime dependency. Pi extensions prefer a source-checkout CLI when present, then the package-local CLI, then a global `dotdotgod` fallback. The initializer also includes a shell fallback and generated canonical config template for constrained environments.

## Planning Workflow

### `/dd:plan`

Use `/dd:plan` when a request may lead to source or config changes. Plan Mode keeps implementation mutations blocked until there is a durable plan under `docs/plan/<task-slug>/README.md` and the user chooses to execute it.

To start Pi with dotdotgod Plan Mode already enabled, run `pi --dd-plan`. The namespaced flag allows other extensions to register the generic `--plan` flag without an extension-loader conflict.

Plan Mode helps Pi:

- load relevant project memory,
- write or update active plan docs,
- track execution steps with `[DONE:n]` markers,
- remind agents to run impact checks after source/config edits,
- archive completed plans under `docs/archive/plan/`.

## Loading and Impact Checks

`/dd:load` renders shared Markdown paths as a prefix-compressed documentation tree, excluding plan/archive local memory by default. Without arguments it expands through directory depth 5; with arguments it runs `dotdotgod query` for up to 30 local multilingual E5 results and renders the tree through depth 3.

`/impact-check` and the `dotdotgod_graph_impact` tool use the maintained graph to surface related specs, tests, docs, commands, source, and config after a change. Pi can remind the agent to run impact checks and can block commit, push, or publish commands until pending impact checks pass.

## Included Resources

- `project-initializer` skill
- `document-clarify` skill
- `plan-mode` extension
- `load-project` extension
- `pi-subagents` wrapper resources
- package-local `@dotdotgod/cli` dependency

If standalone `pi-subagents` is already installed, the wrapper avoids duplicate dotdotgod-provided tool, skill, and prompt resources.

## Local Development

```bash
pi install /path/to/dotdotgod/packages/pi
pnpm --filter @dotdotgod/pi run verify
pnpm --filter @dotdotgod/pi run pack:dry-run
```

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

The Pi adapter focuses on workflow. It initializes the project-memory scaffold, loads a depth-bounded documentation map with optional focused query results, plans before source edits, checks changed-file impact, and archives completed work for future sessions. The graph is a compact map for targeted reads, not a giant report for agents to consume in full.
