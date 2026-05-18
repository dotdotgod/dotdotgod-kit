# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records.

## Index

- `README.md`: test documentation scope, verification commands, and manual smoke checks.
- `MEMORY_AREA_CONFIG.md`: memory-area config validation and snapshot smoke checks.
- `TRACEABILITY_CONFIG.md`: configurable traceability enforcement validation smoke checks.
- `VALIDATION_CONFIG.md`: markdown validation budget and size-check exclusion coverage.
- `CONTEXT_MEASUREMENT.md`: context measurement commands and runtime context debug smoke checks.
- `COMMAND_GUIDANCE.md`: environment-aware load-snapshot command guidance checks.
- `IMPACT_RANKING_CONFIG.md`: configurable graph impact ranking, compact output, semantic-edge, and selection-noise checks.
- `GRAPH_IMPACT_QUALITY.md`: graph impact quality scoring script, metrics, and baseline comparison checks.
- `CONFIG_COMMAND.md`: project-level config show/init command checks.
- `HOOKS.md`: optional Claude Code and Codex hook documentation and package-resource smoke checks.
- `CLI_INTERFACE.md`: baseline CLI help/version and invalid invocation checks.
- `MANUAL_SMOKE.md`: adapter, Plan Mode, initializer, and publishing smoke checks.

## Verification Commands

Regenerate adapter resources from shared sources:

```bash
pnpm run generate
```

Check generated adapter resources for drift:

```bash
pnpm run verify:generated
```

Run TypeScript type checks where workspace packages provide them:

```bash
pnpm run verify:types
```

Run unit tests where workspace packages provide them:

```bash
pnpm run verify:unit
```

Check that package-level quality scripts are included in each package's `verify` script:

```bash
pnpm run verify:contract
```

Run CLI unit and e2e tests directly:

```bash
pnpm --filter @dotdotgod/cli test
```

Run CLI graph/cache smoke directly:

```bash
node packages/cli/bin/dotdotgod.mjs --help
node packages/cli/bin/dotdotgod.mjs --version
node packages/cli/bin/dotdotgod.mjs init . --dry-run --project-name fixture-name
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --compact --json
node scripts/evaluate-graph-impact.mjs . --json
node packages/cli/bin/dotdotgod.mjs graph communities . --json
node packages/cli/bin/dotdotgod.mjs load-snapshot . --json
node packages/cli/bin/dotdotgod.mjs status . --json
```

Confirm JSON includes schema/refresh metadata, graph counts, bounded summaries, retrieval hints, and archive policy. For graph impact, confirm traceability relations surface related specs/tests/docs.

Run the optimized full workspace gate:

```bash
pnpm run verify
```

`pnpm run verify` checks generated-resource drift, enforces the package `verify` contract, then delegates package-specific syntax/typecheck/test/resource checks to each package's `verify` script. Use `verify:types` and `verify:unit` for targeted direct checks, not as extra steps before the full gate.

Run package dry-runs with the standalone safe wrapper:

```bash
pnpm run pack:dry-run
```

Run only package tarball dry-runs after generated resources have already been checked:

```bash
pnpm run pack:dry-run:packages
```

Run docs validation directly:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
node packages/cli/bin/dotdotgod.mjs validate . --check-index
```

## Workspace Coverage

- `@dotdotgod/shared`: private source resources for generated adapter commands, skills, and initializer files.
- `@dotdotgod/pi`: generated initializer skill, extension syntax smoke checks, TypeScript typecheck, unit tests for pure plan/load helpers, and Pi package tarball dry-run.
- `@dotdotgod/cli`: CLI syntax check, unit/e2e tests, validation against this repository, sharded cache/index status smoke checks, stale-index reindex coverage, and Leiden/fallback community output coverage.
- `@dotdotgod/claude-code`: generated plugin commands/skills, plugin manifest/resource checks, and tarball dry-run.
- `@dotdotgod/codex`: generated plugin skills, plugin manifest/skill checks, and tarball dry-run.

## Manual Smoke Tests

See `MANUAL_SMOKE.md` for adapter, Plan Mode, initializer, publishing, and README landing smoke checks.

Memory area config smoke: see `MEMORY_AREA_CONFIG.md`.

Traceability config smoke: see `TRACEABILITY_CONFIG.md`.

Validation config smoke: see `VALIDATION_CONFIG.md`.

Hook guidance smoke: see `HOOKS.md`.

Context measurement smoke: see `CONTEXT_MEASUREMENT.md`.

## Husky Pre-Push Hook

Husky lives at the workspace root and is installed by the root `prepare` script.

Pre-push hook:

```bash
pnpm run verify && pnpm run verify:cache && pnpm run pack:dry-run:packages
```

`verify:cache` runs docs validation, `dotdotgod index`, and `dotdotgod status`, so pre-push refreshes the ignored `.dotdotgod/` cache automatically before checking freshness.

Run it manually with:

```bash
.husky/pre-push
```

`pnpm run verify` includes generated-resource drift checks, so the pre-push hook uses `pack:dry-run:packages` to avoid repeating that check through the standalone `pack:dry-run` wrapper. Direct edits to generated adapter files fail until `pnpm run generate` is run or the shared source is updated. Husky is not required for package consumers and remains a development-only workflow.
