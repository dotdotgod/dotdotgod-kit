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
- The first cache artifact is `.dotdotgod/index.json`.
- Cache entries use content hashes, not only modified times, to detect stale files.
- The index records whether archive bodies were included; default indexes exclude archive bodies.
- `dotdotgod status <root>` reports `missing`, `fresh`, or `stale`.
- `dotdotgod index <root>` rewrites the index from the current curated scope.

The initial index is intentionally conservative: it records file fingerprints and cache metadata before AST graph edges and Leiden communities are added.

## Dependency Policy

Validation remains dependency-free and uses Node built-ins.

Future dependencies are allowed only when the extra correctness outweighs package complexity:

- Tree-sitter parser packages for deterministic AST extraction.
- A Leiden/community detection package or a small local implementation if dependency quality is poor.
- `github-slugger`: if heading anchor compatibility needs to match GitHub more exactly.
- `remark-parse`: if markdown link parsing requires AST-level accuracy.
- `markdownlint-cli`: as a companion tool, not a core dependency.
- `lychee`: as an optional external link checker, not a bundled binary.

Embedding/vector search dependencies are out of scope for the first CLI milestone.

## TypeScript and Unit Tests

Workspace packages can add TypeScript typecheck and unit test scripts when they contain testable source.

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
