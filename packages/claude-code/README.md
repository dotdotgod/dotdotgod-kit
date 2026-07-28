# @dotdotgod/claude-code

[![npm version](https://img.shields.io/npm/v/@dotdotgod/claude-code.svg)](https://www.npmjs.com/package/@dotdotgod/claude-code) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/claude-code) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Claude Code adapter for dotdotgod's docs-first project-memory workflow.

Use this package when you want Claude Code to initialize shared project docs, load bounded repository context, plan from durable docs before implementation, and review changed files with graph-impact evidence before handoff.

## Start Here

This package is a Claude Code plugin: a plugin manifest plus `/dd:*` commands and skills. Installing it from npm alone does not register the commands — Claude Code loads it through plugin registration or a local plugin directory.

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
/dd:plan-goal Add the new export API to the auth module.
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
| `/dd:load` | Load project memory read-only. | Renders the shared Markdown tree and uses `dotdotgod query` when focus text is provided. |
| `/dd:plan` | Plan before implementation. | Writes or updates durable task intent in `docs/plan/<task-slug>/README.md`. |
| `/dd:plan-goal` | Run 5-stage structured planning before implementation. | Produces durable checkpoint files in `docs/plan/<task>/.dotdotgod-plan/` and a plan README. |
| `/dd:impact` | Review changed files before verification or handoff. | Uses `dotdotgod graph impact` to identify likely related docs, tests, commands, and source files. |
| `document-clarify` | Improve docs wording without changing behavior contracts. | Clarifies README/spec/test/arch/plan/archive docs using memory-area roles. |

The package also includes matching skills for init, load, planning, plan-goal, and impact-review workflows.

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

Projects can customize memory roles with `memory.areas`, and can customize traceability requirements with `traceability.required` and `traceability.exclude`.

## Optional Hooks

Claude Code can run local lifecycle hooks from Claude settings. dotdotgod does not require hooks: `/dd:init`, `/dd:load`, `/dd:plan`, `/dd:impact`, and the bundled skills work without them.

Use hooks only when you want opt-in reminders, validation, or local safety rails around the same loop: plan, implement, impact-review, verify, review, and archive. See [`hooks/README.md`](https://github.com/dotdotgod/dotdotgod-kit/blob/main/packages/claude-code/hooks/README.md) for current lifecycle notes and advisory examples.

## Local Development

```bash
pnpm --filter @dotdotgod/claude-code run verify
pnpm --filter @dotdotgod/claude-code run pack:dry-run
```

## Learn More

See the [root README](https://github.com/dotdotgod/dotdotgod-kit#readme), [Context curation](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_CURATION.md), [Context mechanics](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/concept/CONTEXT_MECHANICS.md), [Memory area config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/MEMORY_AREA_CONFIG.md), and [Traceability config](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/TRACEABILITY_CONFIG.md).

## Compared with Graphify-Style Memory

This adapter is guidance-oriented. It asks Claude Code to prefer a bounded dotdotgod load snapshot, avoid broad archive scans, and follow README indexes before reading raw files. The strength is structured retrieval from explicit project-maintained links, not a giant graph report.
