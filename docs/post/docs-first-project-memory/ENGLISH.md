# The Role of Vector Search in Docs-First Project Memory

When designing project memory for AI agents, it is tempting to choose the retrieval technology first. Before embedding documents, storing conversations, or building a graph, a project needs to decide where its durable knowledge will live. **The dotdotgod approach keeps that knowledge in documents that people can review and version, then uses search and graphs as derived layers that route agents to the documents they need.** This is the basic structure of docs-first project memory.

**Language:** [한국어 원문](README.md)

**Published:** [DEV Community](https://dev.to/dotdotgod/the-role-of-vector-search-in-docs-first-project-memory-p2p)

The previous articles explained how directories, filenames, and README files form a documentation table of contents for AI agents, and how dotdotgod keeps that table of contents current. This article takes the next step by separating the authoritative source of project memory from the retrieval data that can be rebuilt from it.

## Separate Sources from Derived Data

Project memory contains several layers with different lifetimes.

| Layer | Examples | Role |
|---|---|---|
| Shared sources | `AGENTS.md`, `docs/spec/`, `docs/arch/`, `docs/test/` | Rules, product behavior, design rationale, and verification knowledge |
| Local working memory | `docs/plan/`, `docs/archive/` | Current intent and relevant historical records |
| Derived retrieval data | Graph index, vector cache, manifest | An acceleration layer for finding related source documents |
| Session context | Load output and selected document bodies | A temporary reading scope for the current request |

Maintained documents can be read, changed, and reviewed by people. When those documents are committed to Git, a project can trace when their contents changed and review the relationships between specs and tests in the same change.

The vector cache under `.dotdotgod/` is calculated from selected Markdown passages. The graph cache indexes documentation relationships as well as package, source, test, and configuration metadata. Both improve retrieval speed and quality, while authority over product behavior and design decisions remains in maintained documents and code.

```text
Maintained documents
  ├── relationship extraction → graph index
  ├── passage embedding       → vector cache
  └── selective reading       → session context
```

The direction of these arrows matters. Maintained documents preserve meaning; the graph, vector cache, and session context retrieve and deliver that meaning for the current task.

## Derived Data Should Be Rebuildable

Separating sources from derived layers creates a clear failure boundary. Deleting the vector cache leaves the Markdown sources intact, and a stale or corrupt graph index can be rebuilt from repository files. When semantic retrieval is unavailable, an agent can still navigate through the directory documentation map and README indexes. Shared rules and specs also remain in the repository after an individual agent session ends.

This recoverability preserves essential project knowledge as models, embedding formats, and agent tools change. Local vector and graph caches stay separate from their sources so they can be recalculated from source files, maintained documents, and project configuration.

## A Search Result Is an Address, Not the Answer

Natural-language retrieval is useful when a question and a filename use different wording. A user might ask, “Why are old plans excluded from the default context?” while the relevant documents are named `LOAD_PROJECT.md` and `MEMORY_AREA_CONFIG.md`. Multilingual embedding search can find passages with related meaning even when their wording differs.

Semantic proximity alone does not reveal whether a passage is a current spec, a historical plan, or an unverified idea. Directory paths expose document roles, and each README provides a local index for its area. Memory areas describe scope and `fresh` or `stale` classification, while explicit traceability connects specs to implementation and tests.

A search result is therefore **a candidate address for a source document worth reading**. The agent checks the result's path and role, reads the relevant source, and then makes a decision.

## The Graph Creates Review Routes Back to Source Documents

The relationship graph finds specs, tests, and commands that deserve review alongside a changed file. Markdown links, README routes, package relationships, and structured traceability provide those connections.

A graph score sets review priority. Results vary with the scope and quality of the recorded relationships, so the final decision comes from reading and verifying the highest-ranked specs, code, and tests.

Vector retrieval and the relationship graph begin from different inputs.

| Retrieval method | Starting point | Routes it returns |
|---|---|---|
| Directory documentation map and README indexes | A known documentation area | Child directories, documents, and the next local index |
| Vector retrieval | A natural-language question | Documents with semantically related passages |
| Graph impact | A changed file | Documents, code, and tests that deserve review together |

Each method provides a route from a different starting point back to maintained source documents.

## Load Creates a Reading Scope Without Copying the Sources

A docs-first structure becomes most useful when agents read selectively. The dotdotgod Load workflow narrows the reading scope for the current task in five steps.

1. Check entry points such as `AGENTS.md`, the repository README, and `docs/README.md`.
2. Build a depth-bounded documentation map before reading broad document bodies.
3. Use semantic retrieval to narrow document routes when the user provides a question.
4. Select only the plans or history relevant to the current task.
5. Read the relevant sections of the required source documents.

Load output is temporary retrieval context shaped for the current session and question. A later task can create a different reading route from the same source documents.

## Trust Starts with Where Project Memory Lives

Retrieval accuracy alone cannot establish the quality of AI project memory. People must be able to review the source behind a result. Paths must distinguish current specs from historical records. Project knowledge must survive deletion of the search index, and different agents must be able to reach the same sources and rules.

Docs-first project memory uses vector retrieval, graphs, and Load as navigation tools built on a reviewable source.

> Maintained documents preserve project memory. Retrieval results point to the part of that memory worth reading now.

## Further Reading

- [AI Agent Memory Starts with a Documentation Table of Contents](../document-directory-as-table-of-contents/ENGLISH.md)
- [How dotdotgod Keeps a Documentation Table of Contents Current](../how-dotdotgod-maintains-document-toc/ENGLISH.md)
- [How dotdotgod Load Turns a Documentation Table of Contents into a Reading Route (Korean draft)](../how-load-keeps-ai-context-fresh/README.md)
- [Context curation concept](../../concept/CONTEXT_CURATION.md)
- [Documentation structure architecture](../../arch/DOCS_STRUCTURE.md)
