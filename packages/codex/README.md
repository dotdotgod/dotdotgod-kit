# @dotdotgod/codex

[![npm version](https://img.shields.io/npm/v/@dotdotgod/codex.svg)](https://www.npmjs.com/package/@dotdotgod/codex) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/codex) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Codex adapter for dotdotgod's docs-first project-memory workflow.

This package is a bundle of workflow skills, not runtime magic: it ships a Codex plugin manifest (`.codex-plugin/plugin.json`) that points to skill instructions Codex reads and follows. Use it when you want Codex to initialize shared project docs, load bounded repository context, plan from durable docs before implementation, and review changed files with graph-impact evidence before handoff.

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

## Included

- Codex plugin manifest: `.codex-plugin/plugin.json`
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

## Optional Hooks

Codex can run lifecycle hooks from trusted Codex configuration layers. dotdotgod does not require hooks: the bundled skills and `dd:load`, `dd:plan`, `dd:init`, and `dd:impact` trigger phrases work without them.

Use hooks only when you want opt-in reminders or validation around the same workflow. Current Codex docs keep plugin-bundled hooks opt-in behind `plugin_hooks`, so this package defaults to skills and documented trusted hook examples instead of surprise runtime hooks. See [`hooks/README.md`](https://github.com/dotdotgod/dotdotgod-kit/blob/main/packages/codex/hooks/README.md) for advisory examples.

## Local Development

```bash
pnpm --filter @dotdotgod/codex run verify
pnpm --filter @dotdotgod/codex run pack:dry-run
```

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

This adapter packages reusable workflow skills. It guides Codex to prefer a depth-bounded documentation map with optional focused local query, avoid broad archive scans, and follow README indexes before reading raw files. The strength is structured retrieval from maintained project docs, not a giant graph report.
