# How dotdotgod Query Finds Relevant Documents from a Natural-Language Question

A documentation table of contents is the fastest retrieval method when an agent knows the relevant role and path. A user's question may use different wording from a document's filename, and the question and document may even be written in different human languages. **`dotdotgod query` searches locally for document passages that are semantically close to a natural-language question and routes the agent to the maintained sources worth reading.**

**Language:** [한국어 원문](README.md)

**Published:** [DEV Community](https://dev.to/dotdotgod/how-dotdotgod-query-finds-relevant-documents-from-a-natural-language-question-43do)

Documents remain the source of project memory. Embeddings and search results are derived retrieval data that connect a question to those sources.

## Start from Meaning When the Path Is Unknown

Consider this question:

> Why does Load exclude old plans from its default context?

The relevant explanation may live in `LOAD_PROJECT.md`, `MEMORY_AREA_CONFIG.md`, or a document about context curation. A filename search may not connect “old plans” from the question with terms such as `archive`, `local memory`, or `stale` in the documents.

`query` accepts a free-form question and finds semantically related Markdown passages.

```bash
dotdotgod query . \
  "Why does Load exclude old plans from its default context?" \
  --limit 5
```

Multiple arguments after `<root>` are joined into one query. `--limit` accepts values from 1 through 100 and defaults to 30. The limit applies to distinct Markdown files rather than passage count.

## Keep the Search Corpus within Docs-First Boundaries

Query searches Markdown documents under `docs/` and applies the `load.documentationSummary.exclude` policy to define its scope.

The default corpus excludes these bodies:

```text
docs/plan/
docs/archive/
```

Active plans and historical records are read through README indexes and explicit paths when needed. Hidden paths, paths that appear to contain secrets, skipped directories, and paths matched by configured exclusions are also excluded from embedding.

This scope preserves the different roles of current shared documentation and local working records during retrieval.

## Split Markdown along Its Heading Hierarchy

A useful search unit needs both the meaning of one section and enough context to interpret it. dotdotgod splits Markdown along its heading hierarchy, limits each body fragment to 1,600 characters, and attaches path and heading information.

```text
docs/spec/LOAD_PROJECT.md
└── Focused Query
    └── query searches shared documentation ...
```

Each passage contains its repository-relative path, heading hierarchy from the top level through the current section, and a bounded body fragment. The path and headings provide an address for interpreting a result, while the body provides meaning to compare with the question.

## Run the Multilingual E5 Model Locally

Query currently supports one model: `Xenova/multilingual-e5-small`. It runs locally through `@huggingface/transformers`, so document bodies are not sent to a remote embedding API.

Following the E5 input format, Query adds a different prefix to each kind of input.

```text
query: Why does Load exclude old plans from its default context?
passage: path: docs/spec/LOAD_PROJECT.md ...
```

The query receives the `query: ` prefix and document passages receive `passage: `. The model converts both into normalized 384-dimensional float32 vectors.

If the model files are absent, the runtime may download them to its user-level cache on first use. Remote provider selection and alternative embedding-model profiles are not currently supported.

## Compare Semantic Similarity across Every Passage

Query directly compares how closely the question matches every document passage in meaning (cosine similarity). Because the vectors are normalized, vectors that point in more closely aligned directions receive higher scores. For the current small local corpus, Query does not need a separate index that quickly narrows the search to likely nearby candidates (approximate nearest neighbor).

```text
convert the question into semantic coordinates
  → compare cosine similarity with every passage
  → add a small bonus for matching words in headings and paths
  → sort consistently by score and path
  → select the highest result for each Markdown path
```

When a word from the question appears directly in a result path or heading hierarchy, Query adds a small bonus (lexical boost). Semantic similarity remains the primary signal, while explicit path and heading matches also contribute.

After sorting, Query deduplicates results by Markdown path. Even when several passages from one document score highly, only the highest passage represents that file. This keeps one or two long documents from filling the result set and gives the agent a broader set of documents to review.

## Reuse Embeddings for Unchanged Passages

Derived vector data lives in a repository-specific cache excluded from Git.

```text
.dotdotgod/vectors/
├── manifest.json
├── chunks.jsonl
└── embeddings.f32
```

`manifest.json` records the schema, model, dimensions, exclusion policy, and refresh information. `chunks.jsonl` stores passage and path metadata, while `embeddings.f32` stores float32 vectors.

When a passage fingerprint remains the same, Query reuses the existing vector. It embeds only new or changed passages and removes deleted passages when rewriting the cache.

If the cache is damaged, incomplete, or incompatible with the current schema, model, or dimensions, Query rebuilds it. Each artifact is written to a temporary file and replaced with an atomic rename to reduce the risk of partial writes.

The cache is derived data that can be rebuilt from maintained documents at any time.

## Return a Bounded Set of Candidates for Source Reading

The default human-readable output stays concise. With `--json`, callers can inspect structured query, model, dimension, index, and result data.

Each result provides a chunk ID, repository-relative Markdown path, heading hierarchy, and bounded body excerpt. The final score includes the small bonus for matching expressions, and the original semantic-similarity score remains available.

A high score identifies a maintained-source candidate whose meaning is close to the question. A product contract under `docs/spec/` and an explanatory document under `docs/concept/` may use the same words while serving different roles. The agent checks the result path and heading to identify that role, then reads the maintained source.

## Query and Graph Impact Answer Different Questions

Both features find related documents, but they begin from different inputs and use different signals.

| Feature | Starting point | Primary signals | Purpose |
|---|---|---|---|
| `query` | Natural-language question | Multilingual semantic retrieval with a small bonus for matching expressions | Find documents close in meaning |
| `graph impact` | Changed file | Traceability relationships, links, PPR, and project policy | Find items to review together |

Query uses its own local vector cache. Graph impact's default ranking uses deterministic relationships and word-match routing (lexical routing); embedding similarity is not part of its default route.

Load combines Query results with the documentation map when a natural-language focus is present. After code or documentation changes, graph impact identifies the next review route.

## Semantic Retrieval and the Documentation Map Form One Reading Route

Semantic retrieval finds candidates when the path is unknown. Paths and README files then explain the role of each candidate document.

```text
question
  → find candidate paths with query
  → identify their roles through README files and memory areas
  → read the necessary sections from maintained sources
```

> Vector search finds the source address an agent should read even when the question and the document use different expressions.

## Further Reading

- [The Role of Vector Search in Docs-First Project Memory](../docs-first-project-memory/ENGLISH.md)
- [How dotdotgod Load Turns a Documentation Table of Contents into a Reading Route](../how-load-keeps-ai-context-fresh/ENGLISH.md)
- [How Graph Impact Finds Items to Review from a Changed File (Korean)](../how-graph-impact-finds-related-docs/README.md)
- [Query command specification](../../spec/cli/QUERY.md)
- [Load Project specification](../../spec/LOAD_PROJECT.md)
