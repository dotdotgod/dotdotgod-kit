# Impact Ranking Config Verification

## Scope

Verify configurable `graph impact` ranking, score breakdown output, deterministic semantic edges, changed-file Personalized PageRank (PPR), archive safeguards, and runtime fallback on invalid config.

## Automated Unit Coverage

| Area | Expected coverage |
| --- | --- |
| Config defaults | `readMemoryConfig()` exposes default `impactRanking` with `balanced` preset. |
| Presets | `docs-first`, `code-proximity`, `test-focused`, and `archive-aware` resolve distinguishing weights. |
| Partial overrides | Custom weights, relation weights, boost maps, PPR, and semantic settings merge without deleting defaults. |
| Invalid config | Validation reports preset, weight, relation-weight, boost-map, PPR, and semantic error families. |
| Runtime fallback | Invalid impact-ranking config falls back to balanced defaults for runtime graph commands. |
| Semantic edges | Path/name links create `semantic_similarity`; heading/export links create `mentions_symbol`; command links create `mentions_command`; package metadata links create `mentions_package`. |
| Semantic metadata | Generated semantic edges include lexical confidence, numeric score, matched terms, and signal names. |
| Semantic controls | Thresholds suppress weak links, `topKPerFile` caps outgoing semantic links, and archive-body links are excluded unless opted in. |
| Score breakdown | Seed, traceability, verification, proximity, semantic, memory priority/freshness, archive penalty, and `0..100` score cap are asserted separately. |
| PPR | Stronger weighted paths get higher PPR contribution; disabled PPR reports `policy-score`; relation-weight overrides affect PPR contribution predictably. |
| Compatibility | Grouped impact buckets, `omittedRelated`, and deprecated `graph query` additive fields remain present. |
| Compact output | `graph impact --compact --json` returns compact grouped items, no raw ranking weights, and a smaller payload than raw JSON. |
| Selection noise control | First-page results cap low-actionability metadata nodes and prefer curated/test/proximity candidates over pure semantic-only matches. |
| Quality tooling | `scripts/evaluate-graph-impact.mjs` reports P@5, P@10, must Recall@10, MRR, nDCG@10, runtime context, and lexical/snapshot baselines. |

## Automated E2E Coverage

| Scenario | Expected coverage |
| --- | --- |
| Balanced default | `graph impact --json` reports `personalized-pagerank+policy`; changed file is rank 1 with seed score; traceability spec outranks semantic-only docs; all related items have `impactScore` and `scoreBreakdown`. |
| Preset overrides | `docs-first` raises traceability scoring; `code-proximity` raises code-neighbor rank; `test-focused` raises verification scoring. |
| Archive-aware | With archive bodies explicitly indexed and semantic archive links opted in, archive penalty is less severe than balanced but fresh curated specs still outrank archive bodies. |
| Invalid config fallback | `validate --json` reports impact config errors while `graph impact --json` exits successfully with balanced fallback scoring. |
| Semantic threshold/disable | Semantic-only docs appear with semantic reasons by default and disappear or lose semantic reasons when semantic matching is disabled. |
| Archive safety | Default impact results exclude archive body files; opt-in archive fixtures carry stale/archive penalties. |
| Measurement smoke | `measure-context` graph impact row includes ranking method, scored count, semantic count, related count, omitted count, and approximate token size. |

## Assertion Guidelines

- Prefer rank order, reason presence, and score-category presence over exact PPR totals.
- Use exact numeric assertions only for deterministic invariants: seed score, disabled-PPR `0`, configured weight values, and final `0..100` cap.
- Use specific fixture terms such as `route-planner`, `policy-auditor`, and `routing-policy`; avoid generic-only matches such as `config`, `index`, `docs`, or `test`.
- Assert negative cases explicitly: no archive bodies by default, no semantic reasons when semantic matching is disabled, and invalid config does not crash runtime commands.

## Smoke Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --compact --json
node packages/cli/bin/dotdotgod.mjs graph query . --changed packages/cli/src/core.mjs --compact --json
node scripts/measure-context.mjs --markdown --impact-changed packages/cli/src/core.mjs
node scripts/evaluate-graph-impact.mjs . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Expected JSON Checks

For `graph impact --json`, confirm:

- `impact.ranking.method` and `impact.ranking.weights` are present.
- Top-level `related` mirrors `impact.related`.
- Related items include numeric `impactScore` and structured `scoreBreakdown`.
- The changed file is first with `impactScore: 100` and `scoreBreakdown.seed: 100`.
- Curated traceability reasons outrank comparable semantic-only hints.
- Compact JSON omits raw `ranking.weights` and keeps `related.length <= 10` by default.
- Low-actionability import/package/dependency metadata does not dominate the first page when actionable files/docs/tests exist.
- Semantic reasons appear only when deterministic lexical matches pass the configured controls.
- Archive body items are absent by default and carry stale/archive penalties when explicitly indexed.

## Context Measurement

`measure-context` should include a `Graph impact sample` row that reports ranking method, scored item count, semantic item count, related count, omitted count, and approximate token size.
