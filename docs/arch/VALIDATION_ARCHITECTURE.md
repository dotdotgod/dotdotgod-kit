# Validation Architecture

## Purpose

This document defines the validation strategy for the dotdotgod workspace.

## Packages

### `@dotdotgod/cli`

The dotdotgod CLI owns docs scaffold validation and is the planned home for project memory snapshots, graph indexing, graph queries, and Leiden-style community detection.

CLI binary:

```bash
dotdotgod validate <root>
```

Local workspace command:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

The previous standalone `@dotdotgod/docs-validator` package is being removed in favor of this unified CLI package.

## Rule Boundaries

The validator owns dotdotgod-specific structure checks:

- `docs/` directory names are kebab-case.
- Markdown files under `docs/` are UPPER_SNAKE_CASE or `README.md`.
- Markdown files stay within configurable line and character budgets.
- Directories with multiple markdown files include `README.md`.
- Local markdown links point to existing files.
- Local markdown anchors point to existing headings.
- `docs/plan`, `docs/archive/plan`, and `docs/archive/report` use expected task/report shapes.
- `.gitignore` contains `docs/plan`, `docs/archive`, and `.dotdotgod`.

The validator does not own general markdown style formatting. Use tools such as Prettier or markdownlint separately if a project wants style linting.

## Cache and Stale-Index Policy

The CLI uses `.dotdotgod/` at the project root as the default local cache directory.

- `.dotdotgod/` is ignored by git.
- The cache manifest is `.dotdotgod/manifest.json`.
- Compact graph shards live under `.dotdotgod/graph/nodes/` and `.dotdotgod/graph/edges/`.
- Cache entries use content hashes, not only modified times, to detect stale files.
- The index records whether archive bodies were included; default indexes exclude archive bodies.
- `dotdotgod status <root>` reports `missing`, `fresh`, or `stale` from file fingerprints without rebuilding the graph.
- `dotdotgod index <root>` incrementally rebuilds changed file graph shards when a compatible manifest already exists.
- Agent-facing read commands such as `dotdotgod load-snapshot` and `dotdotgod graph ...` lazily refresh missing or stale caches before returning output.
- Lazy refresh output includes `metadata.cacheRefreshed` and refresh details so callers can tell when a read command updated `.dotdotgod/`.
- Completion hooks that refresh the index are optional; the default workflow relies on lazy refresh instead of mutating the cache after every task.
- The Husky pre-push hook validates docs and checks `dotdotgod status` instead of running `dotdotgod index`, so the hook detects stale caches without hidden cache mutation.

The index records file fingerprints, cache metadata, and a deterministic graph. Current graph extraction covers Markdown headings/links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, and metric-event string literals. Graph storage uses a compact tuple schema in shards so multi-year projects do not depend on one large JSON file. Community summaries use `leiden-ts` over a weighted durable-node projection with deterministic domain grouping as a fallback.

## Dependency Policy

Validation remains dependency-free and uses Node built-ins.

Future dependencies are allowed only when the extra correctness outweighs package complexity:

- Tree-sitter parser packages for deterministic AST extraction.
- `leiden-ts`: pure TypeScript Leiden community detection for bounded graph community summaries.
- `github-slugger`: if heading anchor compatibility needs to match GitHub more exactly.
- `remark-parse`: if markdown link parsing requires AST-level accuracy.
- `markdownlint-cli`: as a companion tool, not a core dependency.
- `lychee`: as an optional external link checker, not a bundled binary.

Embedding/vector search dependencies are out of scope for the first CLI milestone.

## TypeScript and Unit Tests

Workspace packages can add TypeScript typecheck and unit test scripts when they contain testable source.

The CLI uses Node's built-in test runner:

- `pnpm --filter @dotdotgod/cli test`: unit tests for pure validation/index/graph helpers plus e2e tests that execute `bin/dotdotgod.mjs` against temporary fixture projects.
- `pnpm --filter @dotdotgod/cli run verify`: syntax checks, CLI tests, docs validation, index generation, and status smoke checks.

CLI unit tests import `packages/cli/src/core.mjs`; e2e tests shell out to the published binary entrypoint. Fixtures live in temporary directories so stale-index and validation-failure cases can mutate files safely.

The Pi adapter currently owns TypeScript quality gates:

- `pnpm --filter @dotdotgod/pi run typecheck`: TypeScript `noEmit` checking for extension source and tests.
- `pnpm --filter @dotdotgod/pi run test`: Node built-in test runner coverage for pure plan-mode and load-project helpers.
- `pnpm --filter @dotdotgod/pi run verify`: syntax checks, typecheck, and unit tests together.

Root commands aggregate package-provided checks:

```bash
pnpm run verify:types
pnpm run verify:unit
```

Unit tests should prefer extracted pure helpers over importing full Pi extension entrypoints, because extension entrypoints depend on Pi runtime peer packages and session/UI wiring.

## Workspace Verification

Root verification should run generated-resource drift checks, package typechecks/tests, workspace package checks, and package dry-runs:

```bash
pnpm run verify
pnpm run pack:dry-run
```

Docs validation should include ignored local memory during local development:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

CI may omit local memory if `docs/plan` and `docs/archive` are not tracked.
