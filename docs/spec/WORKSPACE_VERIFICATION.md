# Workspace Verification

## Purpose

Workspace verification keeps dotdotgod changes safe before commits, package dry-runs, and publishes.

It combines generated-resource checks, package verify contract checks, package-level verification scripts, docs validation, graph cache freshness, and package dry-runs.

## Required Workflows

- `pnpm run verify` runs generated-resource drift checks, package verify contract checks, and each package's `verify` script.
- `pnpm run verify:cache` runs docs validation, refreshes the local `.dotdotgod/` index, and checks cache freshness.
- `.husky/pre-push` runs the workspace gate, cache gate, and package dry-runs before pushes.
- `scripts/check-package-verify-contract.mjs` fails packages that define quality scripts but omit them from package-level `verify`.

## Graph Retrieval Expectations

`package.json` changes should route agents to workspace verification docs, package verify contract code, and pre-push behavior before editing scripts or package metadata.

`graph impact` should therefore surface this spec, the root package workflow, the package verify contract script, `.husky/pre-push`, and the test/architecture docs that define verification expectations.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "package.json",
    ".husky/pre-push",
    "scripts/check-package-verify-contract.mjs"
  ],
  "verifiedBy": [
    "docs/test/README.md",
    "packages/cli/test/e2e.test.mjs"
  ],
  "relatedDocs": [
    "docs/arch/CODE_CONVENTIONS.md",
    "docs/test/IMPACT_RANKING_CONFIG.md",
    "docs/test/README.md"
  ],
  "verificationCommands": [
    "pnpm run verify",
    "pnpm run verify:cache",
    "pnpm run pack:dry-run:packages"
  ]
}
```
