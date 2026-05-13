# @dotdotgod/claude-code

Claude Code adapter for dotdotgod project memory workflows.

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
npm --workspace @dotdotgod/claude-code run verify
npm --workspace @dotdotgod/claude-code run pack:dry-run
```

## Shared Contract

- `AGENTS.md` remains canonical.
- `CLAUDE.md` stays thin and imports or points to `AGENTS.md`.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
