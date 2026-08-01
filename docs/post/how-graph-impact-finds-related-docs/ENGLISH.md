# How Graph Impact Finds What to Review Alongside a Changed File

**Language:** [한국어 원문](README.md)

**Published:** [DEV Community](https://dev.to/dotdotgod/how-graph-impact-finds-what-to-review-alongside-a-changed-file-2kke)

Semantic search can find documents related to a natural-language question. After an implementation change, the central question becomes which specifications, architecture notes, tests, and verification commands should be reviewed alongside the changed file. **`dotdotgod graph impact` starts from changed files, produces a bounded review list with explicit reasons, and uses the documentation table of contents as a reverse map from a change back to its maintained sources.**

Filename search struggles when code and documentation use different names or one change spans several packages and verification paths.

The essential foundation is project memory that people can review and maintain directly. Specifications, architecture notes, test documents, README indexes, and traceability relationships remain in the repository, so people and agents can read and update the same evidence. Graph impact calculates the next review route from these maintainable sources.

## Use Changed Files as Graph Seeds

For a single changed file, use the following command to find related items:

```bash
dotdotgod graph impact . \
  --changed packages/cli/src/commands/query.mjs \
  --yml
```

Repeat `--changed` when several files belong to the same change:

```bash
dotdotgod graph impact . \
  --changed packages/cli/src/commands/query.mjs \
  --changed packages/cli/src/query/chunks.mjs \
  --yml
```

The command deduplicates paths in first-seen order and accepts up to 20 unique, equally weighted changed-file seeds. Changed files appear first, while items connected to several seeds are merged into one ranking. This finds specifications and tests that matter across the whole change.

## Graph Relationships Come from Maintained Project Evidence

The project graph is built from relationships that people maintain or that the repository structure exposes deterministically. `query` handles repository-wide semantic similarity search, while graph impact uses connections whose review rationale can be traced. The graph is a derived map whose accuracy the team manages through Markdown sources and traceability.

| Signal | Meaning |
|---|---|
| Structured traceability | `implemented_by`, `verified_by`, `related_doc`, and verification commands |
| Documentation relationships | Markdown links, headings, and README navigation routes |
| Project structure | Relationships among packages, source, tests, configuration, and resources |
| Memory policy | Roles and priorities for current specifications, architecture, tests, and archives |
| Deterministic routing | Matches among paths, filenames, headings, README files, memory areas, and package names |

Human-authored traceability has higher confidence than routing hints inferred from paths or names. When explicit connections are sparse, README files and stable project terms provide secondary navigation routes.

Graph impact quality therefore depends on both the graph algorithm and the condition of the maintained project evidence. Results become more specific when specifications and tests point to the real implementation, README files route to current documents, and files have narrow responsibilities.

## Rank by Review Value

Returning every related node would turn impact analysis into another repository-wide search. The default `balanced` policy combines Personalized PageRank seeded by changed files with project review policy.

```text
changed files
  → bound the candidate scope
  → multi-seed Personalized PageRank
  → apply traceability and verification policy
  → build a bounded result ranked by review value
```

The base score begins with PPR calculated from the changed files. Explicit traceability, test and verification signals, and direct proximity through Markdown links and README files add weight. Deterministic routing hints act as secondary signals when paths, headings, memory areas, or package names match.

Memory policy applies the current area's priority and its `fresh` or `stale` classification, then penalizes archive bodies. The first screen favors traceability, tests, and direct proximity over lower-confidence routing-only items. When enough actionable files exist, low-actionability metadata such as dependencies is kept out of the result.

The default policy favors current specifications and verification routes over archive bodies. Here, `fresh` and `stale` are memory-area classifications unrelated to file modification time.

## The Result Is a Review List with Reasons

`--yml` returns a bounded structure that an agent can read directly. The following example illustrates the output shape; actual paths, scores, and reasons depend on repository state and configuration.

```yaml
impact:
  ok: true
  changed_files:
    - packages/cli/src/commands/query.mjs
  groups:
    docs:
      items:
        - path: docs/spec/cli/QUERY.md
          score: 65.4
          reasons: [implemented_by, routes_to]
    tests:
      items:
        - path: packages/cli/test/e2e.test.mjs
          score: 58.1
          reasons: [verified_by]
  recommended_actions:
    - review_related_docs
    - run_related_tests
    - run_dotdotgod_validate
```

The result groups documents, behavior contracts, tests, files, commands, and package resources. `score` and `reasons` explain each inclusion, while omitted-item counts indicate candidates beyond the bounded output.

The default output or `--compact` works well for quick human reading. Agent workflows can use `--yml`, while `--json` provides detailed scores and automation diagnostics.

## Graph Impact and Vector Search Have Different Roles

`dotdotgod query` finds documents semantically close to a natural-language question. Graph impact finds review items connected to changed files through maintained relationships.

| Feature | Seed | Primary signals | Meaning of the result |
|---|---|---|---|
| `query` | Natural-language question | Multilingual embeddings | Documents semantically close to the question |
| `graph impact` | Changed files | Traceability, links, PPR, and policy | Items to review first after a change |

The default graph impact ranking does not use embedding similarity. Lexical routing through paths, headings, README files, memory areas, and package metadata is calculated deterministically. Embedding search and the graph index have separate caches and failure boundaries.

This separation keeps results explainable. Each result can be identified as coming from semantic similarity or from implementation and test relationships, README routes, and other maintained evidence.

## A High Score Is a Review-Priority Signal

A higher impact score indicates greater value in reviewing an item early. The score does not determine whether a file is broken, and affected items may remain outside the bounded result.

Sparse traceability or a large file that owns several behaviors produces broader results. After graph impact identifies a route, read the specifications, update implementation and tests, run regressions, and confirm that links and traceability still point to the current state.

```text
change a file
  → run graph impact
  → review related specifications and tests
  → update the necessary code and documentation
  → run tests and dotdotgod validate
```

The graph cache is derived data. Commands refresh it from repository files, while source specifications and code remain the basis for judgment.

## Measure Impact Quality Against Expected Results

Explaining why a score was calculated and placing genuinely useful files near the top each require verification. dotdotgod evaluates graph impact ranking against checked-in expected results for representative cases.

| Metric | What it measures |
|---|---|
| `Precision@5/10` | The share of top results that must or should be reviewed |
| `Recall@10` | The share of must-review items found in the top ten |
| MRR | How early the first must-review item appears |
| `nDCG@10` | Ranking quality across required and recommended relevance grades |

The evaluation script compares current results with a baseline and returns a verdict. As real cases accumulate, these measurements provide evidence for choosing project-appropriate CI thresholds.

## Change Review Starts from a Reverse Table of Contents

A documentation table of contents is a forward map from a product question to relevant specifications and tests. Graph impact is a reverse map from code and documentation changes back to the sections that should be reviewed with them.

Connecting both directions lets specifications, implementation, and tests continue to describe the same project state after a change. The essential property is that although the navigation map is calculated automatically, its evidence remains in documents and relationships that people can read and correct. When the team maintains those sources, the agent's review routes update with them.

> Graph impact finds review routes that people may otherwise miss within human-maintained project memory. Final impact decisions come from reviewing the connected sources and tests together.

## Further Reading

- [AI Agent Memory Starts with a Documentation Table of Contents](../document-directory-as-table-of-contents/ENGLISH.md)
- [How dotdotgod Maintains a Documentation Table of Contents](../how-dotdotgod-maintains-document-toc/ENGLISH.md)
- [Why Project Memory Should Stay Docs-First Even with Vector Search](../docs-first-project-memory/ENGLISH.md)
- [How dotdotgod Query Finds Relevant Documents from a Natural-Language Question](../how-query-finds-related-docs/ENGLISH.md)
- [Graph Impact Command Specification](../../spec/cli/GRAPH_IMPACT.md)
- [Impact Ranking Configuration](../../spec/IMPACT_RANKING_CONFIG.md)
- [Graph Impact Quality Tests](../../test/GRAPH_IMPACT_QUALITY.md)
