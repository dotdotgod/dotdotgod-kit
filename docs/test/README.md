# Tests

Use this area for test strategy, coverage notes, regression cases, and manual verification records.

## Index

- `ANTIGRAVITY_ADAPTER.md`: Antigravity plugin manifest/resource checks, advisory hooks (`AG-01`..`AG-03`), `AP-01`/`AP-02` packaging, `agy plugin validate --strict`, and live CLI/App smoke scenarios.
- `SKILL_INSTALLATION.md`: standalone Skills CLI asset checks and native discovery smoke matrix.
- `PI_CONTEXT_ROOT.md`: parent environment isolation and host impact session regressions.
- `OBSIDIAN_DEBUG.md`: isolated real-app debugging commands and graph acceptance checks.
- `NATIVE_PLAN_STORAGE.md`: Claude Code/Codex opt-in native plan settings, Antigravity Option C-2 artifact observation, and host verification.
- `OPENCODE_ADAPTER.md`: OpenCode native plan, registry, packaged MCP, and advisory impact checks.
- `REFERENCE_SCOPE_VALIDATION.md`: reference extraction, scope combinations, layout examples, and traceability isolation regressions.
- `README.md`: test documentation scope, verification command cheat sheet, and local table of contents.
- `MEMORY_AREA_CONFIG.md`: memory-area config validation and graph/Load-query policy smoke checks.
- `TRACEABILITY_CONFIG.md`: configurable traceability enforcement validation smoke checks.
- `VALIDATION_CONFIG.md`: markdown validation budget and size-check exclusion coverage.
- `CONTEXT_MEASUREMENT.md`: context measurement commands and runtime context debug smoke checks.
- `HERMES_ADAPTER.md`: native registration, concurrent MCP routing, Path 1 non-blocking advisory impact (`HM-01`..`HM-03a`), packed pinned-host smoke, and external messaging acceptance.
- `CONTEXT_EXECUTION.md`: automated and manual coverage for local execution, FTS5 retrieval, `impact.sqlite` v3, MCP `roots/list` and `sessionBound`, advisory hooks, and adapter packaging.
- `COMMAND_GUIDANCE.md`: environment-aware query and project command guidance checks.
- `IMPACT_RANKING_CONFIG.md`: fixed graph-impact scoring, non-blocking compatibility config, request-local vector overlay, compact output, and selection-noise checks.
- `IMPACT_GRAPH_EXPLORER.md`: standalone traceability graph API, shared filtering, browser interactions, and workspace verification.
- `GRAPH_IMPACT_QUALITY.md`: graph impact quality scoring script, metrics, and baseline comparison checks.
- `CONFIG_COMMAND.md`: project-level config show/init command checks.
- `CONFIG_TEMPLATES.md`: initialization template selection, isolation, shadowing, packaging, and fallback checks.
- `EMBEDDING_CONFIG.md`: provider precedence, transport, credentials, dynamic dimensions, and cache invalidation checks.
- `HOOKS.md`: non-blocking advisory hook tests (`HK-01`..`HK-05`, `AG-01`..`AG-03`), `impact.sqlite` v2, legacy `runtime/*.json` ignore, and smoke checks.
- `CLI_INTERFACE.md`: baseline CLI help/version and invalid invocation checks.
- `CLI_MAP.md`: shared documentation-map command, depth, filtering, JSON, errors, side effects, and adapter parity checks.
- `CODE_OUTLINE_QUERY.md`: multilingual extraction, hybrid retrieval, outline freshness, and installed-parser smoke checks.
- `REFERENCE_EXPANSION.md`: reference resolution and prompt-time expansion regression and smoke checks.
- `MANUAL_SMOKE.md`: compatibility route for manual smoke tests.
- `manual-smoke/README.md`: adapter, Plan Mode, initializer, publishing, and README landing smoke checks.

## Planning And Clarification Regressions

- `packages/cli/test/skill-guidance.test.mjs`: generated initializer paths, host impact acknowledgment guidance, map-unavailable recovery, and standalone task/report scope separation across adapters.
- `packages/cli/test/embedding-opt-in.test.mjs`: unconfigured keyword/structural retrieval, vector-request errors, and explicit keyword override without embeddings.
- `packages/pi/test/planning-context.test.ts`: bounded impact/reference refresh, no automatic validation or Plan Mode compaction, one-shot delivery, and CLI failure/execution-mode handling.
- `packages/cli/test/pre-push.test.mjs`: composed gate order and failure exits, single documentation-validation path, and standalone cache-gate guarantees.
- `packages/cli/test/document-clarify.test.mjs`: standalone guidance, absence from built-in host skills, and removal of verified obsolete spec history while protecting current requirements and historical archive meaning.

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
DOTDOTGOD_REQUIRE_AGY=1 pnpm --filter @dotdotgod/cli run verify
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

## Plan Decision Wizard Coverage

`packages/pi/test/decision-wizard.test.ts` verifies drafts, explicit choice/custom text, batch confirmation, terminal bounds, fallback, and failure safety. `packages/pi/test/decision-wizard-extension.test.ts` exercises actual extension handlers through Pi's loader for one batch delivery, reopened questions, separate execution approval, and shutdown/branch invalidation. `packages/pi/test/plan-mode-utils.test.ts` covers legacy Discussion Queue status compatibility; `manual-smoke/PI_ADAPTER.md` covers live IME/paste, resize, lifecycle changes, and separate execution approval.

## Workspace Coverage

- `@dotdotgod/cli`: Node/CLI, graph and docs validation, shared context/hooks/MCP, installer lifecycle, strict Antigravity fixture validation, native host artifacts, Hermes Python regressions, and two-package tarball contract.
- `@dotdotgod/pi`: initializer resources, extension syntax, typecheck, public SDK/unit tests, and tarball dry-run.
- `@dotdotgod/obsidian` (private): development helper syntax, plugin build, and plugin regression suite. Root `npm run build` creates the Obsidian community build files.

## Manual Smoke Tests

See `manual-smoke/README.md` for adapter, Plan Mode, initializer, publishing, and README landing smoke checks. The legacy `MANUAL_SMOKE.md` file routes to that domain. Focused smoke docs: `MEMORY_AREA_CONFIG.md`, `TRACEABILITY_CONFIG.md`, `VALIDATION_CONFIG.md`, `HOOKS.md`, `ANTIGRAVITY_ADAPTER.md`, `HERMES_ADAPTER.md`, and `CONTEXT_MEASUREMENT.md`.

## Husky Pre-Push Hook

```bash
pnpm run verify && pnpm run verify:cache && pnpm run pack:dry-run:packages
```

`verify:cache` runs docs validation, `dotdotgod index`, and `dotdotgod status`, refreshing the ignored `.dotdotgod/` cache automatically before checking freshness.
