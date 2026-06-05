# CLI Discovery

## Purpose

The `dotdotgod` CLI provides predictable discovery commands for users and scripts before they know the project root or command shape. Help and version commands must be safe to run without initializing project state.

## Top-Level Help and Version

- Top-level `dotdotgod --help`, `dotdotgod -h`, `dotdotgod help`, and bare `dotdotgod` MUST print usage to stdout and exit `0`.
- Top-level `dotdotgod --version`, `dotdotgod -v`, and `dotdotgod version` MUST print the `@dotdotgod/cli` package version to stdout and exit `0`.
- Unknown commands and invalid options MUST print diagnostics and usage to stderr and exit `2`.

## Subcommand Help

- Subcommand help MUST be available through `--help`, `-h`, or `help` without validating docs, reading caches, refreshing graph indexes, or initializing files.
- `dotdotgod resolve <root> <ref>` and `dotdotgod expand <root> <prompt>` MUST expose help without cache side effects and MUST support `--json`, `--max-results <n>`, and `--include-archive`.
- `expand` MUST also support `--with-impact` and opt-in `--fuzzy` natural-reference extraction.
- Nested subcommand help MUST be available for `graph impact`, `graph communities`, `config init`, and `traceability links`.

## Validation Command Options

`dotdotgod validate --max-lines <n>` and `--max-chars <n>` MUST override configured markdown validation budgets for that invocation only.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
  - [packages/cli/src/cli/usage.mjs](../../../packages/cli/src/cli/usage.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../../test/CLI_INTERFACE.md)
- Related docs:
  - [packages/cli/README.md](../../../packages/cli/README.md)
  - [docs/test/README.md](../../test/README.md)
  - [docs/spec/cli/README.md](README.md)
  - [docs/spec/CONFIG_COMMAND.md](../CONFIG_COMMAND.md)
  - [docs/spec/VALIDATION_CONFIG.md](../VALIDATION_CONFIG.md)
  - [docs/spec/REFERENCE_EXPANSION.md](../REFERENCE_EXPANSION.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs --help`
  - `node packages/cli/bin/dotdotgod.mjs --version`
  - `node packages/cli/bin/dotdotgod.mjs init --help`
  - `node packages/cli/bin/dotdotgod.mjs config --help`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/cli/usage.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md"],"relatedDocs":["packages/cli/README.md","docs/test/README.md","docs/spec/cli/README.md","docs/spec/CONFIG_COMMAND.md","docs/spec/VALIDATION_CONFIG.md","docs/spec/REFERENCE_EXPANSION.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs --help","node packages/cli/bin/dotdotgod.mjs --version","node packages/cli/bin/dotdotgod.mjs init --help","node packages/cli/bin/dotdotgod.mjs config --help"]}
```
