# CLI Interface

## Purpose

The `dotdotgod` CLI provides predictable discovery commands for users and scripts before they know the project root or command shape.

## Requirements

- Top-level `dotdotgod --help`, `dotdotgod -h`, `dotdotgod help`, and bare `dotdotgod` MUST print usage to stdout and exit `0`.
- Top-level `dotdotgod --version`, `dotdotgod -v`, and `dotdotgod version` MUST print the `@dotdotgod/cli` package version to stdout and exit `0`.
- Subcommand help MUST be available through `--help`, `-h`, or `help` without validating docs, reading caches, refreshing graph indexes, or initializing files.
- `dotdotgod resolve <root> <ref>` and `dotdotgod expand <root> <prompt>` MUST expose help without cache side effects and MUST support `--json`, `--max-results <n>`, and `--include-archive`; `expand` MUST also support `--with-impact` and opt-in `--fuzzy` natural-reference extraction.
- Nested subcommand help MUST be available for `graph impact`, `graph communities`, `config init`, and `traceability links`.
- Unknown commands and invalid options MUST print diagnostics and usage to stderr and exit `2`.
- `dotdotgod graph impact <root>` MUST require `--changed <path>` and MAY include one output mode: `--compact`, `--json`, or `--yml`/`--yaml`.
- `--yml`/`--yaml` MUST return compact structured agent-facing output with grouped docs, tests, files, scores, reasons, omitted counts, status metadata, and recommended actions.
- Unsupported graph subcommands such as `graph query` MUST print an unknown graph command error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed`, human output MUST print a usage error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed --json`, JSON output MUST include `ok: false`, `command: "graph impact"`, `error.code: "MISSING_CHANGED"`, and a usage string, then exit `2`; the same missing argument with `--yml` MUST return structured `ok: false` YML.
- Incompatible graph impact output modes such as `--compact --json` or `--compact --yml` MUST exit `2` with `OUTPUT_MODE_CONFLICT`.
- `dotdotgod validate --max-lines <n>` and `--max-chars <n>` MUST override configured markdown validation budgets for that invocation only.
- `dotdotgod traceability links <root> [--check|--write] [--json]` MUST expose help without reading caches or refreshing graph indexes; check mode MUST report missing or stale generated traceability-link sections, and write mode MUST update only sentinel-bounded generated regions or insert missing regions before canonical traceability blocks.
- `dotdotgod plan validate docs/plan/<task-slug>/README.md [--stage stage] [--json]` MUST validate an active plan artifact without refreshing caches. The durable plan path MUST be `docs/plan/<kebab-case-task-slug>/README.md`. Old-layout plans MUST remain valid with canonical stage directories `01-intake` through `08-verify-replan-close`, each containing `README.md`. New workspace plans MUST use internal files under `.dotdotgod-plan/NN_STAGE_NAME.md` such as `03_DISCOVERY.md`, include `01-intake` through `08-verify-replan-close`, and include `09-subagent-workstreams` before final review. Required headers MUST exist in the selected stage artifact or a valid split file and contain non-placeholder content. Pending required role/area workstreams, unresolved discussion queue items, unresolved assumptions, and atomic tasks without acceptance criteria or verification MUST be blockers. `--stage` MUST accept a canonical stage name or unambiguous numeric prefix such as `04` or `09`; stage-scoped validation MUST validate only the selected stage and MUST NOT require later stages. Clean stage-scoped success MAY include optional `nextStage` guidance for the following stage. General docs validation MUST tolerate `.dotdotgod-plan/NN_STAGE_NAME.md` internal uppercase numeric filenames. Human output MUST list blockers, include an agent repair prompt, and exit non-zero on failure; JSON output MUST include `ok`, `planPath`, `blockers`, `warnings`, `summary`, and failure output MUST include repair prompts.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/cli/usage.mjs](../../packages/cli/src/cli/usage.mjs)
  - [packages/cli/src/commands/plan.mjs](../../packages/cli/src/commands/plan.mjs)
  - [packages/cli/src/init.mjs](../../packages/cli/src/init.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../test/CLI_INTERFACE.md)
- Related docs:
  - [packages/cli/README.md](../../packages/cli/README.md)
  - [docs/test/README.md](../test/README.md)
  - [docs/spec/PROJECT_INITIALIZER.md](PROJECT_INITIALIZER.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/spec/VALIDATION_CONFIG.md](VALIDATION_CONFIG.md)
  - [docs/spec/REFERENCE_EXPANSION.md](REFERENCE_EXPANSION.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs --help`
  - `node packages/cli/bin/dotdotgod.mjs --version`
  - `node packages/cli/bin/dotdotgod.mjs init --help`
  - `node packages/cli/bin/dotdotgod.mjs config --help`
  - `node packages/cli/bin/dotdotgod.mjs traceability links --help`
  - `node packages/cli/bin/dotdotgod.mjs plan validate --help`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/cli/usage.mjs","packages/cli/src/commands/plan.mjs","packages/cli/src/init.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md"],"relatedDocs":["packages/cli/README.md","docs/test/README.md","docs/spec/PROJECT_INITIALIZER.md","docs/spec/CONFIG_COMMAND.md","docs/spec/VALIDATION_CONFIG.md","docs/spec/REFERENCE_EXPANSION.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs --help","node packages/cli/bin/dotdotgod.mjs --version","node packages/cli/bin/dotdotgod.mjs init --help","node packages/cli/bin/dotdotgod.mjs config --help","node packages/cli/bin/dotdotgod.mjs traceability links --help","node packages/cli/bin/dotdotgod.mjs plan validate --help"]}
```
