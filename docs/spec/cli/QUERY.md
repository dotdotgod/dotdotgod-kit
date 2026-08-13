# Query Command

## Purpose

`dotdotgod query` performs multilingual semantic retrieval over shared project documentation with the resolved local or explicitly configured remote embedding provider.

## Interface

```text
dotdotgod query <root> <query> [--limit <n>] [--json]
```

- `<root>` is the repository root.
- `<query>` is one or more free-form arguments joined with spaces.
- `--limit` accepts an integer from 1 through 100, defaults to 30, and limits unique Markdown files rather than chunks.
- `--json` returns structured output.
- Missing query text, unknown options, and invalid limits exit with usage status 2.

## Corpus

The command indexes Markdown below `docs/` after applying `load.documentationSummary.exclude`. Default exclusions are `docs/plan` and `docs/archive`.

Markdown is split by heading hierarchy and then into body pieces bounded to 1,600 characters before path and heading metadata are prepended. Indexed text includes path, heading hierarchy, and body. Secret-like, hidden, skipped-directory, and configured excluded paths must not be embedded.

## Embeddings

The zero-config default remains `Xenova/multilingual-e5-small` through local `@huggingface/transformers`. Runtime configuration may select an arbitrary local Hugging Face model, an OpenAI-compatible endpoint, or native Ollama. See [`../EMBEDDING_CONFIG.md`](../EMBEDDING_CONFIG.md).

Query and passage inputs retain their retrieval prefixes. Provider output determines dimensions and is normalized and validated before use. Local model assets use the runtime's user-level cache. Selecting a remote provider explicitly authorizes sending embedding inputs to that endpoint.

## Vector Cache

Derived data is stored below ignored `.dotdotgod/vectors/`:

```text
.dotdotgod/vectors/
├── manifest.json
├── chunks.jsonl
└── embeddings.f32
```

The manifest identifies schema version, provider, model, dimensions, a secret-free profile fingerprint, exclusions, chunk count, and refresh statistics. Unchanged chunk fingerprints reuse stored vectors; changed and new chunks are embedded, and deleted chunks are omitted from the rewritten index.

A corrupt, incomplete, model-mismatched, or schema-mismatched cache is rebuilt. Cache writes use temporary files and atomic rename per artifact.

## Ranking and Output

The command performs an exact cosine scan of normalized vectors and adds a small bounded lexical boost for query terms found in result paths or headings. Chunks are sorted by final score and stable path order, then deduplicated by Markdown path. The highest-ranked chunk represents each file, so every returned result has a different path and `--limit` is the maximum file count.

Each result includes:

- chunk ID
- repository-relative Markdown path
- heading hierarchy
- bounded text excerpt
- final score
- raw vector score

Human output is concise. JSON output includes command, root, query, provider, model, embedding source, dimensions, limit, index metadata, and ranked results.

## Safety and Failure

The command may write only ignored `.dotdotgod/vectors/` cache files and the user-level model cache. It does not modify source, docs, or project config.

Model download, offline, inference, invalid-shape, filesystem, and cache-write failures produce an actionable error and non-zero status. Tests inject a deterministic embedder and must not download the model.

The index preparation, exact-cosine, and unique-file aggregation primitives are also reused by `graph impact`. This does not change query behavior: query failures remain fatal, while graph impact catches vector failures and returns structural-only results.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/commands/query.mjs](../../../packages/cli/src/commands/query.mjs)
  - [packages/cli/src/query/chunks.mjs](../../../packages/cli/src/query/chunks.mjs)
  - [packages/cli/src/query/embedder.mjs](../../../packages/cli/src/query/embedder.mjs)
  - [packages/cli/src/query/store.mjs](../../../packages/cli/src/query/store.mjs)
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [packages/pi/test/load-project-utils.test.ts](../../../packages/pi/test/load-project-utils.test.ts)
- Related docs:
  - [docs/spec/LOAD_PROJECT.md](../LOAD_PROJECT.md)
  - [docs/spec/cli/DISCOVERY.md](DISCOVERY.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/commands/query.mjs","packages/cli/src/query/chunks.mjs","packages/cli/src/query/embedder.mjs","packages/cli/src/query/store.mjs","packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","packages/pi/test/load-project-utils.test.ts"],"relatedDocs":["docs/spec/LOAD_PROJECT.md","docs/spec/cli/DISCOVERY.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
