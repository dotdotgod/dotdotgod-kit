# Impact Ranking Verification

## Scope

Verify fixed PPR-only connection scoring, memory policy, dynamic traceability relation weights, migration of retired ranking config, explainable output, and calibration invariants.

## Automated Coverage

| Area | Expected coverage |
| --- | --- |
| Fixed policy | Connection cap `80`, memory cap `20`, damping/iterations/tolerance, and internal reference `0.4` are deterministic and read-only. |
| Retired config | `preset`, `weights`, `ppr`, and `relationWeights` report `IMPACT_RANKING_CONFIG_RETIRED_FIELD`. |
| Inert maps | Four legacy boost maps behave exactly like absence and are omitted from resolved/init output. |
| Semantic boundary | Existing deterministic semantic candidate controls still validate; they add no semantic score bucket. |
| Dynamic weights | Configured traceability relations exclusively supply their PPR weights; zero weight disables traversal. |
| Score breakdown | Seeds score `100`; non-seeds expose connection probability/reference/PPR, memory priority/adjustment, and optional direct evidence. |
| Removed bonuses | Curated, test, verification, proximity, semantic-only, and node-type evidence receive no separate score or comparator bonus. |
| Memory | Priority, fresh/stale, body exclusion, archive-seed exception, and `0..20` cap are asserted. |
| Fixed normalization | Strong/weak weighted paths separate without runtime candidate-maximum normalization. |
| Multi-seed | Inputs are ordered/deduplicated, restart is equal, seeds lead, per-seed results are bounded, and seed order does not alter probabilities. |
| Candidate stability | Adding disconnected nodes leaves existing probabilities/scores unchanged. |
| Output compatibility | JSON/YML/compact keep changed files, groups, reasons, omitted counts, ranking method, and reference diagnostics. |
| Quality evidence | Evaluator reports legacy deltas, saturation, raw calibration fixture values, candidate independence, and seed-order invariance. |

## Traceability-Key Cases

- Default relations retain weights `4`, `4`, `3`, and `3`.
- Custom path and command relations create weighted graph edges with traceability-key metadata.
- Complete-list removal means omitted fields are invalid in top-level and contract blocks.
- Stable command IDs do not change when sibling commands are reordered.
- Reserved relation collisions and duplicate key/relation definitions fail validation.

## Migration Assertions

Legacy Precision@5/10, Recall@10, MRR, and nDCG@10 regression is accepted because specialized direct/type bonuses were explicitly removed. Tests must not recover those metrics with hidden selection tiers. Blocking calibration assertions are score separation, no unnecessary fixture saturation, disconnected-candidate stability, and multi-seed order invariance.

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --json
node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/cli/src/core.mjs --yml
node scripts/evaluate-graph-impact.mjs . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

## Expected JSON

- `impact.ranking.method` is `weighted-personalized-pagerank+memory`.
- `connectionCap`, `memoryCap`, and `pprReference` are `80`, `20`, and `0.4`.
- Top-level `related` mirrors `impact.related`.
- Changed seeds lead with `impactScore: 100` and `scoreBreakdown.seed: 100`.
- Non-seed breakdown has `connection` and `memory`, not legacy buckets.
- Compact JSON retains the method/reference but omits verbose diagnostics.
