# dotdotgod

> **Change a file, know what else must be checked.**

Dotdotgod gives AI coding agents a maintained project-memory map, bounded context loading, durable task plans, and changed-file impact review. Agents begin with the smallest useful set of project evidence and expand context through maintained documentation routes.

Use it to carry project knowledge across sessions while keeping plans, verification, and historical context explicit.

Repository: <https://github.com/dotdotgod/dotdotgod-kit>

## Obsidian Traceability Plugin

Explore project traceability in the native global graph with relationship
colors, weighted lines, clickable relation filters, document-group colors,
and compact hover paths. Desktop Obsidian 1.14.5+ is required (tested on 1.14.5).
Copy `main.js`, `manifest.json`, and `styles.css` from the [0.7.2 plugin release](https://github.com/dotdotgod/dotdotgod-kit/releases/tag/0.7.2)
into `<vault>/.obsidian/plugins/dotdotgod-traceability/`, reload,
and enable **dotdotgod Traceability**. Then export in the project/vault:

```bash
npx @dotdotgod/cli@0.7.1 graph export .
```

Open Graph view and use **Reload traceability**. The default graph file is
`.dotdotgod/traceability.json`; settings accept another vault-relative JSON path.
The referenced files must exist in the vault. Non-Markdown clicks reveal files
in the OS file browser, never execute them. No network, telemetry, payment, or
account is used by the plugin; `npx` installation may contact npm.

**Compatibility:** the plugin uses undocumented native renderer APIs. Its community
listing is public, but automated review completion is not yet confirmed. Native
filters may not constrain injected endpoints.
Mobile/local graphs are unsupported. Licensed under **Elastic License 2.0**.
See [full installation, usage, privacy, and compatibility details](packages/obsidian/README.md).

## 0.7.0 Upgrade

See [0.7.0 release notes](docs/report/RELEASE_0_7_0.md) for the standalone graph,
`graph export`, packaged Obsidian plugin, and Pi project-root isolation.
`graph serve` no longer accepts `--changed`; use `graph impact` for ranking.
For earlier migrations, see [0.6.6 notes](docs/report/RELEASE_0_6_6.md).
Restart agent sessions after updating adapters.

## The Working Loop

Every adapter follows the same loop:

1. **init** — create the docs-first project-memory scaffold.
2. **load** — start from a bounded documentation map and focused local query; Pi performs one mode-neutral automatic assessment when baseline context is missing.
3. **plan** — record durable task intent under `docs/plan/` before source edits when the work warrants a saved plan.
4. **impact** — identify related specs, tests, docs, commands, and source before broad verification or handoff.

## Pick the Package You Need

| Package | Use it when | Start here |
| --- | --- | --- |
| [`@dotdotgod/pi`](packages/pi/README.md) | You use Pi and want initialization, project loading, Plan Mode, impact checks, and archive handoff. | `pi install npm:@dotdotgod/pi` |
| [`@dotdotgod/cli`](packages/cli/README.md) | You want validation, graph indexing, local query, reference expansion, or impact reports. | `npx @dotdotgod/cli init .` |
| [`@dotdotgod/context`](packages/context/README.md) | You want local command/file processing, FTS5 retrieval, and the shared stdio MCP runtime. | Installed automatically by the agent adapters. |
| [`@dotdotgod/claude-code`](packages/claude-code/README.md#start-here) | You use Claude Code and want `/dd:*` workflows plus local context MCP tools. | `/plugin marketplace add dotdotgod/dotdotgod-kit`, then `/plugin install dotdotgod@dotdotgod` |
| [`@dotdotgod/codex`](packages/codex/README.md#start-here) | You use Codex and want dotdotgod skills, local context MCP tools, and reviewed hooks. | Register the plugin manifest through a trusted Codex plugin flow. |
| [`@dotdotgod/opencode`](packages/opencode/README.md) | You use OpenCode V2 and want MCP tools, automatic project plans and advisory impact tracking. | Add the package to `opencode.jsonc` plugins after publishing; use the package directory locally. |

The source checkout also includes [`@dotdotgod/hermes`](packages/hermes/README.md)
for Hermes CLI/gateway, with per-session MCP connections and no Plan Mode.
Install its npm tarball into the native Hermes plugin directory; see its package README.

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
npx @dotdotgod/cli graph serve .
```

For Claude Code and Codex setup, follow the package-specific **Start Here** links in the package table.

## Why dotdotgod

Dotdotgod keeps a small, high-signal project-memory surface so an agent can answer three questions:

1. **What should I load?** Start from canonical instructions, README indexes, maintained docs, active plans, and the archive map.
2. **What is related to this change?** Use graph impact to rank likely specs, tests, docs, commands, and neighboring files.
3. **What should I verify?** Select documentation checks, traceability, focused tests, dry-runs, or workspace verification from the changed surface.

The structure provides:

- **Focused loading:** agents begin with a bounded documentation map and expand context through relevant indexes and evidence.
- **Durable intent:** active plans and archived outcomes survive compaction, handoff, and new sessions.
- **Traceable behavior:** behavior specs connect to implementation, verification, and design evidence through configured graph relations.
- **Routed history:** `docs/archive/README.md` guides agents to historical records relevant to the current task.
- **Local processing:** graph, query, and execution results stay locally available while agent-facing commands return bounded summaries.

## Local Context Runtime

The adapters share a local runtime that keeps large command output, files, and fetched text useful without filling the model context. Small results return directly; larger results become locally searchable, bounded excerpts with provenance and trust metadata. Durable ingestion jobs and opaque session resume let longer processing survive individual turns.

Pi and OpenCode use the shared local MCP runtime without native forwarding aliases. Individual tool names are unprefixed; hosts qualify them with the MCP server namespace. Pi/OpenCode track pending impact without blocking commands. Claude Code/Codex retain their hook policies; Hermes wrappers own a connection per authorized repository/session. Host shell and permission behavior remains separate. The compatibility environment preserves ordinary inherited credentials; allowlist mode provides a stricter child environment.

The runtime applies bounded capture, storage, traversal, and HTTP(S) fetch policies. These controls provide defense in depth rather than a network sandbox or prompt-injection guarantee. See the [`@dotdotgod/context` npm landing page](packages/context/README.md), [behavior contract](docs/spec/CONTEXT_EXECUTION.md), [architecture](docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md), and [verification strategy](docs/test/CONTEXT_EXECUTION.md).

## Changed-File Impact Example

```bash
$ dotdotgod graph impact . --changed packages/cli/src/core.mjs --compact
```

```text
docs:
- docs/spec/CONFIG_COMMAND.md (56.8; incoming:links_to, incoming:implemented_by)
- docs/spec/cli/TRACEABILITY_LINKS.md (26.3; vector_similarity)

tests:
- packages/cli/test/core.test.mjs (6.5; verified_by)

files:
- packages/cli/src/core.mjs (100; changed-file)
- packages/cli/src/memory/config.mjs (6.5; implemented_by)
```

Non-seed scores use a fixed weighted Personalized PageRank connection component capped at `80` plus memory policy capped at `20`. Direct, curated, test, type, and semantic evidence add no separate score or ordering bonus; relation weights participate through PPR and reasons remain explanation evidence. When the local query cache is available, impact analysis can add a bounded request-local multilingual `vector_similarity` overlay without changing the indexed graph or persisting changed-file vectors. Vector failures degrade to structural-only results.

Each result includes ranking reasons so agents can inspect the smallest useful set of related evidence. Exact scores vary with the project graph and memory policy. Keep results useful through focused README indexes, current traceability blocks, meaningful package metadata, and single-responsibility documents.

For visual review, start the local explorer:

```bash
dotdotgod graph serve . --changed packages/cli/src/core.mjs
```

The explorer keeps only shared structural nodes connected to the changed-file root, preserves relation-arrow direction, and lays nodes out from the root by structural hop. Its **Node reveal** control offers **Instant**, **By hop layer**, and **One by one** modes; the choice is saved locally, **Skip reveal** finishes an active sequence, and reduced-motion preferences use immediate placement. The server binds to `127.0.0.1` by default; use `--host` or `--port` only when needed.

## Core Concepts

- **Project memory:** durable files and metadata reused across sessions.
- **Memory areas:** configured scopes for stable project knowledge, local active plans, and historical archives.
- **Project load:** a depth-bounded documentation map with focused hybrid document/code-outline search; implementation bodies are read only when needed.
- **Traceability:** an ordered registry of string-array keys with labels, path or command targets, graph relations, and PPR weights.
- **Impact graph:** fixed weighted-PPR plus memory-policy ranking, optionally enriched by a request-local multilingual vector overlay.

For the detailed model, read [Context curation](docs/concept/CONTEXT_CURATION.md), [Context mechanics](docs/concept/CONTEXT_MECHANICS.md), and [Measurement design](docs/concept/MEASUREMENT_DESIGN.md).

## Develop This Repository

Use source-checkout commands in this repository:

```bash
pnpm install
pnpm run generate
node packages/cli/bin/dotdotgod.mjs index .
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
