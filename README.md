# dotdotgod

> **Change a file, know what else must be checked.**

Dotdotgod is a context curation kit for AI coding agents. It turns specs, architecture notes, tests, commands, active plans, and archives into project memory for safer agent work.

It is for builders who use coding agents and still want product intent, design rationale, verification standards, and project memory to remain clear and durable. Coding agents can help write, refine, and navigate the documents, while the project keeps a stable source of truth for what should be built, why, and how it is verified.

Repository: <https://github.com/dotdotgod/dotdotgod>

For evidence-backed comparisons, see [`docs/concept/GRAPHIFY_COMPARISON.md`](docs/concept/GRAPHIFY_COMPARISON.md) for Graphify-style memory and [`docs/concept/LAT_MD_COMPARISON.md`](docs/concept/LAT_MD_COMPARISON.md) for lat.md's markdown knowledge graph model.

## Core Idea

Agents work better from shaped project memory than from raw conversation history. dotdotgod turns scattered repo knowledge into a reusable context system that keeps product decisions reviewable while coding agents do the implementation work:

- `AGENTS.md` for canonical working rules.
- `docs/spec/` for product truth and expected behavior.
- `docs/arch/` for engineering constraints and boundaries.
- `docs/test/` for verification knowledge.
- `docs/plan/` for active task intent and executable plans.
- `docs/archive/` for completed decisions, reports, and reusable historical memory.

## What Initialization Creates

The initializer gives a project a predictable memory surface that any supported agent can load:

```text
AGENTS.md                    # canonical instructions for all coding agents
CLAUDE.md                    # thin Claude Code entrypoint pointing to AGENTS.md
CODEX.md                     # thin Codex entrypoint pointing to AGENTS.md
docs/
  README.md                  # docs map and naming/index rules
  spec/README.md             # product behavior and requirements index
  arch/README.md             # architecture and code-convention index
  test/README.md             # verification strategy and smoke-test index
  plan/README.md             # active local task plans, ignored by git
  archive/README.md          # completed-work history map, ignored by git
```

This structure separates stable project truth from temporary chat state. Specs explain what should happen, architecture explains why it is built that way, tests explain how to verify it, plans capture current intent before implementation, and archive indexes make completed decisions discoverable later. The workflow treats documentation as part of product execution, not as after-the-fact notes.

## Why Loading Works Better with This Structure

When an agent runs `/dd:load`, `dd:load`, or `dotdotgod load-snapshot`, it does not need to rediscover the repository from scratch. It can follow the same durable map every time:

1. Read the baseline instructions and docs indexes.
2. Use the bounded CLI snapshot for cache status, graph size, memory areas, communities, and archive policy.
3. Inspect only the relevant spec, architecture, test, or active plan files.
4. Use `docs/archive/README.md` as the history map and read archived bodies only when a task needs a targeted past decision.

The result is a project load that is repeatable, bounded, and task-directed. New sessions start with the same rules and context map, long-running work survives compaction, and agent handoffs do not depend on remembering what happened in a previous chat.

## Why This Structure Is the Strength

Dotdotgod's advantage is its project-defined memory model. The index and the agent know the intended retrieval structure before retrieval starts.

- **Meaningful nodes from structure:** `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, and `docs/archive` become memory-area metadata that tells the agent whether a file is product truth, architecture rationale, verification knowledge, current intent, or historical memory.
- **README indexes as routing tables:** docs indexes become curated `routes_to` edges that point agents to the right file before they scan raw source.
- **Active and historical memory stay separate:** `docs/plan` carries current work; `docs/archive/README.md` maps completed work without loading every old plan body.
- **Retrieval starts with intent:** behavior questions route to specs, design questions route to architecture, verification questions route to tests, current-work questions route to plans, and past-decision questions route through the archive map.
- **Graph/cache output stays bounded:** the full graph remains local in `.dotdotgod/`; agents receive compact snapshots, memory-area summaries, omitted counts, schema/cache metadata, and archive policy.
- **Memory policy can be explicit:** projects can keep the default shared/local and fresh/stale memory areas or define them in `dotdotgod.config.json`.

## What Context Curation Improves

- **Less context noise:** important constraints are not buried under chat history and repeated tool output.
- **Better retrieval precision:** the docs structure provides path-based memory-area metadata, routing edges, and retrieval hints so files carry different project meanings.
- **Better continuity:** active plans and archived outcomes survive across sessions, compaction, and agent handoff.
- **Fewer repeated explanations:** canonical instructions and docs become reusable project memory.
- **Less speculative work:** agents start from specs, architecture, tests, and project rules before changing code.
- **Safer execution:** planning happens before source changes, and execution follows explicit steps.
- **Reusable history:** completed plans and reports remain available as future context.

## Current Capabilities

- **Project scaffold:** initialize `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs indexes, local `docs/plan`, and `docs/archive` conventions.
- **Read-only project load:** `/dd:load` and adapter load workflows prefer a bounded `dotdotgod load-snapshot` map before reading individual docs.
- **Safe planning loop:** Pi Plan Mode restricts source/config mutation until a durable plan exists, tracks explicit `[DONE:n]` execution markers, and archives completed work.
- **Unified CLI:** `@dotdotgod/cli` owns validation, cache/index/status, load snapshots, configurable memory-area summaries, graph impact queries, and community summaries.
- **Generic indexing:** indexing is gitignore-aware and supports common plain-text docs, source, scripts, config, web, and infrastructure files across repository shapes.
- **Bounded graph output:** full graph data stays in `.dotdotgod/`; agent-facing commands return compact summaries, omitted counts, schema/cache metadata, and archive inclusion policy.
- **Cross-agent adapters:** Pi, Claude Code, and Codex share the same docs-first workflow while respecting each agent's native extension model.

