# @dotdotgod/codex

[![npm version](https://img.shields.io/npm/v/@dotdotgod/codex.svg)](https://www.npmjs.com/package/@dotdotgod/codex) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod-181717?logo=github)](https://github.com/dotdotgod/dotdotgod/tree/main/packages/codex) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](../../LICENSE)

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

Codex adapter for dotdotgod's context curation workflow. It packages reusable skills that help Codex initialize the fixed load-context surface, load bounded project memory, and plan from explicit maintained graph links before implementation.

## What Gets Better?

- Codex can start from `AGENTS.md` and the dotdotgod docs map.
- Load guidance prefers `dotdotgod load-snapshot <root> --json` when the CLI is available, then falls back to README-index reads.
- Codex can use docs structure as retrieval intent: specs for behavior, architecture for rationale, tests for verification, plans for current work, and archive indexes for past decisions.
- Planning guidance encourages agents to keep README routes, traceability blocks, plans, and archives current so `graph impact` remains useful.
- Planning work captures current intent in `docs/plan/<task-slug>/README.md` before implementation.
- Completed plans and temporary reports use the same archive structure as Pi and Claude Code, turning outcomes into future context.
- `dd:load`, `dd:plan`, and `dd:init` can be used as command-like trigger phrases where direct slash commands are unavailable.

## Shared Memory and Traceability Model

By default, `docs/spec/**` has two roles: it is stable shared/fresh project memory, and it is the traceability-enforced behavior-spec path. These concepts are independent:

- `memory.areas` customizes memory classification, freshness, local/shared scope, priorities, and archive-body inclusion.
- `traceability.required` / `traceability.exclude` customizes which markdown paths must end with `json dotdotgod` blocks.

`docs/archive/README.md` is the history map. Archive bodies remain targeted historical memory and should not be read broadly by default.

## Included

- Codex plugin manifest: `.codex-plugin/plugin.json`
- Skills:
  - `project-load`: load project memory read-only.
  - `doc-first-planning`: plan from docs before implementation.
  - `project-initializer`: initialize shared agent docs and docs folders, using `dotdotgod init` when available and the bundled fallback when not.

Codex may not expose the same slash-command model as Pi or Claude Code. Treat `dd:load`, `dd:plan`, and `dd:init` as command-like trigger phrases for these skills unless the active Codex plugin runtime provides direct command registration.

## Optional Hooks

Codex can run lifecycle hooks from trusted Codex configuration layers. dotdotgod does not require hooks: the bundled skills and `dd:load`, `dd:plan`, and `dd:init` trigger phrases work without them.

Use hooks only when you want opt-in reminders or validation around the same workflow. See [`hooks/README.md`](hooks/README.md) for advisory examples and stricter plan-safety patterns.

## Shared Contract

- `AGENTS.md` remains canonical.
- `CODEX.md` stays thin and points to `AGENTS.md`.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
- `docs/archive/README.md` is the archive map; archive bodies should be read only when targeted.

## Local Development

Run package checks:

```bash
pnpm --filter @dotdotgod/codex run verify
pnpm --filter @dotdotgod/codex run pack:dry-run
```

## Learn More

See the [root README](../../README.md), [GitHub repository](https://github.com/dotdotgod/dotdotgod), [`docs/concept/CONTEXT_CURATION.md`](../../docs/concept/CONTEXT_CURATION.md), [`docs/concept/CONTEXT_MECHANICS.md`](../../docs/concept/CONTEXT_MECHANICS.md), [`docs/spec/MEMORY_AREA_CONFIG.md`](../../docs/spec/MEMORY_AREA_CONFIG.md), and [`docs/spec/TRACEABILITY_CONFIG.md`](../../docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

This adapter packages reusable workflow skills. It guides Codex to prefer a bounded dotdotgod load snapshot when available, avoid broad archive scans, and follow README indexes before reading raw files. The strength is structured retrieval from explicit project-maintained links and the fixed docs surface, not a giant graph report.
