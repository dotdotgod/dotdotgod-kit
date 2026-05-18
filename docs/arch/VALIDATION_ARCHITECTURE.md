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

- Markdown files matched by the resolved traceability policy include valid fenced `json dotdotgod` traceability blocks as the final section. The default policy matches `docs/spec/**` and excludes README files.
- Optional `--check-index` validation compares current markdown fingerprints with `.dotdotgod/manifest.json` so stale graph indexes are visible without running `status` separately.
- `docs/` directory names are kebab-case.
- Markdown files under `docs/` are UPPER_SNAKE_CASE or `README.md`.
- Markdown files stay within configurable line and character budgets unless they match an explicit markdown size-check exclusion.
- Directories with multiple markdown files include `README.md`.
- Local markdown links point to existing files.
- Local markdown anchors point to existing headings.
- Optional `dotdotgod.config.json` or `.dotdotgodrc.json` memory-area, traceability, validation, and impact-ranking config uses valid array-based path fields, shared/local and fresh/stale area fields, supported validation budgets, and supported traceability/include/exclude/ranking settings.
- `docs/plan`, `docs/archive/plan`, and `docs/archive/report` use expected task/report shapes.
- `.gitignore` contains `docs/plan`, `docs/archive`, and `.dotdotgod`.

The validator does not own general markdown style formatting. Use tools such as Prettier or markdownlint separately if a project wants style linting.

Traceability validation is CLI-owned because project docs are user-editable. Errors include block-shape and property guidance. Projects may configure enforced path arrays, but valid traceability blocks share one schema.

Markdown size validation uses `validation.markdown.maxLines`, `validation.markdown.maxChars`, and `validation.markdown.exclude` from project config. CLI `--max-lines` and `--max-chars` override configured numeric budgets for one validation run. Size exclusions skip only `FILE_TOO_LONG` and `FILE_TOO_LARGE`; all other validation rules still apply.

## Cache and Stale-Index Policy

The CLI uses `.dotdotgod/` at the project root as the default local cache directory.

- `.dotdotgod/` is ignored by git.
- The cache manifest is `.dotdotgod/manifest.json`.
- Compact graph shards live under `.dotdotgod/graph/nodes/` and `.dotdotgod/graph/edges/`.
- Cache entries use content hashes to detect stale files.
- Cache manifests include a schema version; incompatible schemas are reported as `schema-mismatch` and rebuilt by `index` or lazy-refreshing read commands.
- The index records whether archive bodies were included; default indexes exclude archive bodies.
- `dotdotgod status <root>` reports `missing`, `fresh`, or `stale` from file fingerprints and schema state without rebuilding the graph.
- `dotdotgod index <root>` incrementally rebuilds changed file graph shards when a compatible manifest already exists.
- Agent-facing read commands such as `dotdotgod load-snapshot` and `dotdotgod graph ...` lazily refresh missing or stale caches before returning output.
- `dotdotgod validate --check-index` does not refresh the cache; it reports missing, schema-mismatched, missing-file, or stale markdown fingerprints so agents can run `dotdotgod index` or a lazy-refreshing read command intentionally.
- Lazy refresh output includes `metadata.cacheRefreshed`, refresh reason, elapsed timing, rebuild mode, changed-file count, and cache size details so callers can tell when and why a read command updated `.dotdotgod/`.
- Completion hooks that refresh the index are optional; the default workflow relies on lazy refresh and avoids mutating the cache after every task.
- Claude Code and Codex hook examples should prefer `dotdotgod status` for read-only stop-time cache reporting and `dotdotgod validate` for explicit docs validation. Hook examples that call `load-snapshot`, `graph`, `index`, or `verify:cache` must describe the cache-refresh side effect or keep those commands opt-in.
- `pnpm run verify:cache` validates docs, runs `dotdotgod index`, and then checks `dotdotgod status`, so local verification and Husky pre-push refresh stale cache automatically before asserting freshness.
- The Husky pre-push hook runs `verify:cache`, so it may update the ignored `.dotdotgod/` cache as a local side effect while keeping tracked source/docs changes explicit.

The index records fingerprints, cache/schema metadata, and a deterministic graph. Discovery is gitignore-aware through `git ls-files --cached --others --exclude-standard`, with a conservative directory-walk fallback. Supported files include common docs, source, script, config, web, and infrastructure formats.

Current extraction covers Markdown headings/links, `json dotdotgod` traceability blocks, package metadata/resources, TypeScript/JavaScript imports and declarations, Pi command registrations, inferred tests, and metric-event strings. Other supported text files become metadata-only file nodes until dedicated extractors exist.

Graph file nodes include deterministic memory-area metadata for dotdotgod structures. Optional memory-area config can override or extend classification while zero-config behavior stays compatible. `dotdotgod config` exposes the resolved root-scoped policy, and `dotdotgod config init` materializes the built-in defaults without adding global or cascading config lookup. README links also get `routes_to` edges with `CURATED_INDEX` confidence, making README indexes routing hints without semantic embeddings.

Graph storage uses compact shards. Community summaries use `leiden-ts` over a weighted durable-node projection, with deterministic domain grouping as fallback. Impact reports use configurable ranking with curated traceability, memory policy, deterministic semantic edges, score breakdowns, and changed-file PPR. Load snapshots expose bounded quality, community, memory-area, archive-policy, and command-guidance summaries.

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
