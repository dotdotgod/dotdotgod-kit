# Query Command

## Purpose

`dotdotgod query` performs local multilingual semantic retrieval over shared project documentation without sending document contents to a remote embedding API.

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

The only supported model is `Xenova/multilingual-e5-small`, executed locally through `@huggingface/transformers`.

- query input uses the `query: ` prefix
- passage input uses the `passage: ` prefix
- vectors are normalized 384-dimensional float32 values
- model assets use the runtime's user-level cache
- the first query may download model assets when unavailable locally

No provider selection, remote embedding API, or alternate model profile is supported.

## Vector Cache

Derived data is stored below ignored `.dotdotgod/vectors/`:

```text
.dotdotgod/vectors/
├── manifest.json
├── chunks.jsonl
└── embeddings.f32
```

The manifest identifies schema version, model, dimensions, exclusions, chunk count, and refresh statistics. Unchanged chunk fingerprints reuse stored vectors; changed and new chunks are embedded, and deleted chunks are omitted from the rewritten index.

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

Human output is concise. JSON output includes command, root, query, model, dimensions, limit, index metadata, and ranked results.

## Safety and Failure

The command may write only ignored `.dotdotgod/vectors/` cache files and the user-level model cache. It does not modify source, docs, or project config.

Model download, offline, inference, invalid-shape, filesystem, and cache-write failures produce an actionable error and non-zero status. Tests inject a deterministic embedder and must not download the model.

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
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs query . "project documentation" --limit 5 --json`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/commands/query.mjs","packages/cli/src/query/chunks.mjs","packages/cli/src/query/embedder.mjs","packages/cli/src/query/store.mjs","packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","packages/pi/test/load-project-utils.test.ts"],"relatedDocs":["docs/spec/LOAD_PROJECT.md","docs/spec/cli/DISCOVERY.md","docs/arch/EXTENSION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs query . \"project documentation\" --limit 5 --json"]}
```
