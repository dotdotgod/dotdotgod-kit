# Graph Impact Quality

## Purpose

Graph impact quality checks compare representative changed-file rankings while separately enforcing fixed-PPR stability invariants.

The current migration intentionally removes curated, test, direct, semantic-only, and node-type ranking bonuses. Legacy quality regression is therefore recorded as evidence rather than treated as a failing gate.

## Commands

```bash
node scripts/evaluate-graph-impact.mjs . --json
node scripts/evaluate-graph-impact.mjs . --markdown --output docs/archive/report/graph-effectiveness-evaluation/FOLLOW_UP_MEASURE.md
```

## Quality Metrics

- `Precision@5` and `Precision@10`: share of top results that are must- or should-inspect items.
- `Recall@10`: share of must-inspect items found in the top 10.
- `MRR`: reciprocal rank of the first must-inspect item.
- `nDCG@10`: ranked relevance quality using must/should labels.
- Lexical/path and snapshot/README baselines.
- Semantic-only, curated, and saturated connection top-10 counts.
- Deltas from the archived legacy scoring baseline.

These metrics describe the accepted PPR-only migration. They must not be recovered with hidden direct or type-specific selection bonuses.

## Calibration Evidence

The evaluator also reports a synthetic graph with curated, explicit, deterministic, one-hop, multi-hop, unrelated, and multi-seed cases:

- raw PPR probabilities
- connection scores using internal reference `0.4`
- saturated fixture count
- stability after adding a disconnected candidate
- invariance when multi-seed input order changes

Candidate independence and seed-order invariance are blocking. Saturation and legacy metric deltas remain explicit measurement evidence for later versioned calibration; there is no evidence-free hard percentage threshold.

Selected-reference evidence:

| Evidence | Result |
| --- | ---: |
| Internal reference | `0.4` |
| Single-seed raw PPR: curated / explicit / deterministic | `0.28 / 0.09 / 0.04` |
| Single-seed raw PPR: one-hop / multi-hop / unrelated | `0.08 / 0.03 / 0` |
| Multi-seed raw PPR: curated / explicit / deterministic | `0.31 / 0.06 / 0.03` |
| Connection scores: curated / explicit / deterministic | `56 / 18 / 8` |
| Connection scores: one-hop / multi-hop / unrelated | `16 / 6 / 0` |
| Saturated fixture candidates | `0` |
| Candidate-independent / seed-order invariant | `true / true` |

Candidate `0.2` saturated curated evidence. Candidates `0.3`, `0.4`, and `0.5` did not saturate; `0.4` was selected to leave headroom for repository-scale graph variation while retaining visible separation through multi-hop evidence.

The repository evaluation recorded P@5 `0.32`, P@10 `0.25`, Recall@10 `0.30`, MRR `0.40`, and nDCG@10 `0.30`. Their negative legacy deltas are accepted because specialized direct/test/type bonuses were intentionally removed.

## Expected Use

Run the evaluator after ranking, relation-weight, candidate-generation, traceability, or compact-output changes. Archive markdown comparisons under `docs/archive/report/graph-effectiveness-evaluation/` and keep large raw captures local.

A successful verdict means fixed-reference stability invariants pass. It does not claim that the new PPR-only rank preserves specialized legacy quality scores.
