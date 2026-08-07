# Impact Ranking Config

## Purpose

`graph impact` ranks changed-file review candidates with one explainable weighted-graph score plus memory-area policy. Scoring is intentionally fixed rather than a public tuning surface.

## Fixed Policy

```text
impactScore = clamp(connection + memory, 0, 100)
connection = clamp(pprProbability / 0.4 × 80, 0, 80)
priority = memoryArea.priority / 100 × 15
policyAdjustments = fresh ? 5 : stale ? -5 : 0
policyAdjustments += includeBodiesByDefault === false ? -5 : 0
memory = clamp(priority + policyAdjustments, 0, 20)
```

For an archive-seeded request, stale `-5` remains but the `includeBodiesByDefault: false` adjustment is skipped. Changed seeds always score `100`.

PPR uses damping `0.85`, at most 20 iterations, tolerance `0.000001`, and fixed reference `0.4`. The reference is independent of the returned candidate set, so unrelated candidate additions do not rescale existing scores.

Traceability relation weights come only from `traceability.keys[]`; maintained non-traceability relations use built-in weights. Weight `0` disables traversal for that relation.

## Removed Ranking Tuning

The following `impactRanking` fields are retired and validation errors:

- `preset`
- `weights`
- `ppr`
- `relationWeights`

The four legacy boost maps are inert: `traceabilityBoosts`, `verificationBoosts`, `proximityBoosts`, and `semanticBoosts` are not read, validated, warned about, summarized, serialized, or scored.

`impactRanking.semantic` remains the existing deterministic semantic-candidate configuration until the separate vector semantic migration. It does not restore semantic score bonuses.

## Ranking And Selection

Relation weights affect candidates only through PPR. There are no separate direct, curated, verification/test, proximity, semantic-only, or node-type score or ordering bonuses. Direct reasons remain explanatory evidence. Low-actionability and semantic-only counts remain bounded output-quality metadata, not hidden score additions.

The score breakdown is:

```json
{
  "connection": { "ppr": 24.7, "probability": 0.123456, "reference": 0.4 },
  "memory": { "priority": 12, "policyAdjustments": 5 },
  "strongestDirectRelation": "implemented_by"
}
```

`strongestDirectRelation` is optional and contributes no points. Ranking diagnostics report method `weighted-personalized-pagerank+memory`, connection cap `80`, memory cap `20`, and PPR reference `0.4`.

## Calibration And Migration

The quality evaluator reports Precision@5/10, Recall@10, MRR, nDCG@10, semantic-only/curated counts, saturation, raw synthetic PPR, candidate independence, and multi-seed order invariance.

Legacy metric regression is accepted because all direct and type-specific bonuses were intentionally removed. Blocking invariants are:

- unrelated disconnected candidates do not rescale scores
- multi-seed order does not change probabilities
- curated, deterministic, one-hop, multi-hop, and unrelated fixture scores remain separated
- saturation and the selected reference remain visible for later versioned calibration

## Output Compatibility

JSON keeps top-level and nested `related`, grouped output, `impactScore`, and `scoreBreakdown`. YML and compact output keep bounded scores/reasons while diagnostics expose the fixed reference. Multi-seed input remains equal-weight, ordered, deduplicated, and bounded to five non-seed `perSeed` results.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/impact/scoring.mjs](../../packages/cli/src/impact/scoring.mjs)
  - [packages/cli/src/impact/report.mjs](../../packages/cli/src/impact/report.mjs)
  - [packages/cli/src/impact/format.mjs](../../packages/cli/src/impact/format.mjs)
  - [scripts/evaluate-graph-impact.mjs](../../scripts/evaluate-graph-impact.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/IMPACT_RANKING_CONFIG.md](../test/IMPACT_RANKING_CONFIG.md)
- Related docs:
  - [docs/arch/IMPACT_RANKING_CONFIG.md](../arch/IMPACT_RANKING_CONFIG.md)
  - [docs/arch/VALIDATION_ARCHITECTURE.md](../arch/VALIDATION_ARCHITECTURE.md)
  - [docs/spec/MEMORY_AREA_CONFIG.md](MEMORY_AREA_CONFIG.md)
  - [docs/spec/TRACEABILITY_CONFIG.md](TRACEABILITY_CONFIG.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml`
  - `node scripts/evaluate-graph-impact.mjs . --json`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/memory/config.mjs","packages/cli/src/impact/scoring.mjs","packages/cli/src/impact/report.mjs","packages/cli/src/impact/format.mjs","scripts/evaluate-graph-impact.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/IMPACT_RANKING_CONFIG.md"],"relatedDocs":["docs/arch/IMPACT_RANKING_CONFIG.md","docs/arch/VALIDATION_ARCHITECTURE.md","docs/spec/MEMORY_AREA_CONFIG.md","docs/spec/TRACEABILITY_CONFIG.md","docs/spec/CONFIG_COMMAND.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml","node scripts/evaluate-graph-impact.mjs . --json","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory"]}
```
