# Impact Ranking Architecture

## Purpose

Impact ranking is a fixed, explainable retrieval layer for changed-file review. Configurable traceability definitions supply graph relations and weights; scoring combines weighted Personalized PageRank with memory-area policy.

## Pipeline

1. Build or refresh the indexed graph.
2. Collect direct and bounded expanded candidates from traceability, links, routing, package/resource, semantic-candidate, and memory relations.
3. Merge configured traceability relation weights with maintained built-in non-traceability weights.
4. Run equal-restart PPR from one or more changed-file seeds over bidirectional weighted edges.
5. Convert raw probability with fixed reference `0.4` into an `0..80` connection score.
6. Add an `0..20` memory score and clamp the result to `0..100`.
7. Preserve seed order, grouped output, omitted counts, and bounded per-seed results.

## Score Boundary

```text
connection = clamp(probability / 0.4 × 80, 0, 80)
memory = clamp(priority / 100 × 15 + freshness/body-policy adjustments, 0, 20)
```

Fresh memory adds `5`, stale memory subtracts `5`, and default-body exclusion subtracts `5`. Archive-seeded requests skip only the body-exclusion adjustment.

The fixed reference is graph-policy state, not a runtime result maximum. Adding a disconnected or unrelated candidate therefore cannot rescale an existing score.

## Relation Ownership

Traceability keys are an ordered complete-list registry. Their definitions own key, target type, relation, and `0..20` PPR weight. Graph edges retain traceability key/relation evidence; command-node IDs derive from stable source/key/command content rather than list position.

Non-traceability relations use built-in weights. Public `relationWeights` overrides are retired to prevent duplicate ownership.

## No Secondary Rank Buckets

There are no direct traceability, curated, test, verification, proximity, semantic-only, freshness, archive, or node-type ranking bonuses outside the connection/memory formula. Reasons and strongest direct relation remain explanation metadata only. This intentionally accepts legacy quality-metric regression in exchange for one generalized graph traversal model.

Low-actionability and semantic-only counters remain diagnostics. Bounded output grouping may limit repeated metadata nodes, but it does not add hidden score points.

## Configuration Boundary

Public presets, score weights, PPR settings, and relation-weight overrides are retired and invalid. Four legacy boost maps are inert for compatibility. `impactRanking.semantic` controls request-local vector candidates through `enabled`, cosine threshold, and top-K. Vector preparation reuses the documentation query cache asynchronously, then supplies an ephemeral overlay to the synchronous report/PPR core. Each traversal edge uses built-in vector relation weight multiplied by cosine similarity. The indexed graph and changed-file text/vectors remain unmodified; failures produce structural-only results. Lexical semantic edges and lexical-only configuration fields are retired.

Read-only graph diagnostics expose method, caps, and internal reference. `config init` does not serialize internal ranking constants.

## Calibration

`scripts/evaluate-graph-impact.mjs` records raw fixture PPR for curated, deterministic, one-hop, multi-hop, unrelated, and multi-seed cases; connection saturation; candidate independence; and seed-order invariance. Precision/recall/MRR/nDCG deltas against the legacy model are migration evidence, not blockers after explicit removal of specialized bonuses.

## Compatibility

- changed seeds remain first at score `100`
- combined and `perSeed` multi-file shapes remain bounded
- raw JSON retains `related`, groups, scores, and breakdowns
- compact/YML output remains agent-facing and bounded
- exact legacy scores, presets, and preset behavior are not preserved

## Related Behavior and Verification

- Behavior: [`docs/spec/IMPACT_RANKING_CONFIG.md`](../spec/IMPACT_RANKING_CONFIG.md)
- CLI contract: [`docs/spec/cli/GRAPH_IMPACT.md`](../spec/cli/GRAPH_IMPACT.md)
- Verification: [`docs/test/IMPACT_RANKING_CONFIG.md`](../test/IMPACT_RANKING_CONFIG.md)
- Quality evaluation: [`docs/test/GRAPH_IMPACT_QUALITY.md`](../test/GRAPH_IMPACT_QUALITY.md)
