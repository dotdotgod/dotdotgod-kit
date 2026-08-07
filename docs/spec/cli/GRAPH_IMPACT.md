# CLI Graph Impact

## Purpose

`dotdotgod graph impact` gives agents a bounded, structured review list for changed files before broad verification, commits, pushes, publishing, or final handoff.

## Requirements

- `dotdotgod graph impact <root>` MUST require at least one `--changed <path>` and MUST accept repeated `--changed` options.
- Repeated changed paths MUST be deduplicated by first occurrence while preserving input order, and more than 20 unique changed paths MUST fail with `TOO_MANY_CHANGED` before index refresh.
- Multi-file impact MUST use an equal-weight multi-seed Personalized PageRank and MUST place every changed file first in input order with seed score `100`.
- Non-seed scores MUST use fixed weighted PPR connection `80` plus memory policy `20`, with candidate-independent internal PPR reference `0.4` exposed in ranking diagnostics.
- Direct, curated, verification/test, semantic-only, and node-type evidence MUST NOT receive separate score or ordering bonuses; relation weights influence rank only through PPR and direct reasons remain explanation-only.
- The score breakdown MUST expose `connection.ppr`, raw probability/reference, `memory.priority`, memory policy adjustments, and optional strongest direct relation evidence.
- Structured results MUST preserve legacy `changed` as the first changed path, expose all normalized paths as `changedFiles`, keep `related` as the bounded combined ranking, and include at most five non-seed related nodes per changed file in `perSeed`.
- Shared related nodes MAY repeat across `perSeed` lists, while the combined `related` ranking MUST deduplicate nodes.
- The command MAY include one output mode: `--compact`, `--json`, or `--yml`/`--yaml`.
- `--yml`/`--yaml` MUST return compact structured agent-facing output with changed files, per-seed top-five results, grouped docs, tests, files, scores, reasons, omitted counts, status metadata, and recommended actions.
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
  - [packages/cli/src/impact/scoring.mjs](../../../packages/cli/src/impact/scoring.mjs)
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
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --json`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --yml`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --compact`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/commands/graph.mjs","packages/cli/src/impact/report.mjs","packages/cli/src/impact/scoring.mjs","packages/cli/src/impact/format.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md","docs/test/IMPACT_RANKING_CONFIG.md"],"relatedDocs":["docs/spec/IMPACT_RANKING_CONFIG.md","docs/test/README.md","packages/cli/README.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --json","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --yml","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --changed packages/cli/src/impact/report.mjs --compact"]}
```
