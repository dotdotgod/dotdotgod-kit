# dotdotgod

> **Change a file, know what else must be checked.**

Dotdotgod is a project-memory kit for AI coding agents. It gives a repository a maintained docs structure, a local project-memory graph, and commands that help agents load the right context, plan safely, and verify related work after changes.

Use it when you want future AI coding sessions to start from durable project knowledge instead of rediscovering intent from chat history.

Repository: <https://github.com/dotdotgod/dotdotgod-kit>

## The Working Loop

Every adapter drives the same four-step loop:

1. **init** — create the docs-first project-memory scaffold once.
2. **load** — start each session from a bounded documentation map and focused local query instead of broad file reads.
3. **plan** — write durable task intent under `docs/plan/` before source edits.
4. **impact** — after changes, ask the graph what else must be checked before handoff.

Pick the package that runs this loop in your agent, then initialize your repository.

## Pick the Package You Need

| Package | Use it when | First step |
| --- | --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | You use Pi and want the full workflow: project initialization, project loading, Plan Mode, impact checks, and archive handoff. | `pi install npm:@dotdotgod/pi` |
| [`@dotdotgod/cli`](packages/cli/README.md) | You want command-line validation, graph indexing, local documentation query, reference expansion, Trello sync, or changed-file impact reports. | `npx @dotdotgod/cli validate .` |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md) | You use Claude Code and want `/dd:*` commands plus dotdotgod skills. | Install the Claude Code plugin package. |
| [`@dotdotgod/codex`](packages/codex/README.md) | You use Codex and want dotdotgod skills plus `dd:*` trigger phrases. | Install the Codex package or plugin resources. |
| [`@dotdotgod/trello-power-up`](packages/trello-power-up/README.md) | You maintain the Trello docs-sync Power-Up frontend for this repository. | Preview the static frontend locally. |

## Quick Start

### Initialize another project with Pi

```bash
pi install npm:@dotdotgod/pi
```

Then open Pi in the target repository and ask:

```text
Initialize this project with dotdotgod.
```

The initializer creates or normalizes the project-memory scaffold:

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

Validate the initialized project:

```bash
npx @dotdotgod/cli validate .
```

### Use only the CLI

```bash
npx @dotdotgod/cli init .
npx @dotdotgod/cli validate .
npx @dotdotgod/cli graph impact . --changed <path> --compact
```

## What dotdotgod Helps Agents Answer

Dotdotgod keeps a small set of high-signal project files and graph metadata so an agent can answer:

1. **What should I load first?**
   - Start from `AGENTS.md`, thin agent entrypoints, README indexes, specs, architecture notes, test docs, active plans, and the archive map.
2. **What is related to this change?**
   - Use `dotdotgod graph impact` to find likely specs, tests, docs, commands, and neighboring files to review.
3. **What should I verify before handoff?**
   - Use docs validation, traceability checks, package tests, package dry-runs, or repository verification commands based on the changed surface.

## Changed-File Impact Example

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

`graph impact` ranks related docs, tests, architecture notes, config docs, source files, and commands. The output includes reasons so agents can inspect the right evidence instead of scanning broadly.

## Core Concepts in Plain Language

- **Project memory:** durable files and metadata that agents can reuse across sessions.
- **Memory areas:** configured document roles such as behavior truth, architecture rationale, verification knowledge, active task intent, and archive history.
- **Traceability:** links from behavior docs to source, tests, related docs, and verification commands.
- **Documentation load:** a depth-bounded project map with optional local semantic routing for the first context pass.
- **Impact graph:** a local cache that ranks likely related files after a change.

The full graph stays local in `.dotdotgod/`. Agent-facing commands return compact summaries with omitted counts and reasons.

## How the Maintained Graph Stays Useful

`dotdotgod graph impact` works best when the repository keeps meaningful links fresh:

- README indexes route agents to the right docs.
- Traceability blocks connect behavior specs to implementation, tests, related docs, and verification commands.
- Memory-area metadata tells agents which files are stable project truth, local active plans, or historical archive material.
- Package metadata, imports, exports, commands, and tests add deterministic graph edges.
- Plans and archives preserve current intent and completed decisions.

If impact results become noisy, improve the maintained links or split mixed-responsibility files instead of adding more context to the prompt.

## Why This Structure Helps

- **Repeatable, low-noise loading:** every supported agent starts from the same rules and docs map, and reads targeted docs instead of broad file lists or old chat history.
- **Better impact precision:** explicit links explain why a file is related.
- **Safer execution:** planning happens before source changes, and implementation follows explicit steps.
- **Reusable history:** active plans and archived outcomes survive compaction and handoff.
- **Bounded archive use:** `docs/archive/README.md` stays the history map; archive bodies are read only when targeted.

For the detailed model, read [Context curation](docs/concept/CONTEXT_CURATION.md), [Context mechanics](docs/concept/CONTEXT_MECHANICS.md), and [Measurement design](docs/concept/MEASUREMENT_DESIGN.md).

## Current Capabilities

- Initialize the shared docs-first project scaffold.
- Validate docs structure, links, traceability blocks, config, and optional index freshness.
- Build and inspect the local `.dotdotgod/` graph/cache.
- Load depth-bounded documentation maps and focused local query results for agents.
- Expand explicit `[[...]]` references and high-signal fuzzy references.
- Review changed-file impact before broad tests, commits, pushes, or publishing.
- Use Pi Plan Mode for safe planning, execution tracking, impact reminders, and archive handoff.
- Package the same conventions for Pi, Claude Code, Codex, and CLI-only workflows.

## Develop This Repository

Use source-checkout commands in this repository:

```bash
pnpm install
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
pnpm run verify
```

Run package dry-runs before release-style handoff:

```bash
pnpm run pack:dry-run
```

Test the Pi adapter from a checkout:

```bash
pi install /path/to/dotdotgod/packages/pi
```

## Documentation

Start with the repository documentation map at [`docs/README.md`](docs/README.md), then use the local area indexes.

Area indexes:

- [Concepts](docs/concept/README.md)
- [Specs](docs/spec/README.md)
- [Tests](docs/test/README.md)
- [Architecture](docs/arch/README.md)
- [Reports](docs/report/README.md)

Common deep links:

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
