# @dotdotgod/codex

[![npm version](https://img.shields.io/npm/v/@dotdotgod/codex.svg)](https://www.npmjs.com/package/@dotdotgod/codex) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/codex) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Codex adapter for dotdotgod's docs-first project-memory workflow.

This package ships workflow skills, a local stdio MCP server, and reviewed lifecycle hooks through its Codex plugin manifest (`.codex-plugin/plugin.json`). Use it when you want Codex to initialize shared project docs, load bounded repository context, process large command output locally, plan from durable docs, and enforce graph-impact review before broad handoff operations.

## Start Here

Make the bundled skills visible to Codex: register the package through your Codex environment's plugin mechanism if it supports plugin manifests, or copy the `skills/` directories into a trusted Codex skills location.

Codex environments may not expose the same slash-command model as Pi or Claude Code. When slash commands are unavailable, use dotdotgod trigger phrases in normal chat:

```text
dd:init
```

```text
dd:load
```

```text
dd:plan Update the API migration plan.
```

```text
dd:impact
```

The bundled skills interpret those phrases as command-like workflow requests.

## What It Adds to Codex

| Skill or trigger | Use it for | Result |
| --- | --- | --- |
| `dd:init` / `project-initializer` | Start a repository with dotdotgod conventions. | Creates or normalizes shared agent files, docs indexes, local-memory areas, and the complete default project config. |
| `dd:load` / `project-load` | Load project memory without changing maintained project files. | Renders the shared Markdown tree and uses `dotdotgod query` when focus text is provided; query may refresh ignored caches. |
| `dd:plan` / `doc-first-planning` | Plan before implementation. | Captures current intent in `docs/plan/<task-slug>/README.md`. |
| `dd:impact` / `impact-review` | Review changed files before verification or handoff. | Uses `dotdotgod graph impact` to identify likely related docs, tests, commands, and source files. |
| `document-clarify` | Improve docs wording without changing behavior contracts. | Clarifies README/spec/test/arch/plan/archive docs using memory-area roles. |
| `dotdotgod-context` MCP tools | Run commands, process files, fetch/index text, and search large output locally. | Keeps large raw bytes outside model context and returns bounded output or FTS5 excerpts. |

## Included

- Codex plugin manifest: `.codex-plugin/plugin.json`
- Local MCP configuration: `.mcp.json`
- Hook configuration and runtime: `hooks/hooks.json`, `hooks/runtime.mjs`
- Skills:
  - `project-load`
  - `doc-first-planning`
  - `project-initializer`
  - `impact-review`
  - `document-clarify`

## Shared Project-Memory Contract

- `AGENTS.md` remains canonical.
- `CODEX.md` stays thin and points to `AGENTS.md`.
- Specs describe behavior and requirements.
- Architecture docs explain rationale, boundaries, and conventions.
- Test docs explain verification strategy, regression coverage, fixtures, and commands.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
- `docs/archive/README.md` is the archive map; archive bodies should be read only when targeted.

## Memory Areas and Traceability

By default, `docs/spec/**` has two separate roles:

- It is stable shared project memory for product behavior and requirements.
- It is the traceability-enforced path for behavior specs.

Projects can customize memory roles with `memory.areas`, select traceability-enforced Markdown with `traceability.required` and `traceability.exclude`, and define the ordered complete list of traceability string arrays with `traceability.keys`. Each key owns its label, path or command target, graph relation, and PPR weight.

## Bundled MCP And Hooks

The local stdio MCP server exposes generic execution/retrieval tools plus `dotdotgod_project_load`, `dotdotgod_project_impact`, and `dotdotgod_project_initialize`. Large outputs use the ignored project-local `.dotdotgod/context/` SQLite FTS5 store.

Bundled hooks become active only after Codex's applicable plugin trust/review flow. They mark project load as required, record successful source/config edits, and deny broad verification or handoff commands until matching graph impact succeeds. Codex then calls the named MCP tool and retries the original operation; hooks do not silently change a shell call into an MCP call. See [`hooks/README.md`](https://github.com/dotdotgod/dotdotgod-kit/blob/main/packages/codex/hooks/README.md).

## Local Development

```bash
pnpm --filter @dotdotgod/codex run verify
pnpm --filter @dotdotgod/codex run pack:dry-run
```

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

This adapter packages reusable workflow skills. It guides Codex to prefer a depth-bounded documentation map with optional focused local query, avoid broad archive scans, and follow README indexes before reading raw files. The strength is structured retrieval from maintained project docs, not a giant graph report.
