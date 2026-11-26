# Workspace Verification

## Purpose

Workspace verification keeps dotdotgod changes safe before commits, package dry-runs, and publishes.

`dotdotgod validate` checks docs and project memory. Workspace `verify` is the broader repository gate: it combines generated-resource checks, package verify contract checks, package-level verification scripts and docs validation. Index refresh/freshness and package dry-runs are separate gates.

## Required Workflows

- `pnpm run verify` runs generated-resource drift checks, package verify contract checks, and each package's `verify` script, including the context runtime's syntax, core, hook, and stdio MCP protocol tests. The CLI package runs Node tests serially, then Hermes Python unittest discovery and source-checkout docs validation. `DOTDOTGOD_REQUIRE_AGY=1 pnpm run verify` requires the real Antigravity strict-validation test instead of skipping it when `agy` is absent.
- `pnpm run verify:cache` runs docs validation, refreshes the local `.dotdotgod/` index, and checks cache freshness.
- `.husky/pre-push` runs workspace verification (including docs validation) once, then refreshes the index, checks cache freshness, and runs package dry-runs. It avoids the duplicate docs validation in standalone `verify:cache`, whose guarantees remain unchanged.
- `publish:all` publishes only `@dotdotgod/cli`, then dependent `@dotdotgod/pi`. Obsidian is private and uses the community build/release workflow. Release actions require separate approval; the unified topology targets 0.12.0, not a published release.
- `scripts/check-package-verify-contract.mjs` fails packages that define quality scripts but omit them from package-level `verify`.

## Graph Retrieval Expectations

`package.json` changes should route agents to workspace verification docs, package verify contract code, and pre-push behavior before editing scripts or package metadata.

`graph impact` should therefore surface this spec, the root package workflow, the package verify contract script, `.husky/pre-push`, and the test/architecture docs that define verification expectations.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [package.json](../../package.json)
  - [.husky/pre-push](../../.husky/pre-push)
  - [scripts/check-package-verify-contract.mjs](../../scripts/check-package-verify-contract.mjs)
- Verified by:
  - [docs/test/README.md](../test/README.md)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [packages/cli/test/pre-push.test.mjs](../../packages/cli/test/pre-push.test.mjs)
- Related docs:
  - [docs/test/IMPACT_RANKING_CONFIG.md](../test/IMPACT_RANKING_CONFIG.md)
  - [docs/test/README.md](../test/README.md)
- Design decisions:
  - [docs/arch/CODE_CONVENTIONS.md](../arch/CODE_CONVENTIONS.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["package.json",".husky/pre-push","scripts/check-package-verify-contract.mjs"],"verifiedBy":["docs/test/README.md","packages/cli/test/e2e.test.mjs","packages/cli/test/pre-push.test.mjs"],"relatedDocs":["docs/test/IMPACT_RANKING_CONFIG.md","docs/test/README.md"],"designDecisions":["docs/arch/CODE_CONVENTIONS.md"]}
```
