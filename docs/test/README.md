# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records.

## Verification Commands

Regenerate adapter resources from shared sources:

```bash
pnpm run generate
```

Check generated adapter resources for drift:

```bash
pnpm run verify:generated
```

Run TypeScript type checks where workspace packages provide them:

```bash
pnpm run verify:types
```

Run unit tests where workspace packages provide them:

```bash
pnpm run verify:unit
```

Run all workspace package checks:

```bash
pnpm run verify
```

Run package dry-runs:

```bash
pnpm run pack:dry-run
```

Run docs validation directly:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Workspace Coverage

- `@dotdotgod/shared`: private source resources for generated adapter commands, skills, and initializer files.
- `@dotdotgod/pi`: generated initializer skill, extension syntax smoke checks, TypeScript typecheck, unit tests for pure plan/load helpers, and Pi package tarball dry-run.
- `@dotdotgod/cli`: CLI syntax check, validation against this repository, and cache/index status smoke checks.
- `@dotdotgod/claude-code`: generated plugin commands/skills, plugin manifest/resource checks, and tarball dry-run.
- `@dotdotgod/codex`: generated plugin skills, plugin manifest/skill checks, and tarball dry-run.

## Manual Smoke Tests

Pi adapter local install:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

Pi load command aliases:

```text
/load
/dd:load
```

Plan mode review choice and todo extraction:

1. Run `/plan`.
2. Ask the agent to write or update a plan under `docs/plan/<task-slug>/README.md`.
3. Confirm Pi asks whether to `Execute the plan / Stay in plan mode / Refine the plan` without rendering a saved-plan file preview.
4. Confirm ordinary explanatory replies that do not touch `docs/plan/` do not show the action prompt or extract todos.
5. Confirm the action prompt uses a short selector title and does not embed the full plan markdown.
6. Confirm no `[plan-todo-list]` message or persistent todo widget is shown; use `/todos` for on-demand progress details.
7. Confirm Plan Mode allows constrained housekeeping such as `mkdir -p docs/archive/plan`, `mv docs/plan/<task-slug> docs/archive/plan/<task-slug>`, and `rm -r docs/plan/<task-slug>`.
8. Confirm Plan Mode still blocks housekeeping that touches source/config paths, such as `rm package.json` or `mv packages/pi docs/archive/plan/pi`.
9. In a high-context session, enable `/plan` and confirm Pi shows `Planning context is large; compacting before continuing.` followed by `Planning compaction completed.`
10. Confirm the Plan Mode compaction request uses planning-specific `customInstructions` that preserve decisions, active plan status, relevant docs, verification results, next steps, and `[DONE:n]` markers.
11. Confirm repeated Plan Mode turns immediately after compaction do not trigger another compaction until enough new session entries exist.

Claude Code adapter local plugin smoke:

```bash
claude --plugin-dir /Users/dotdot/Workspace/dotdotgod/packages/claude-code
```

Then confirm these commands are discoverable or invokable in the active Claude Code runtime:

```text
/dd:load
/dd:plan
/dd:init
```

Codex adapter local plugin smoke:

- Install or add `/Users/dotdot/Workspace/dotdotgod/packages/codex` with the current Codex local plugin workflow.
- Confirm `project-load`, `doc-first-planning`, and `project-initializer` skills are discoverable.
- Confirm command-like trigger phrases `dd:load`, `dd:plan`, and `dd:init` activate the expected workflows.

Cross-agent planning parity smoke:

- Confirm Claude Code `/dd:plan` and `doc-first-planning` guidance mention the written plan file as the durable review artifact and do not reference saved-plan preview UI.
- Confirm Codex `doc-first-planning` guidance has the same planning workflow, archive housekeeping, and package-manager-aware verification guidance.
- Confirm generated resources stay in sync with `packages/shared/workflows/plan.md` via `pnpm run verify:generated`.

Initializer parity smoke:

```bash
sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/claude-code/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/codex/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
```

Pi adapter npm install after publish:

```bash
pi install npm:@dotdotgod/pi
pi uninstall npm:@dotdotgod/pi
```

Confirmed after the first public `0.1.0` publish: install added the package successfully and uninstall removed it successfully.

Context measurement smoke:

```bash
pnpm run measure:context
pnpm run measure:context:json
node scripts/measure-context.mjs --markdown --output docs/archive/report/context-metrics/latest.md
```

- Confirm the static measurement reports load prompt, baseline memory, default docs surface, archive index, full archive, and archive body excluded estimates.
- Confirm local output under `docs/archive/report/context-metrics/` remains ignored by git.
- In Pi, start with `--dd-context-debug --dd-context-debug-output docs/archive/report/context-metrics/session.jsonl`, run `/dd:load` and `/plan`, then confirm JSONL events are written for load, Plan Mode full curated load requests/skips, deferred load-after-compaction events when applicable, and Plan Mode activity.

README landing review:

- Confirm root `README.md` leads with the dotdotgod concept and user outcomes before package details.
- Confirm each published package README explains the package-specific value proposition before local development details.
- Confirm package READMEs avoid implying Pi-style runtime enforcement for Claude Code or Codex adapters.

## Husky Pre-Push Hook

Husky lives at the workspace root and is installed by the root `prepare` script.

Pre-push hook:

```bash
pnpm run verify && pnpm run pack:dry-run
```

Run it manually with:

```bash
.husky/pre-push
```

`pnpm run verify` includes generated-resource drift checks, so direct edits to generated adapter files fail until `pnpm run generate` is run or the shared source is updated.

Husky is not required for package consumers and remains a development-only workflow.
