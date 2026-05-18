# Project Initializer

## Purpose

`project-initializer` creates a conservative documentation and agent-instruction baseline for a software project.

It is exposed through the shared `dotdotgod init` CLI command and as generated Pi, Claude Code, and Codex initializer guidance. Adapter guidance uses the CLI command when it is already available and keeps the bundled POSIX shell script as an offline fallback, so missing CLI access never blocks baseline initialization.

## CLI Contract

```bash
dotdotgod init <project-root> [--project-name NAME] [--dotdot-setting] [--force] [--dry-run] [--json]
```

Fallback script contract, used when `dotdotgod` is unavailable or not executable:

```bash
sh skills/project-initializer/scripts/init_project.sh <project-root> [--project-name NAME] [--dotdot-setting] [--force] [--dry-run]
```

## Default Generated Files

The initializer creates these files when missing:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `docs/README.md`
- `docs/spec/README.md`
- `docs/test/README.md`
- `docs/arch/README.md`
- `docs/plan/README.md`
- `docs/archive/README.md`

It also ensures `.gitignore` contains:

- `docs/plan`
- `docs/archive`
- `.dotdotgod`

## CLI Availability Policy

- Adapter initializer workflows MUST NOT require users to install `dotdotgod` before creating the baseline scaffold.
- If `dotdotgod init` is unavailable because the CLI command is missing or not executable, adapters MUST use the bundled fallback script so initialization can continue.
- The fallback scaffold MUST preserve the same baseline docs indexes and local-memory `.gitignore` entries so agents can navigate `AGENTS.md` and README indexes before the CLI is installed.
- CLI-only validation, graph cache, and load-snapshot features may be added later without changing the initialized docs shape.

## Overwrite Policy

- Existing files are skipped by default.
- `--force` replaces existing generated files only after moving the old file to `<name>.bak.<timestamp>`.
- `--dry-run` reports intended create/update/replace actions without writing files.
- `--json` is supported by `dotdotgod init` for structured action reporting.

## Project Name

- `--project-name NAME` sets the project name used in generated `AGENTS.md`.
- If omitted, the basename of `<project-root>` is used.

## Documentation Contract

Generated docs follow these conventions:

- Projects using the dotdotgod CLI should run `dotdotgod validate` after docs changes; the CLI owns machine-readable traceability validation for behavior specs and expects traceability as the final section.
- Directories under `docs/` use kebab-case.
- Markdown file names under `docs/` use UPPER_SNAKE_CASE, including `README.md`.
- Individual markdown files should preferably stay under the configured markdown validation budgets, which default to 200 lines and 10,000 characters.
- Large docs should be split into focused UPPER_SNAKE_CASE files while `README.md` remains the index/overview.
- Adding, renaming, splitting, moving, or archiving docs should update the nearest relevant `README.md` index/table of contents in the same change.
- When one domain grows into multiple docs, promote it to `docs/<area>/<domain>/README.md` plus related UPPER_SNAKE_CASE files in that directory.
- Completed plan task directories move from `docs/plan/<task-slug>/` to `docs/archive/plan/<task-slug>/`.
- Temporary investigations, reports, payload captures, and historical notes live under `docs/archive/report/<report-slug>/`.

## Dotdot Setting

`--dotdot-setting` adds the optional dotdot code convention scaffold. See [`DOTDOT_SETTING.md`](./DOTDOT_SETTING.md).

## Non-Goals

- The initializer does not merge into existing files unless `--force` is explicitly used.
- The initializer does not infer project stack beyond the project name.
- The initializer does not require the CLI in adapter contexts; missing CLI access must fall back to the bundled script.
- The initializer does not require or create a project config file by default; use `dotdotgod config init` when a project wants editable policy.
- `docs/plan`, `docs/archive`, and `.dotdotgod` are local working/cache areas by default and are ignored by git unless a project deliberately changes that policy.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/cli/src/init.mjs",
    "packages/cli/src/core.mjs",
    "packages/shared/initializer/scripts/init_project.sh",
    "packages/pi/skills/project-initializer/scripts/init_project.sh",
    "packages/claude-code/skills/project-initializer/scripts/init_project.sh",
    "packages/codex/skills/project-initializer/scripts/init_project.sh",
    "scripts/generate-adapters.mjs"
  ],
  "verifiedBy": [
    "packages/cli/test/e2e.test.mjs",
    "docs/test/README.md",
    "docs/test/MANUAL_SMOKE.md"
  ],
  "relatedDocs": [
    "docs/spec/CLI_INTERFACE.md",
    "docs/arch/CROSS_AGENT_ARCHITECTURE.md",
    "docs/arch/DOCS_STRUCTURE.md"
  ],
  "verificationCommands": [
    "node packages/cli/bin/dotdotgod.mjs init . --dry-run --project-name fixture-name",
    "sh packages/pi/skills/project-initializer/scripts/init_project.sh --dry-run --project-name fixture-name .",
    "pnpm --filter @dotdotgod/cli test",
    "pnpm run verify:generated"
  ]
}
```
