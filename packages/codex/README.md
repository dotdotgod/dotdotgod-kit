# @dotdotgod/codex

Codex adapter for dotdotgod's context curation workflow. It packages reusable skills that help Codex load curated project memory, plan from docs before implementation, and initialize the shared agent documentation scaffold.

## What Gets Better?

- Codex can start from `AGENTS.md` and the dotdotgod docs map instead of rebuilding context manually.
- Load guidance prefers `dotdotgod load-snapshot <root> --json` when the CLI is available, then falls back to README-index reads.
- Codex can use docs structure as retrieval intent: specs for behavior, architecture for rationale, tests for verification, plans for current work, and archive indexes for past decisions.
- Planning work captures current intent in `docs/plan/<task-slug>/README.md` before implementation.
- Completed plans and temporary reports use the same archive structure as Pi and Claude Code, turning outcomes into future context.
- `dd:load`, `dd:plan`, and `dd:init` can be used as command-like trigger phrases where direct slash commands are unavailable.

## Included

- Codex plugin manifest: `.codex-plugin/plugin.json`
- Skills:
  - `project-load`: load project memory read-only.
  - `doc-first-planning`: plan from docs before implementation.
  - `project-initializer`: initialize shared agent docs and docs folders.

Codex may not expose the same slash-command model as Pi or Claude Code. Treat `dd:load`, `dd:plan`, and `dd:init` as command-like trigger phrases for these skills unless the active Codex plugin runtime provides direct command registration.

## Local Development

Run package checks:

```bash
pnpm --filter @dotdotgod/codex run verify
pnpm --filter @dotdotgod/codex run pack:dry-run
```

## Shared Contract

- `AGENTS.md` remains canonical.
- `CODEX.md` stays thin and points to `AGENTS.md`.
- Active plans use `docs/plan/<task-slug>/README.md`.
- Completed plans move to `docs/archive/plan/<task-slug>/`.
- Temporary reports move to `docs/archive/report/<report-slug>/`.
- `docs/archive/README.md` is the archive map; archive bodies should be read only when targeted.

## Compared with Graphify-Style Memory

This adapter packages reusable workflow skills rather than a repo-wide extraction engine. It guides Codex to prefer a bounded dotdotgod load snapshot when available, avoid broad archive scans, and follow README indexes before reading raw files.

The strength is structured retrieval: project docs declare which files are rules, specs, architecture, verification, active intent, or historical memory. That keeps the memory layer portable across Codex runtimes and useful on small tasks where a large graph report would be overhead.