## How dotdotgod Differs from Graphify-Style Memory

Graphify-style systems can be useful when a large corpus is indexed once and queried many times, especially when broad semantic or multimodal extraction is valuable. Dotdotgod focuses on a different strength: making the project itself declare the memory structure agents should retrieve from.

- **Structure before extraction:** dotdotgod starts by creating `AGENTS.md` and docs indexes, so graph nodes already have project meaning such as spec, architecture, test, active plan, or archive map through deterministic memory-area metadata.
- **Curated routing before raw retrieval:** README indexes and docs areas become `routes_to` and `belongs_to_area` graph edges that narrow the search path before the agent reads source files or old archive bodies.
- **Layered memory, not one big report:** project map and bounded snapshot are the default layer; source files and archive bodies are targeted-read layers.
- **Gitignore-aware scope:** the index follows project visibility rules and excludes dependency/generated/cache paths by default.
- **Archive bodies excluded by default:** `docs/archive/README.md` remains the history map, while completed plan/report bodies are read only when targeted.
- **Deterministic first pass:** current graph extraction uses local file metadata, Markdown links/headings, package metadata, imports, exports, commands, tests, and events.
- **Token saving is not the product:** reduced context is a side effect; the goal is giving agents the right memory at the right time.

Read the detailed concept docs: [Context curation](docs/concept/CONTEXT_CURATION.md), [Context mechanics](docs/concept/CONTEXT_MECHANICS.md), and [Measurement design](docs/concept/MEASUREMENT_DESIGN.md).

## Install the Adapter You Need

| Package | Use it for |
| --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | Pi project initializer skill, plan mode, and project loading extensions. |
| [`@dotdotgod/cli`](packages/cli/README.md) | CLI for validation, project memory snapshots, and graph indexing. |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md) | Claude Code `dd:*` commands and project memory skills. |
| [`@dotdotgod/codex`](packages/codex/README.md) | Codex project memory skills and `dd:*` trigger phrases. |

Current public package version: `0.1.16`.

## Quick Start

Install the Pi adapter:

```bash
pi install npm:@dotdotgod/pi
```

Then start Pi in the target repository and run the initializer skill by asking:

```text
Initialize this project with dotdotgod.
```

The bundled `project-initializer` skill creates or normalizes `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, and `docs/archive`. When the CLI is already available, the same scaffold can be created with:

```bash
npx @dotdotgod/cli init .
```

If the CLI is not available, the initializer uses its bundled shell fallback and the README indexes still give agents a working project-memory map. That scaffold gives later `/dd:load` and `/plan` turns a stable structure.

CLI validation:

```bash
npx @dotdotgod/cli validate .
```

Local workspace checks:

```bash
pnpm install
pnpm run verify
pnpm run pack:dry-run
.husky/pre-push
```

Local Pi adapter install:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

## Documentation

- [Context curation concept](docs/concept/CONTEXT_CURATION.md)
- [Project initializer spec](docs/spec/PROJECT_INITIALIZER.md)
- [Plan mode spec](docs/spec/PLAN_MODE.md)
- [Load project spec](docs/spec/LOAD_PROJECT.md)
- [Cross-agent support](docs/spec/CROSS_AGENT_SUPPORT.md)
- [Docs structure architecture](docs/arch/DOCS_STRUCTURE.md)
- [Cross-agent architecture](docs/arch/CROSS_AGENT_ARCHITECTURE.md)
- [Validation architecture](docs/arch/VALIDATION_ARCHITECTURE.md)
- [Extension architecture](docs/arch/EXTENSION_ARCHITECTURE.md)

## Publishing

The root workspace package is private. Publish public workspace packages individually or with:

```bash
pnpm run publish:all
```
