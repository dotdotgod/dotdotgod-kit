# Validation Verification

## Dependency Policy

Validation remains dependency-free and uses Node built-ins.

Future dependencies are allowed only when extra correctness outweighs package complexity:

- `leiden-ts`: pure TypeScript Leiden community detection for bounded graph community summaries.
- `github-slugger`: if heading anchor compatibility must match GitHub more exactly.
- `remark-parse`: if markdown link parsing requires parser-level accuracy.
- `markdownlint-cli`: as a companion tool, not a core dependency.
- `lychee`: as an optional external link checker, not a bundled binary.

Embedding/vector search dependencies are out of scope for the first CLI milestone.

## TypeScript and Unit Tests

Workspace packages can add TypeScript typecheck and unit test scripts when they contain testable source.

The CLI uses Node's built-in test runner:

```bash
pnpm --filter @dotdotgod/cli test
pnpm --filter @dotdotgod/cli run verify
```

CLI unit tests import `packages/cli/src/core.mjs`; e2e tests shell out to the published binary entrypoint. Fixtures live in temporary directories so stale-index and validation-failure cases can mutate files safely.

The Pi adapter owns TypeScript quality gates:

```bash
pnpm --filter @dotdotgod/pi run typecheck
pnpm --filter @dotdotgod/pi run test
pnpm --filter @dotdotgod/pi run verify
```

Unit tests should prefer extracted pure helpers over full Pi extension entrypoints because entrypoints depend on Pi runtime peer packages and session/UI wiring.

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
