# @dotdotgod/claude-code

Claude Code adapter for dotdotgod project memory workflows. It gives Claude Code `dd:*` commands and skills that follow the same `AGENTS.md`, docs/spec, docs/test, docs/arch, docs/plan, and docs/archive contract used by the Pi and Codex adapters.

## What Gets Better?

- `/dd:load` starts with project memory instead of ad-hoc rediscovery.
- `/dd:plan` writes or updates a durable plan in `docs/plan/<task-slug>/README.md` before implementation.
- `/dd:init` bootstraps shared agent instructions and docs folders.
- Skills mirror the commands so natural-language requests can use the same workflows.

## Included

- Claude Code plugin manifest: `.claude-plugin/plugin.json`
- Slash commands:
  - `/dd:load`: load project memory read-only.
  - `/dd:plan`: plan from docs before implementation.
  - `/dd:init`: initialize shared agent docs and docs folders.
- Skills:
  - `project-load`
  - `doc-first-planning`
  - `project-initializer`

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
