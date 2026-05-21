# Impact Effect Analysis Report

## Summary

This report is a historical snapshot of `dotdotgod_graph_impact` usage in local Pi session logs.

- Status: historical evidence report, not a behavior contract.
- Log source: local Pi session logs.
- Analysis window: 2026-05-14 through 2026-05-20.
- Impact tool calls analyzed: 85.
- Sessions containing impact calls: 12.

The main observation is that impact-surfaced paths expanded the measured unique file-discovery set from 239 files to 373 files. The additional 134 files were mostly source and test files, which is consistent with broader implementation and verification coverage in the analyzed sessions rather than only adding more documentation.

## Method and Source Boundaries

The analysis used local session-log data available in the author's Pi environment during the analysis window. It counted explicit tool-call file paths before the first impact call in each impact-using session, then compared them with paths surfaced by parsed impact results.

The report intentionally avoids publishing personal usage totals, monetary estimates, or raw log payloads. Counts are observational and depend on the completeness of the local logs, parser coverage, and the timezone/context of the original sessions.

## Usage Context

This report intentionally avoids publishing personal usage totals or monetary estimates. It focuses on non-financial effectiveness signals that are useful for evaluating `dotdotgod_graph_impact`: the number of files discovered before and after impact, the type of files added, and the relationship reasons that explained those additions.

Impact output accounted for approximately 0.04% of observed usage in the analysis window. Within this measured window, impact output size appeared lower priority than load and prompt compaction. Treat that as a report-local interpretation, not a durable roadmap decision.

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

Impact-surfaced paths expanded the measured unique known file set by 134 files, a 56% lift over the pre-impact set.

### Per-Session Counts

Session-level sums can count the same repository path more than once when it appeared in multiple sessions. Use the unique counts above for repository-wide file-discovery totals.

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

This is consistent with impact surfacing implementation and verification files that were not already obvious from the measured pre-impact exploration path.

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

In these logs, reason labels included semantic neighbors, implementation-to-spec links, and verification relationships. Treat this as report-local evidence about observed output; durable relationship semantics belong in `docs/spec/` or `docs/arch/`.

## Caveats

- The analysis is observational. Logs do not contain a true counterfactual showing exactly what the agent would have found without impact.
- `n` only counts files that appeared in explicit tool-call arguments before the first impact call in each impact session. Files mentioned only in natural language may be undercounted.
- `m` counts impact-surfaced paths that were not already present in `n`; it does not prove every added file was later read or edited.
- Exact usage reduction cannot be computed from logs alone. Avoided reads, greps, and exploratory searches are counterfactual.

## Conclusion

Impact had a measurable discovery association in the analyzed sessions:

- Unique known files increased from 239 to 373.
- Impact added 134 unique files, a 56% lift.
- The added set was mostly source and test files, not just more documentation.

The strongest evidence for value is consistent with reduced blind spots: impact expanded the measured file set toward code and tests that were less likely to appear in the initial documentation-oriented exploration path.
