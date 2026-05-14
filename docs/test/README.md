# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records.

## Verification Commands

Regenerate adapter resources from shared sources:

```bash
npm run generate
```

Check generated adapter resources for drift:

```bash
npm run verify:generated
```

Run all workspace package checks:

```bash
npm run verify
```

Run package dry-runs:

```bash
npm run pack:dry-run
```

Run docs validation directly:

```bash
node packages/docs-validator/bin/dd-docs-validate.mjs . --include-local-memory
```

## Workspace Coverage

- `@dotdotgod/shared`: private source resources for generated adapter commands, skills, and initializer files.
- `@dotdotgod/pi`: generated initializer skill, extension syntax smoke checks, and Pi package tarball dry-run.
- `@dotdotgod/docs-validator`: CLI syntax check and validation against this repository.
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

Plan mode preview ordering and todo extraction:

1. Run `/plan`.
2. Ask the agent to write or update a plan under `docs/plan/<task-slug>/README.md`.
3. Confirm the full saved plan preview and `Execute the plan / Stay in plan mode / Refine the plan` choices appear together in one custom UI.
4. Confirm preview scrolling uses wrapped rendered lines, action choices stay fixed below the preview, and no full plan markdown is embedded in a separate select prompt.
5. Confirm `[plan-todo-list]` appears only after choosing execute and does not include generic template labels such as `Target files and rationale`, `Implementation steps`, or `Verification method` as executable todos.

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

Initializer parity smoke:

```bash
sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/claude-code/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
sh packages/codex/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name <fixture-root>
```

Pi adapter npm install after publish:

```bash
pi install npm:@dotdotgod/pi
```

## Husky Plan

Husky should live at the workspace root if enabled.

Recommended pre-push hook:

```bash
npm run verify && npm run pack:dry-run
```

`npm run verify` includes generated-resource drift checks, so direct edits to generated adapter files fail until `npm run generate` is run or the shared source is updated.

Husky is not required for package consumers and should remain a development-only workflow.
