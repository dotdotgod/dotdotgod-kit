# dotdotgod

> **Change a file, know what else must be checked.**

Dotdotgod gives AI coding agents a maintained project-memory map, bounded context loading, durable task plans, and changed-file impact review. It helps agents find the right evidence without loading the whole repository or reconstructing intent from stale chat history.

Use it to carry project knowledge across sessions while keeping plans, verification, and historical context explicit.

Repository: <https://github.com/dotdotgod/dotdotgod-kit>

## The Working Loop

Every adapter follows the same loop:

1. **init** — create the docs-first project-memory scaffold.
2. **load** — start from a bounded documentation map and focused local query.
3. **plan** — record durable task intent under `docs/plan/` before source edits when the work warrants a saved plan.
4. **impact** — identify related specs, tests, docs, commands, and source before broad verification or handoff.

## Pick the Package You Need

| Package | Use it when | Start here |
| --- | --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | You use Pi and want initialization, project loading, Plan Mode, impact checks, and archive handoff. | `pi install npm:@dotdotgod/pi` |
| [`@dotdotgod/cli`](packages/cli/README.md) | You want validation, graph indexing, local query, reference expansion, or impact reports. | `npx @dotdotgod/cli init .` |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md#start-here) | You use Claude Code and want `/dd:*` commands plus dotdotgod skills. | `/plugin marketplace add dotdotgod/dotdotgod-kit`, then `/plugin install dotdotgod@dotdotgod` |
| [`@dotdotgod/codex`](packages/codex/README.md#start-here) | You use Codex and want dotdotgod skills plus `dd:*` trigger phrases. | Register the plugin manifest or copy `skills/` into a trusted Codex skills location. |

## Quick Start

### Pi

Install the adapter:

```bash
pi install npm:@dotdotgod/pi
```

Open Pi in the target repository and ask:

```text
Initialize this project with dotdotgod.
```

The initializer creates or normalizes shared agent instructions, documentation indexes, behavior, architecture, and test areas, plus local plan and archive memory. Validate the result with:

```bash
npx @dotdotgod/cli validate .
```

### CLI only

```bash
npx @dotdotgod/cli init .
npx @dotdotgod/cli validate .
npx @dotdotgod/cli graph impact . --changed <path> --compact
```

For Claude Code and Codex setup, follow the package-specific **Start Here** links in the package table.

## Why dotdotgod

Dotdotgod keeps a small, high-signal project-memory surface so an agent can answer three questions:

1. **What should I load?** Start from canonical instructions, README indexes, maintained docs, active plans, and the archive map.
2. **What is related to this change?** Use graph impact to rank likely specs, tests, docs, commands, and neighboring files.
3. **What should I verify?** Select documentation checks, traceability, focused tests, dry-runs, or workspace verification from the changed surface.

The structure provides:

- **Low-noise loading:** agents follow the documentation map and read targeted bodies instead of broad file lists.
- **Durable intent:** active plans and archived outcomes survive compaction, handoff, and new sessions.
- **Traceable behavior:** behavior specs connect to implementation, tests, related docs, and verification commands.
- **Bounded history:** `docs/archive/README.md` remains the history map; archive bodies are read only when targeted.
- **Local processing:** graph and query caches stay under `.dotdotgod/`; agent-facing commands return bounded summaries.

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

Each result includes ranking reasons so agents can inspect relevant evidence instead of scanning broadly. Keep results useful through focused README indexes, current traceability blocks, meaningful package metadata, and single-responsibility documents.

## Core Concepts

- **Project memory:** durable files and metadata reused across sessions.
- **Memory areas:** configured scopes for stable project knowledge, local active plans, and historical archives.
- **Documentation load:** a depth-bounded project map with optional focused local query.
- **Traceability:** links from behavior docs to source, tests, related docs, and verification commands.
- **Impact graph:** a local ranking of files likely to require review after a change.

For the detailed model, read [Context curation](docs/concept/CONTEXT_CURATION.md), [Context mechanics](docs/concept/CONTEXT_MECHANICS.md), and [Measurement design](docs/concept/MEASUREMENT_DESIGN.md).

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

Start with [`docs/README.md`](docs/README.md), then use the area indexes:

- [Concepts](docs/concept/README.md)
- [Specs](docs/spec/README.md)
- [Tests](docs/test/README.md)
- [Architecture](docs/arch/README.md)
- [Reports](docs/report/README.md)

Common routes:

- [Project initializer](docs/spec/PROJECT_INITIALIZER.md)
- [Plan Mode](docs/spec/PLAN_MODE.md)
- [Project Load](docs/spec/LOAD_PROJECT.md)
- [Cross-agent support](docs/spec/CROSS_AGENT_SUPPORT.md)
- [Documentation structure](docs/arch/DOCS_STRUCTURE.md)

## Publishing

The root workspace package is private. Publish public workspace packages individually or with:

```bash
pnpm run publish:all
```
