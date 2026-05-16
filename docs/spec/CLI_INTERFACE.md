# CLI Interface

## Purpose

The `dotdotgod` CLI provides predictable discovery commands for users and scripts before they know the project root or command shape.

## Requirements

- Top-level `dotdotgod --help`, `dotdotgod -h`, `dotdotgod help`, and bare `dotdotgod` MUST print usage to stdout and exit `0`.
- Top-level `dotdotgod --version`, `dotdotgod -v`, and `dotdotgod version` MUST print the `@dotdotgod/cli` package version to stdout and exit `0`.
- Subcommand help MUST be available through `--help`, `-h`, or `help` without validating docs, reading caches, or refreshing graph indexes.
- Unknown commands and invalid options MUST print diagnostics and usage to stderr and exit `2`.
- `dotdotgod graph impact <root>` and the deprecated `dotdotgod graph query <root>` alias MUST require `--changed <path>`.
- When `graph impact` or `graph query` is missing `--changed`, human output MUST print a usage error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` or `graph query` is missing `--changed --json`, JSON output MUST include `ok: false`, `command: "graph impact"`, `error.code: "MISSING_CHANGED"`, and a usage string, then exit `2`.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": ["packages/cli/src/core.mjs"],
  "verifiedBy": ["packages/cli/test/e2e.test.mjs", "docs/test/CLI_INTERFACE.md"],
  "relatedDocs": ["packages/cli/README.md", "docs/test/README.md"],
  "verificationCommands": ["pnpm --filter @dotdotgod/cli test", "node packages/cli/bin/dotdotgod.mjs --help", "node packages/cli/bin/dotdotgod.mjs --version"]
}
```
