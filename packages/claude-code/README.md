# @dotdotgod/claude-code

Claude Code adapter for dotdotgod's context curation workflow. It gives Claude Code `dd:*` commands and skills that follow the same curated `AGENTS.md`, docs/spec, docs/test, docs/arch, docs/plan, and docs/archive contract used by the Pi and Codex adapters.

## What Gets Better?

- `/dd:load` starts from curated project memory instead of ad-hoc rediscovery.
- Load guidance prefers `dotdotgod load-snapshot <root> --json` when the CLI is available, then falls back to README-index reads.
- Claude Code can use docs structure as retrieval intent: specs for behavior, architecture for rationale, tests for verification, plans for current work, and archive indexes for past decisions.
- Product intent, design rationale, and verification standards stay in durable docs instead of transient chat.
- `/dd:plan` writes or updates durable task intent in `docs/plan/<task-slug>/README.md` before implementation.
- `/dd:init` bootstraps shared agent instructions and docs folders for future context curation.
- Skills mirror the commands so natural-language requests can use the same workflows.

## Included

- Claude Code plugin manifest: `.claude-plugin/plugin.json`
- Slash commands:
  - `/dd:load`: load project memory read-only.
  - `/dd:plan`: plan from docs before implementation.
  - `/dd:init`: initialize shared agent docs and docs folders, using `dotdotgod init` when available and the bundled fallback when not.
- Skills:
  - `project-load`
  - `doc-first-planning`
  - `project-initializer`

## Optional Hooks

Claude Code can run local lifecycle hooks from Claude settings. dotdotgod does not require hooks: `/dd:load`, `/dd:plan`, `/dd:init`, and the bundled skills work without them.

Use hooks only when you want opt-in reminders or validation around the same workflow. See [`hooks/README.md`](hooks/README.md) for advisory examples and stricter plan-safety patterns.

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

## Shared Contract

- `AGENTS.md` remains canonical.
- `CLAUDE.md` stays thin and imports or points to `AGENTS.md`.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
- `docs/archive/README.md` is the archive map; archive bodies should be read only when targeted.

## Compared with Graphify-Style Memory

This adapter is guidance-oriented rather than a repo-wide extraction engine. It asks Claude Code to prefer a bounded dotdotgod load snapshot when available, avoid broad archive scans, and follow README indexes before reading raw files.

The strength is structured retrieval: project docs declare which files are rules, specs, architecture, verification, active intent, or historical memory. That keeps the memory layer useful on small tasks where a large graph report would be overhead.
