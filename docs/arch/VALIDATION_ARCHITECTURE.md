# Validation Architecture

## Purpose

This document defines the validation strategy for the dotdotgod workspace.

## Packages

### `@dotdotgod/cli`

The dotdotgod CLI owns docs scaffold validation, project memory snapshots, graph indexing, graph queries, and Leiden-style community detection.

CLI binary:

```bash
dotdotgod validate <root>
```

Local workspace command:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

The previous standalone `@dotdotgod/docs-validator` package was replaced by this unified CLI package.

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
- Cache manifests include a schema version; incompatible schemas are reported as `schema-mismatch` and rebuilt by `index` or lazy-refreshing read commands.
- The index records whether archive bodies were included; default indexes exclude archive bodies.
- `dotdotgod status <root>` reports `missing`, `fresh`, or `stale` from file fingerprints and schema state without rebuilding the graph.
- `dotdotgod index <root>` incrementally rebuilds changed file graph shards when a compatible manifest already exists.
- Agent-facing read commands such as `dotdotgod load-snapshot` and `dotdotgod graph ...` lazily refresh missing or stale caches before returning output.
- Lazy refresh output includes `metadata.cacheRefreshed`, refresh reason, elapsed timing, rebuild mode, changed-file count, and cache size details so callers can tell when and why a read command updated `.dotdotgod/`.
- Completion hooks that refresh the index are optional; the default workflow relies on lazy refresh instead of mutating the cache after every task.
- `pnpm run verify:cache` validates docs, runs `dotdotgod index`, and then checks `dotdotgod status`, so local verification and Husky pre-push refresh stale cache automatically before asserting freshness.
- The Husky pre-push hook runs `verify:cache`, so it may update the ignored `.dotdotgod/` cache as a local side effect while keeping tracked source/docs changes explicit.

The index records file fingerprints, cache metadata, schema metadata, and a deterministic graph. File discovery is gitignore-aware by default through `git ls-files --cached --others --exclude-standard`, with a conservative directory-walk fallback for non-git contexts. The file filter includes common plain-text docs, source, script, config, web, and infrastructure formats instead of assuming a pnpm monorepo shape. Current graph extraction covers Markdown headings/links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, and metric-event string literals. Other supported text files are currently represented as file metadata until dedicated extractors are added.

Graph file nodes include deterministic memory-area metadata for dotdotgod structures. `AGENTS.md`, docs indexes, specs, architecture docs, test docs, active plans, and `docs/archive/README.md` receive `memoryArea`, `memoryRole`, `retrievalPriority`, and `retrieval.signals` fields. The graph also adds compact `memory_area:*` nodes with `belongs_to_area` edges. Links from `README.md` files keep their normal `links_to` edge and also receive a `routes_to` edge with `CURATED_INDEX` confidence, making README indexes first-class routing hints without requiring semantic embedding. Graph query output carries retrieval metadata and reason-derived signals for related nodes; load snapshots expose a bounded `memoryAreas` summary.

Graph storage uses a compact tuple schema in shards so multi-year projects do not depend on one large JSON file. Community summaries use `leiden-ts` over a weighted durable-node projection with deterministic domain grouping as a fallback. Load snapshots expose bounded quality metadata, including snapshot size estimates, omitted community counts, omitted item counts, bounded memory-area summaries, and archive inclusion policy.

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
