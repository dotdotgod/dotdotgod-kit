# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records.

## Index

- `README.md`: test documentation scope, verification command cheat sheet, and local table of contents.
- `MEMORY_AREA_CONFIG.md`: memory-area config validation and graph/Load-query policy smoke checks.
- `TRACEABILITY_CONFIG.md`: configurable traceability enforcement validation smoke checks.
- `VALIDATION_CONFIG.md`: markdown validation budget and size-check exclusion coverage.
- `CONTEXT_MEASUREMENT.md`: context measurement commands and runtime context debug smoke checks.
- `CONTEXT_EXECUTION.md`: automated and manual coverage for local execution, FTS5 retrieval, MCP protocol, hooks, and adapter parity.
- `COMMAND_GUIDANCE.md`: environment-aware query and project command guidance checks.
- `IMPACT_RANKING_CONFIG.md`: fixed graph-impact scoring, non-blocking compatibility config, request-local vector overlay, compact output, and selection-noise checks.
- `GRAPH_IMPACT_QUALITY.md`: graph impact quality scoring script, metrics, and baseline comparison checks.
- `CONFIG_COMMAND.md`: project-level config show/init command checks.
- `CONFIG_TEMPLATES.md`: initialization template selection, isolation, shadowing, packaging, and fallback checks.
- `EMBEDDING_CONFIG.md`: provider precedence, transport, credentials, dynamic dimensions, and cache invalidation checks.
- `HOOKS.md`: optional Claude Code and Codex hook documentation and package-resource smoke checks.
- `CLI_INTERFACE.md`: baseline CLI help/version and invalid invocation checks.
- `CLI_MAP.md`: shared documentation-map command, depth, filtering, JSON, errors, side effects, and adapter parity checks.
- `REFERENCE_EXPANSION.md`: reference resolution and prompt-time expansion regression and smoke checks.
- `MANUAL_SMOKE.md`: compatibility route for manual smoke tests.
- `manual-smoke/README.md`: adapter, Plan Mode, initializer, publishing, and README landing smoke checks.

## Verification Command Cheat Sheet

Use source-checkout commands in this repository. Installed `dotdotgod` or `npx @dotdotgod/cli` commands are for consumer projects.

| Need | Command family | Side effect boundary |
| --- | --- | --- |
| Docs/project-memory correctness | `node packages/cli/bin/dotdotgod.mjs validate . ...` | Checks docs, config, traceability, and optional index freshness. |
| Generated traceability drift | `node packages/cli/bin/dotdotgod.mjs traceability links . --check --json` | Focused check; use `--write` only to repair generated links and compact JSON. |
| Documentation navigation | `map` | Read-only configured Markdown discovery and tree rendering; does not build or refresh indexes. |
| Search/graph cache smoke | `query`, `graph impact`, `graph communities`, `status` | Query/graph commands may refresh ignored `.dotdotgod/` caches; `status` does not rebuild. |
| Release-style workspace gate | `pnpm run verify` | Runs package checks, tests, typecheck, generated-resource checks, and docs validation. |

Everyday docs and project-memory checks:

```bash
node packages/cli/bin/dotdotgod.mjs traceability links . --check --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

Release-style workspace checks:

```bash
pnpm run generate
pnpm run verify:generated
pnpm run verify:types
pnpm run verify:unit
pnpm run verify:contract
pnpm --filter @dotdotgod/cli test
pnpm run verify
pnpm run pack:dry-run
```

Focused graph/cache smoke commands:

```bash
node packages/cli/bin/dotdotgod.mjs --help
node packages/cli/bin/dotdotgod.mjs --version
node packages/cli/bin/dotdotgod.mjs init . --dry-run --project-name fixture-name
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs map . --depth 3 --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml
node scripts/evaluate-graph-impact.mjs . --json
node packages/cli/bin/dotdotgod.mjs graph communities . --json
node packages/cli/bin/dotdotgod.mjs query . "project documentation" --limit 5 --json
node packages/cli/bin/dotdotgod.mjs status . --json
```

Confirm JSON includes schema/refresh metadata, graph counts, bounded summaries, retrieval hints, archive policy, and traceability-related specs/tests/docs for graph impact.

## Workspace Coverage

- `@dotdotgod/shared`: private source resources for generated adapter commands, skills, and initializer files.
- `@dotdotgod/pi`: generated initializer skill, extension syntax smoke checks, TypeScript typecheck, unit tests for pure plan/load helpers, and Pi package tarball dry-run.
- `@dotdotgod/cli`: CLI syntax check, unit/e2e tests, repository validation, local multilingual query/vector-cache coverage, sharded graph-cache status checks, stale-index reindex coverage, and Leiden/fallback community output coverage.
- `@dotdotgod/claude-code`: generated plugin commands/skills, plugin manifest/resource checks, and tarball dry-run.
- `@dotdotgod/codex`: generated plugin skills, plugin manifest/skill checks, and tarball dry-run.

## Manual Smoke Tests

See `manual-smoke/README.md` for adapter, Plan Mode, initializer, publishing, and README landing smoke checks. The legacy `MANUAL_SMOKE.md` file routes to that domain.

Focused smoke docs:

- `MEMORY_AREA_CONFIG.md`
- `TRACEABILITY_CONFIG.md`
- `VALIDATION_CONFIG.md`
- `HOOKS.md`
- `CONTEXT_MEASUREMENT.md`

## Husky Pre-Push Hook

Pre-push hook:

```bash
pnpm run verify && pnpm run verify:cache && pnpm run pack:dry-run:packages
```

`verify:cache` runs docs validation, `dotdotgod index`, and `dotdotgod status`, so pre-push refreshes the ignored `.dotdotgod/` cache automatically before checking freshness.
