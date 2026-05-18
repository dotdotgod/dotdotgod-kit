# @dotdotgod/claude-code

[![npm version](https://img.shields.io/npm/v/@dotdotgod/claude-code.svg)](https://www.npmjs.com/package/@dotdotgod/claude-code) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod-181717?logo=github)](https://github.com/dotdotgod/dotdotgod/tree/main/packages/claude-code) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](../../LICENSE)

> **Change a file, know what else must be checked.**

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

`graph impact` ranks the specs, tests, architecture notes, config docs, and source files most likely to matter for a change. `--compact` keeps the result agent-facing: grouped by docs/tests/files and annotated with the reasons each item is likely relevant. It uses the project-memory graph built from Markdown links, README routes, headings, traceability blocks, package metadata, memory areas, and deterministic routing hints.

Claude Code adapter for dotdotgod's context curation workflow. It packages `/dd:init`, `/dd:load`, `/dd:plan`, and matching skills so Claude Code can start from bounded project memory instead of rediscovering specs, tests, plans, and archives from scratch.

## What Gets Better?

- `/dd:init` bootstraps shared agent instructions and docs folders for future context curation.
- `/dd:load` prefers `dotdotgod load-snapshot <root> --json` when the CLI is available, then falls back to README-index reads.
- Claude Code can use docs structure as retrieval intent: specs for behavior, architecture for rationale, tests for verification, plans for current work, and archive indexes for past decisions.
- `/dd:plan` writes or updates durable task intent in `docs/plan/<task-slug>/README.md` before implementation.
- Product intent, design rationale, verification standards, and completed work stay in durable files rather than chat history.
- Skills mirror the commands so natural-language requests can use the same workflows.

## Shared Memory and Traceability Model

By default, `docs/spec/**` has two roles: it is stable shared/fresh project memory, and it is the traceability-enforced behavior-spec path. These concepts are independent:

- `memory.areas` customizes memory classification, freshness, local/shared scope, priorities, and archive-body inclusion.
- `traceability.required` / `traceability.exclude` customizes which markdown paths must end with `json dotdotgod` blocks.

`docs/archive/README.md` is the history map. Archive bodies remain targeted historical memory and should not be read broadly by default.

## Included

- Claude Code plugin manifest: `.claude-plugin/plugin.json`
- Slash commands:
  - `/dd:init`: initialize shared agent docs and docs folders, using `dotdotgod init` when available and the bundled fallback when not.
  - `/dd:load`: load project memory read-only.
  - `/dd:plan`: plan from docs before implementation.
- Skills:
  - `project-load`
  - `doc-first-planning`
  - `project-initializer`

## Optional Hooks

Claude Code can run local lifecycle hooks from Claude settings. dotdotgod does not require hooks: `/dd:init`, `/dd:load`, `/dd:plan`, and the bundled skills work without them.

Use hooks only when you want opt-in reminders, validation, or local safety rails around the same SDLC loop: plan, implement, verify, review, and archive. The hook surface changes over time, so examples stay advisory and avoid claiming unavailable plan-mode transition hooks. See [`hooks/README.md`](hooks/README.md) for current lifecycle notes, advisory examples, and stricter plan-safety patterns.

## Shared Contract

- `AGENTS.md` remains canonical.
- `CLAUDE.md` stays thin and imports or points to `AGENTS.md`.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
- `docs/archive/README.md` is the archive map; archive bodies should be read only when targeted.

## Local Development

Use the package as a local Claude Code plugin directory while developing:

```bash
claude --plugin-dir /Users/dotdot/Workspace/dotdotgod/packages/claude-code
```

Run package checks:

```bash
pnpm --filter @dotdotgod/claude-code run verify
pnpm --filter @dotdotgod/claude-code run pack:dry-run
```

## Learn More

See the [root README](../../README.md), [GitHub repository](https://github.com/dotdotgod/dotdotgod), [`docs/concept/CONTEXT_CURATION.md`](../../docs/concept/CONTEXT_CURATION.md), [`docs/concept/CONTEXT_MECHANICS.md`](../../docs/concept/CONTEXT_MECHANICS.md), [`docs/spec/MEMORY_AREA_CONFIG.md`](../../docs/spec/MEMORY_AREA_CONFIG.md), and [`docs/spec/TRACEABILITY_CONFIG.md`](../../docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

This adapter is guidance-oriented. It asks Claude Code to prefer a bounded dotdotgod load snapshot when available, avoid broad archive scans, and follow README indexes before reading raw files. The strength is structured retrieval from project-declared memory, not a giant graph report.
