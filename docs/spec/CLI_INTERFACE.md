# CLI Interface

## Purpose

The `dotdotgod` CLI provides predictable discovery commands for users and scripts before they know the project root or command shape.

## Requirements

- Top-level `dotdotgod --help`, `dotdotgod -h`, `dotdotgod help`, and bare `dotdotgod` MUST print usage to stdout and exit `0`.
- Top-level `dotdotgod --version`, `dotdotgod -v`, and `dotdotgod version` MUST print the `@dotdotgod/cli` package version to stdout and exit `0`.
- Subcommand help MUST be available through `--help`, `-h`, or `help` without validating docs, reading caches, refreshing graph indexes, or initializing files.
- Nested subcommand help MUST be available for `graph impact`, `graph communities`, and `config init`.
- Unknown commands and invalid options MUST print diagnostics and usage to stderr and exit `2`.
- `dotdotgod graph impact <root>` MUST require `--changed <path>` and MAY include opt-in `--compact` output.
- Removed graph subcommands such as `graph query` MUST print an unknown graph command error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed`, human output MUST print a usage error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed --json`, JSON output MUST include `ok: false`, `command: "graph impact"`, `error.code: "MISSING_CHANGED"`, and a usage string, then exit `2`.
- `dotdotgod validate --max-lines <n>` and `--max-chars <n>` MUST override configured markdown validation budgets for that invocation only.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": ["packages/cli/src/core.mjs", "packages/cli/src/init.mjs"],
  "verifiedBy": ["packages/cli/test/e2e.test.mjs", "docs/test/CLI_INTERFACE.md"],
  "relatedDocs": ["packages/cli/README.md", "docs/test/README.md", "docs/spec/PROJECT_INITIALIZER.md", "docs/spec/CONFIG_COMMAND.md", "docs/spec/VALIDATION_CONFIG.md"],
  "verificationCommands": ["pnpm --filter @dotdotgod/cli test", "node packages/cli/bin/dotdotgod.mjs --help", "node packages/cli/bin/dotdotgod.mjs --version", "node packages/cli/bin/dotdotgod.mjs init --help", "node packages/cli/bin/dotdotgod.mjs config --help"]
}
```
