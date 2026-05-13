# Project Initializer

## Purpose

`project-initializer` creates a conservative documentation and agent-instruction baseline for a software project.

It is exposed as a Pi skill and uses a bundled POSIX shell script for deterministic file creation.

## CLI Contract

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

## Overwrite Policy

- Existing files are skipped by default.
- `--force` replaces existing generated files only after moving the old file to `<name>.bak.<timestamp>`.
- `--dry-run` reports intended create/update/replace actions without writing files.

## Project Name

- `--project-name NAME` sets the project name used in generated `AGENTS.md`.
- If omitted, the basename of `<project-root>` is used.

## Documentation Contract

Generated docs follow these conventions:

- Directories under `docs/` use kebab-case.
- Markdown file names under `docs/` use UPPER_SNAKE_CASE, including `README.md`.
- Individual markdown files should preferably stay under 200 lines and under 10,000 characters.
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
- `docs/plan` and `docs/archive` are local working-memory areas by default and are ignored by git unless a project deliberately changes that policy.
