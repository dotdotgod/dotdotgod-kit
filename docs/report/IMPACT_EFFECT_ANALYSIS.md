# Impact Effect Analysis Report

## Summary

This report summarizes the current-session analysis of `dotdotgod_graph_impact` effectiveness using recent Pi session logs.

- Log source: local Pi session logs
- Analysis window: 2026-05-14 through 2026-05-20
- Impact tool calls analyzed: 85
- Sessions containing impact calls: 12

The main finding is that impact increased the unique file-discovery set from 239 files to 373 files. The additional 134 files were mostly source and test files, which means impact primarily helped expand implementation and verification coverage rather than only adding more documentation.

## Usage Context

This report intentionally avoids publishing personal usage totals or monetary estimates. It focuses on non-financial effectiveness signals that are useful for evaluating `dotdotgod_graph_impact`: the number of files discovered before and after impact, the type of files added, and the relationship reasons that explained those additions.

Impact output accounted for approximately 0.04% of observed usage in the analysis window. Because this share was very small, this report treats impact output size as a low-priority optimization target compared with load and prompt compaction.

## File Discovery Lift

The analysis compared files known before the first impact call in each impact-using session with files surfaced by impact results.

Definitions:

- `n`: files already known before impact through explicit tool-call file paths.
- `m`: files newly surfaced by impact that were not already in `n`.
- `n+m`: total known files after including impact results.

### Unique File Counts

| Category | Count |
| --- | ---: |
| Files known before impact (`n`) | 239 |
| Files newly added by impact (`m`) | 134 |
| Files known after impact (`n+m`) | 373 |

Impact therefore increased the unique known file set by 134 files, a 56% lift over the pre-impact set.

### Per-Session Counts

| Metric | Count |
| --- | ---: |
| Session-level pre-impact file sum | 288 |
| Session-level impact-added file sum | 217 |
| Session-level post-impact file sum | 505 |
| Average `n` per impact session | 24.0 |
| Average `m` per impact session | 18.1 |
| Average `n+m` per impact session | 42.1 |

## Source Versus Documentation Breakdown

### Unique Files

| Type | Pre-impact `n` | Impact-added `m` | Post-impact `n+m` |
| --- | ---: | ---: | ---: |
| Source and tests | 70 | 85 | 155 |
| Documentation | 156 | 49 | 205 |
| Other config/data | 13 | 0 | 13 |
| Total | 239 | 134 | 373 |

### Interpretation

Before impact, the known file set was documentation-heavy:

- Source and tests: 29.3%
- Documentation: 65.3%
- Other: 5.4%

Impact-added files were source-heavy:

- Source and tests: 63.4%
- Documentation: 36.6%
- Other: 0%

After impact, the final known file set became more balanced:

- Source and tests: 41.6%
- Documentation: 55.0%
- Other: 3.5%

This suggests impact was useful for discovering implementation and verification files that were not already obvious from manual exploration.

## Impact Scope Signals

Impact results also exposed related items and omitted candidates.

| Metric | Value |
| --- | ---: |
| Parsed impact result items | 610 |
| Changed-file items | 58 |
| Inferred shown items | 552 |
| Unique inferred paths | 186 |
| Omitted related candidates | 4,818 |
| Potential inferred scope including omitted candidates | 5,370 |

The safest confirmed value is the 552 inferred shown items across 186 unique paths. The omitted candidate count shows the graph found substantially more possible relationships, but those were not fully displayed or manually reviewed in this analysis.

## Primary Relationship Reasons

The most common impact reasons were:

| Reason | Count |
| --- | ---: |
| `semantic_similarity` | 465 |
| `verified_by` | 120 |
| `incoming:semantic_similarity` | 120 |
| `implemented_by` | 116 |
| `related_doc` | 83 |
| `incoming:implemented_by` | 52 |

These reasons indicate that impact was not just matching names. It surfaced semantic neighbors, implementation-to-spec links, and verification relationships.

## Caveats

- The analysis is observational. Logs do not contain a true counterfactual showing exactly what the agent would have found without impact.
- `n` only counts files that appeared in explicit tool-call arguments before the first impact call in each impact session. Files mentioned only in natural language may be undercounted.
- `m` counts impact-surfaced paths that were not already present in `n`; it does not prove every added file was later read or edited.
- Exact usage reduction cannot be computed from logs alone. Avoided reads, greps, and exploratory searches are counterfactual.

## Conclusion

Impact had a measurable discovery effect in the analyzed sessions:

- Unique known files increased from 239 to 373.
- Impact added 134 unique files, a 56% lift.
- The added set was mostly source and test files, not just more documentation.

The strongest evidence for value is reduced blind spots: impact expanded the file set toward code and tests that were less likely to be found through the initial documentation-oriented exploration path.
