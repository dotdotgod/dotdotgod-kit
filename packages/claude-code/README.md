# @dotdotgod/claude-code

[![npm version](https://img.shields.io/npm/v/@dotdotgod/claude-code.svg)](https://www.npmjs.com/package/@dotdotgod/claude-code) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/claude-code) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Claude Code adapter for dotdotgod's docs-first project-memory workflow.

Use this package when you want Claude Code to work from a shared project brain: maintained agent rules and docs, durable plans, focused context loading, and changed-file evidence before handoff.

## What Changes

- **Claude starts from shared project knowledge.** `AGENTS.md` and the documentation map remain reusable across agents while Claude-specific commands provide a native entry point.
- **Plans become durable project artifacts.** `/dd:plan` records task intent under `docs/plan/` so it survives compaction, handoff, and new sessions.
- **Project evidence arrives when needed.** `/dd:load` and the local MCP runtime provide bounded documentation, command output, files, and fetched text.
- **Changed files retain their review context.** Packaged hooks track successful edits and require matching graph impact before broad verification or handoff commands.
- **The workflow stays inspectable.** A denied operation names the required MCP action, and Claude retries the original operation after the check succeeds.

## Start Here

This package is a Claude Code plugin containing a manifest, `/dd:*` commands, skills, MCP integration, and hooks. Claude Code registers these resources when it loads the package through plugin registration or a local plugin directory.

Register the dotdotgod plugin marketplace inside Claude Code, then install the plugin:

```text
/plugin marketplace add dotdotgod/dotdotgod-kit
/plugin install dotdotgod@dotdotgod
```

Then use the bundled `/dd:*` commands in your repository:

```text
/dd:init
/dd:load
/dd:plan Update the API migration plan.
/dd:impact
```

For local development from a source checkout, load the plugin directory directly instead of installing:

```bash
claude --plugin-dir /path/to/dotdotgod/packages/claude-code
```

## What It Adds to Claude Code

| Command or skill | Use it for | Result |
| --- | --- | --- |
| `/dd:init` | Start a repository with dotdotgod conventions. | Creates or normalizes shared agent files, docs indexes, local-memory areas, and the complete default project config. |
| `/dd:load` | Load project memory without changing maintained project files. | Renders the shared Markdown tree and uses `dotdotgod query` when focus text is provided; query may refresh ignored caches. |
| `/dd:plan` | Plan before implementation. | Writes or updates durable task intent in `docs/plan/<task-slug>/README.md`. |
| `/dd:impact` | Review changed files before verification or handoff. | Uses `dotdotgod graph impact` to identify likely related docs, tests, commands, and source files. |
| `document-clarify` | Improve docs wording without changing behavior contracts. | Clarifies README/spec/test/arch/plan/archive docs using memory-area roles. |
| `dotdotgod-context` MCP tools | Run commands, process files, fetch/index text, and search large output locally. | Keeps large raw bytes outside model context and returns bounded output or FTS5 excerpts. |

## Shared Project-Memory Contract

- `AGENTS.md` remains canonical.
- `CLAUDE.md` stays thin and imports or points to `AGENTS.md`.
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

The plugin starts a local stdio MCP server. It exposes `execute`, `batch_execute`, and `execute_file`; context index, search, fetch, session resume, durable ingestion-job lifecycle, explicit healing, stats, doctor, and purge tools; plus `dotdotgod_project_load`, `dotdotgod_project_impact`, and `dotdotgod_project_initialize`.

Dotdotgod execution tools share a 10 MiB stdout/stderr capture ceiling per command. Crossing that ceiling terminates the child process and reports `captureLimitExceeded`; direct stdout and stderr excerpts are each capped at 1 MiB. Their child environments preserve compatibility-oriented inheritance after filtering runtime injection variables; this reports filtered names without values but does not isolate ordinary inherited credentials. Large output is indexed before retrieval in the ignored project-local `.dotdotgod/context/context.sqlite` FTS5 store, and searches return bounded excerpts. The store uses WAL, a bounded busy timeout, and transactional source replacement, expiry, and purge. Structural Markdown/JSON chunks, bounded typo-tolerant trigram candidates, reciprocal-rank fusion, and title/path/proximity signals improve retrieval while provenance and `instructionAuthority: "none"` identify retrieved text as non-authoritative data.

The MCP `index` tool accepts project-contained files or bounded directories with deterministic traversal, configurable resource limits, explicit extension/path exclusions, and symlinks skipped by default. These capture and retrieval rules apply when Claude calls the dotdotgod MCP tools; Claude Code's built-in Bash tool keeps its native behavior. URL indexing performs application-level HTTP(S), DNS/address, connected-peer, redirect, and byte-limit validation. Accepted HTML is normalized as bounded untrusted text without browser rendering, JavaScript, subresource loading, or link following by default. The server bundles no browser renderer, so browser opt-in fails unless a host injects that capability. These controls are not a network sandbox or complete prompt-injection prevention. See the [`@dotdotgod/context` npm package](https://www.npmjs.com/package/@dotdotgod/context), its [GitHub README](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/context), and the [maintained execution contract](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/CONTEXT_EXECUTION.md) for the complete runtime behavior.

Bundled hooks mark project load as required at session start, record successful source/config edits, and deny broad verification or handoff commands until matching graph impact succeeds. Denial asks Claude to call the required MCP tool and retry; hooks do not silently change one tool type into another. See [`hooks/README.md`](https://github.com/dotdotgod/dotdotgod-kit/blob/main/packages/claude-code/hooks/README.md) for lifecycle and trust boundaries.

## Local Development

```bash
pnpm --filter @dotdotgod/claude-code run verify
pnpm --filter @dotdotgod/claude-code run pack:dry-run
```

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).

## Workflow Model

The adapter connects Claude Code's commands, skills, MCP tools, and hooks to the same maintained project memory used by other agents. README indexes route focused reads, durable plans preserve intent, and graph impact supplies related evidence for review.
