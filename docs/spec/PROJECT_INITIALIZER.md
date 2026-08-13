# Project Initializer

## Purpose

`project-initializer` creates shared agent instructions, documentation indexes, local-memory ignores, and a complete editable project config.

The `dotdotgod init` CLI command and bundled POSIX fallback produce the same baseline file set and canonical config for Pi, Claude Code, and Codex workflows.

## CLI Contract

```bash
dotdotgod init <project-root> [--project-name NAME] [--template NAME] [--dotdot-setting] [--dry-run] [--json]
```

Fallback script contract, used when `dotdotgod` is unavailable or not executable:

```bash
sh skills/project-initializer/scripts/init_project.sh <project-root> [--project-name NAME] [--template NAME] [--dotdot-setting] [--dry-run]
```

## Generated Scaffold

The initializer creates a common scaffold when files are missing:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `dotdotgod.config.json`
- `docs/README.md`
- `docs/spec/README.md`
- `docs/test/README.md`
- `docs/arch/README.md`
- `docs/plan/README.md`
- `docs/archive/README.md`

For bundled templates, it also materializes the template's maintained domain areas with focused `README.md` indexes. The `research` template adds `docs/research/README.md`, `docs/record/README.md`, `docs/report/README.md`, and the generated-artifact directory `outputs/`. Other bundled templates likewise create indexes for their directory-based domain areas. File-specific paths are not synthesized, and non-document artifact roots are created as empty runtime directories.

Custom templates create the common scaffold and project config only. Their arbitrary path globs are not interpreted as writable filesystem instructions.

It also ensures `.gitignore` contains:

- `docs/plan`
- `docs/archive`
- `.dotdotgod`

## CLI Availability Policy

- Adapters use `dotdotgod init` when available and the bundled fallback otherwise.
- Both paths MUST create the same common and bundled-template scaffold, local-memory `.gitignore` entries, and structurally identical `dotdotgod.config.json` data.
- The fallback MUST copy a generated config template derived from the CLI's canonical default serializer.

## Default Agent Guidance

Generated `AGENTS.md` includes this stable CLI discovery section:

```md
## dotdotgod

dotdotgod is a project memory CLI for AI agents.

Use `dotdotgod --help` to discover available project-memory commands and their usage.
```

The full command catalog remains owned by CLI Help. `CLAUDE.md` and `CODEX.md` stay thin entrypoints and do not duplicate this section.

## Existing-File Policy

- Files already present are always preserved and skipped.
- `--dry-run` reports intended create and update actions without writing files.
- `--json` is supported by `dotdotgod init` for structured action reporting.

## Config Policy

- New project config is materialized from an explicitly selected template, global `defaultTemplate`, or bundled `software`.
- The initializer skill inspects the project and passes an appropriate template explicitly when evidence is sufficient.
- `dotdotgod.config.json` is the only supported project config filename.
- Existing `dotdotgod.config.json` files follow the normal skip and dry-run rules.
- All bundled templates are generated and packaged with each adapter rather than maintained separately in shell.
- The POSIX fallback supports explicitly selected bundled templates; custom templates require the CLI.

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

`--dotdot-setting` adds the optional dotdot documentation-structure and code-convention scaffold. See [`DOTDOT_SETTING.md`](./DOTDOT_SETTING.md).

## Non-Goals

- The initializer does not merge into or replace files already present.
- The initializer does not infer project stack beyond the project name.
- The initializer does not materialize arbitrary custom-template globs or create placeholder content for file-specific memory areas.
- `docs/plan`, `docs/archive`, and `.dotdotgod` are local working/cache areas by default and are ignored by git unless a project deliberately changes that policy.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/config/templates.mjs](../../packages/cli/src/config/templates.mjs)
  - [packages/shared/initializer/scripts/init_project.sh](../../packages/shared/initializer/scripts/init_project.sh)
  - [packages/shared/workflows/init.md](../../packages/shared/workflows/init.md)
  - [packages/shared/initializer/templates/dotdotgod.config.json](../../packages/shared/initializer/templates/dotdotgod.config.json)
  - [packages/pi/skills/project-initializer/scripts/init_project.sh](../../packages/pi/skills/project-initializer/scripts/init_project.sh)
  - [packages/claude-code/skills/project-initializer/scripts/init_project.sh](../../packages/claude-code/skills/project-initializer/scripts/init_project.sh)
  - [packages/codex/skills/project-initializer/scripts/init_project.sh](../../packages/codex/skills/project-initializer/scripts/init_project.sh)
  - [scripts/generate-adapters.mjs](../../scripts/generate-adapters.mjs)
- Verified by:
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/README.md](../test/README.md)
  - [docs/test/CONFIG_COMMAND.md](../test/CONFIG_COMMAND.md)
  - [docs/test/CONFIG_TEMPLATES.md](../test/CONFIG_TEMPLATES.md)
  - [docs/test/MANUAL_SMOKE.md](../test/MANUAL_SMOKE.md)
- Related docs:
  - [docs/spec/CONFIG_TEMPLATES.md](CONFIG_TEMPLATES.md)
  - [docs/spec/CLI_INTERFACE.md](CLI_INTERFACE.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
- Design decisions:
  - [docs/arch/CONFIG_TEMPLATE_ARCHITECTURE.md](../arch/CONFIG_TEMPLATE_ARCHITECTURE.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/arch/DOCS_STRUCTURE.md](../arch/DOCS_STRUCTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/init.mjs","packages/cli/src/core.mjs","packages/cli/src/config/templates.mjs","packages/shared/initializer/scripts/init_project.sh","packages/shared/workflows/init.md","packages/shared/initializer/templates/dotdotgod.config.json","packages/pi/skills/project-initializer/scripts/init_project.sh","packages/claude-code/skills/project-initializer/scripts/init_project.sh","packages/codex/skills/project-initializer/scripts/init_project.sh","scripts/generate-adapters.mjs"],"verifiedBy":["packages/cli/test/e2e.test.mjs","docs/test/README.md","docs/test/CONFIG_COMMAND.md","docs/test/CONFIG_TEMPLATES.md","docs/test/MANUAL_SMOKE.md"],"relatedDocs":["docs/spec/CONFIG_TEMPLATES.md","docs/spec/CLI_INTERFACE.md","docs/spec/CONFIG_COMMAND.md"],"designDecisions":["docs/arch/CONFIG_TEMPLATE_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/arch/DOCS_STRUCTURE.md"]}
```
