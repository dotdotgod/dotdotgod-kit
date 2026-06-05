# CLI Graph Impact

## Purpose

`dotdotgod graph impact` gives agents a bounded, structured review list for changed files before broad verification, commits, pushes, publishing, or final handoff.

## Requirements

- `dotdotgod graph impact <root>` MUST require `--changed <path>`.
- The command MAY include one output mode: `--compact`, `--json`, or `--yml`/`--yaml`.
- `--yml`/`--yaml` MUST return compact structured agent-facing output with grouped docs, tests, files, scores, reasons, omitted counts, status metadata, and recommended actions.
- Unsupported graph subcommands such as `graph query` MUST print an unknown graph command error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed`, human output MUST print a usage error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed --json`, JSON output MUST include `ok: false`, `command: "graph impact"`, `error.code: "MISSING_CHANGED"`, and a usage string, then exit `2`.
- The same missing argument with `--yml` MUST return structured `ok: false` YML.
- Incompatible graph impact output modes such as `--compact --json` or `--compact --yml` MUST exit `2` with `OUTPUT_MODE_CONFLICT`.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
  - [packages/cli/src/commands/graph.mjs](../../../packages/cli/src/commands/graph.mjs)
  - [packages/cli/src/impact/report.mjs](../../../packages/cli/src/impact/report.mjs)
  - [packages/cli/src/impact/format.mjs](../../../packages/cli/src/impact/format.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../../test/CLI_INTERFACE.md)
  - [docs/test/IMPACT_RANKING_CONFIG.md](../../test/IMPACT_RANKING_CONFIG.md)
- Related docs:
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
  - [docs/test/README.md](../../test/README.md)
  - [packages/cli/README.md](../../../packages/cli/README.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/commands/graph.mjs","packages/cli/src/impact/report.mjs","packages/cli/src/impact/format.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md","docs/test/IMPACT_RANKING_CONFIG.md"],"relatedDocs":["docs/spec/IMPACT_RANKING_CONFIG.md","docs/test/README.md","packages/cli/README.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact"]}
```
