# Graph Impact Quality

## Purpose

Graph impact quality checks measure whether `dotdotgod graph impact` surfaces the files an agent should inspect for representative changed-file seeds.

The quality script keeps seed/gold expectations checked in so ranking changes can be compared without rebuilding the archived ad hoc evaluation script.

## Command

```bash
node scripts/evaluate-graph-impact.mjs . --json
node scripts/evaluate-graph-impact.mjs . --markdown --output docs/archive/report/graph-effectiveness-evaluation/FOLLOW_UP_MEASURE.md
```

## Metrics

- `Precision@5` and `Precision@10`: share of top results that are must- or should-inspect items.
- `Recall@10`: share of must-inspect items found in the top 10.
- `MRR`: reciprocal rank of the first must-inspect item.
- `nDCG@10`: ranked relevance quality using must/should labels.
- Baselines: lexical/path matching and snapshot/README routing.
- Noise counters: semantic-only and curated top-10 counts.

## Expected Use

Run the script after ranking, traceability, or compact-output changes. Archive markdown comparisons under `docs/archive/report/graph-effectiveness-evaluation/` and keep large raw captures local.

The script exits successfully and reports the verdict in JSON/markdown; use the metrics to decide whether stricter CI thresholds are safe.
