# What If a Project Had Psychometry?

**Language:** [한국어 원문](README.md)

After changing code, the harder question is often not what changed, but what else should be reviewed with it. A project must preserve readable traces of its work so that specifications, architectural constraints, and tests connected to a changed file are not overlooked. Dotdotgod treats `graph impact`, which reads those traces backward from changed files, as a form of **project psychometry**.

**Explicit project memory maintained by people creates two routes: one from a task goal to relevant documents at the start of work, and another from changed files back to the review scope after the work is done.**

## Project Memory Has Two Retrieval Directions

Living beings use present signals to recall past experience and choose what to do next. Could a project also retrieve the memory it needs from a current goal or an event that has already happened? This article uses cognition as an explanatory analogy, not as a rigorous model from cognitive science.

At the start of a task, the desired outcome is the retrieval seed. We interpret the request and find the relevant rules, specifications, architecture, and past decisions. After the task, the changed files become the seed. We inspect the result and find the documents, tests, and verification commands that should be reviewed alongside it.

```text
Task start:  goal and request → required project memory
Task finish: changed files    → documents, tests, and source to review
```

Dotdotgod's `query` supports the first route by moving from a natural-language question to semantically related documents. `graph impact` creates the second route from changed files and maintained relationships. Both narrow the maintained sources that should be read now.

## Maintained Traces Are the Source of Memory

In fiction, psychometry reads memories from traces left on an object. A project needs readable traces before it can offer anything similar. Dotdotgod keeps project memory in documents that people can read and edit.

- Specifications describe the behavior the product currently guarantees.
- Architecture documents preserve design rationale and constraints.
- Test documents explain what is verified and how.
- README indexes and Markdown links create routes to the next document.
- Traceability explicitly connects specifications, implementation, tests, and verification commands.

Graph indexes and vector caches are derived retrieval data built over those sources. Maintained project memory remains in documents when a cache is deleted, and graph and vector data can be rebuilt from documents and repository structure. Search results provide addresses to source documents, while graph scores indicate review priority. Actual behavior is judged by examining the relevant sources, code, and tests together.

## Graph Impact Reads Traces in Reverse

When a document points to implementation and tests, a changed file can follow those relationships in reverse.

```bash
dotdotgod graph impact . \
  --changed packages/cli/src/commands/query.mjs \
  --yml
```

Repeat `--changed` when several files make up one change. Each changed file becomes a graph seed, and specifications or tests shared by several seeds are merged into one overall review ranking.

The indexed graph uses relationships that people maintain or that the repository can derive deterministically: configured traceability, Markdown links, README routes, headings, package metadata, scripts, resources, dependencies, and memory-area membership. Impact ranking gives up to `80` points to weighted Personalized PageRank seeded by changed files and up to `20` points to memory policy; direct, verification, semantic, and node-type evidence receive no separate score or ordering bonus. When the local query cache is available, impact analysis adds a bounded request-local multilingual `vector_similarity` overlay for candidate discovery and PPR without mutating the indexed graph or persisting changed-file vectors. Vector failure degrades to structural-only results.

The following abbreviated example shows the essential output shape. Actual paths, scores, and reasons depend on repository state and configuration.

```yaml
impact:
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

`score` indicates the value of reviewing a candidate early. `reasons` exposes why a candidate appears, such as structured traceability or a direct relationship. Grouping results into documents, tests, source files, and commands gives an agent a bounded set of next actions.

## The Limits of the Psychometry Analogy

`graph impact` returns a bounded list of top review candidates. Related items may remain outside the result, and whether a high-scoring file needs modification is decided by reading its connected sources and tests.

Result quality depends on the quality of the traces a project preserves. Stale README files, missing implementation relationships, and large files responsible for many behaviors make the review scope broader and less specific. Clear document roles and traceability and test relationships that describe the current state produce more useful candidates from changed files.

Use the `graph impact` result as the next review list. Make the final decision after checking the connected sources and tests.

```text
change files
  → graph impact
  → review related sources and tests
  → update the necessary code and documents
  → run tests and dotdotgod validate
```

## People Maintain Project Memory

Names, paths, document roles, and relationships that are easy for people to understand also become cognitive cues for AI. At the start of work, the route runs from a goal to the required sources. At the end, it runs from changed files back to the sources that should be reviewed.

Both directions begin with the same maintained sources. When people update documents and traceability to match the current state, the agent's retrieval and change-review routes change with them.

> Project psychometry is the ability to read the next review route that people might otherwise miss from the memory they have maintained.

## Further Reading

- [Project Structure Becomes Cognitive Cues for AI](../project-structure-as-ai-cognitive-cues/ENGLISH.md)
- [A Documentation Directory Is an AI Agent's Table of Contents](../document-directory-as-table-of-contents/ENGLISH.md)
- [The Role of Vector Search in Docs-First Project Memory](../docs-first-project-memory/ENGLISH.md)
- [How Dotdotgod Load Keeps AI Context Fresh](../how-load-keeps-ai-context-fresh/ENGLISH.md)
- [How Dotdotgod Query Finds Related Documents](../how-query-finds-related-docs/ENGLISH.md)
- [How Graph Impact Finds What to Review Alongside a Changed File](../how-graph-impact-finds-related-docs/ENGLISH.md)
- [Graph impact command specification](../../spec/cli/GRAPH_IMPACT.md)
- [Graph impact quality tests](../../test/GRAPH_IMPACT_QUALITY.md)
