# Query Command

## Purpose And Interface

Query searches full project documentation and code outlines/documentation comments.
Code implementation bodies are not search passages. Default retrieval is hybrid
keyword/vector over both corpora.

```text
dotdotgod query <root> <query> [--limit <1..100>] [--scope docs|code|all]
  [--search hybrid|keyword|vector] [--json]
```

- Root is the repository root; remaining free-form arguments form the query.
- Default scope is all, search is hybrid, limit is 30.
- Limit counts documentation files and individual code symbols; multiple methods
  from one file can appear. Missing query/invalid flags exit with usage status 2.
- Explicit docs scope retains documentation-only retrieval. Keyword mode does not
  initialize an embedder, download a model or contact an embedding provider.

## Corpus And Index

Documentation follows documentation.root and load.documentationSummary.exclude,
excluding plan/archive bodies by default. Full Markdown content is split by heading
and into 1,600-character body pieces; path/heading metadata is prepended.

Code records come from the shared outline cache, with name, ownership, syntactic
signature, real doc comment, source hash and one-based inclusive declaration/body
ranges. See [CODE_OUTLINES.md](CODE_OUTLINES.md) for extraction, coverage and safety.
Original code doc comments are retained without generated summaries or inferred types.

Search and index refresh outlines incrementally. Validation only checks freshness.
Unchanged searchable passages reuse vectors even when source ranges change.
Vector cache stays under ignored .dotdotgod/vectors with schema/provider/model/
dimension/profile identities and normalized float vectors. Missing/corrupt or
incompatible caches rebuild. Writes use temporary files and atomic artifact rename.

## Scope-Safe Vector Persistence

Document and code snapshots are separate logical corpora in the atomic
`.dotdotgod/vectors/snapshots.json` state file. Refresh replaces only selected
corpora, including clearing empty corpora; current chunks alone become candidates.
Compatible legacy vector artifacts migrate without passage re-embedding.
Successful batches checkpoint separately from completed snapshots and resume by
profile and passage fingerprint. A project build lock serializes writers, waits
up to 30 seconds, and recovers a confirmed dead process owner. Malformed locks
fail closed after timeout; manual inspection may be required. Diagnostics report
missing/corrupt/schema/profile reasons, lock wait, and per-corpus embedded, reused
and recovered counts without credentials or provider response bodies.
The offline `vector-cache-session.test.mjs` covers scope preservation, empty
pruning, batch recovery, corrupt state and multiprocess serialization.

## Retrieval

- Keyword candidates independently match names, signatures, original comments and
  complete documentation chunk text. Camel-case identifiers are tokenized; an exact
  symbol name/qualified-name match has priority.
- Vector mode scans normalized vectors by exact cosine similarity.
- Hybrid combines independently ranked candidates by reciprocal-rank fusion
  (constant 60), with stable ID ties, then deduplicates docs by path and code by ID.
- Hybrid embedding failure returns keyword results with an explicit warning.
  Vector-only failure remains fatal.
- This is lexical candidate ranking, not a full BM25 engine or inferred call graph.

Embeddings require an explicit project/global profile; unconfigured hybrid uses
keywords silently and vector-only requests fail. No automatic model is selected.
Local, OpenAI-compatible and Ollama profiles remain supported. Inputs use their respective
embedding.inputFormat prefixes at the shared embedder boundary; format changes
invalidate vector reuse. Omitted formatting preserves E5 prefixes. Selecting a remote provider authorizes embedding both
documentation and code metadata without additional per-query consent. Code metadata
includes names, signatures, and original documentation comments, not implementation bodies.
See [../EMBEDDING_CONFIG.md](../EMBEDDING_CONFIG.md). Tests inject deterministic vectors.

## Output And Relationships

Human output shows path, optional symbol range, heading, score and a short excerpt.
JSON retains typed results, original metadata and retrieval evidence. It includes
scope/search, provider/model when used, index information, outline refresh counts,
non-parsed/unsupported file diagnostics and vector fallback warnings.

Code results include bounded structural/file-import relationship evidence (up to
10 edges per result), derived from the same outline metadata. Unresolved imports
are syntax evidence, not resolved dependencies. No call edges are inferred.

Query writes only derived caches; it never edits source/docs/config or installs
an LSP server. Unsupported files and partial parses are reported, not claimed as
fully extracted. Source ranges must be hash-verified before implementation reads.

## Internal Compatibility

queryDocumentation/buildVectorIndex remain documentation-first internal APIs.
Graph impact's vector overlay continues its documentation candidate semantics;
CLI runQuery uses queryProject for the expanded default contract.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/commands/query.mjs](../../../packages/cli/src/commands/query.mjs)
  - [packages/cli/src/query/hybrid.mjs](../../../packages/cli/src/query/hybrid.mjs)
  - [packages/cli/src/query/chunks.mjs](../../../packages/cli/src/query/chunks.mjs)
  - [packages/cli/src/query/store.mjs](../../../packages/cli/src/query/store.mjs)
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
- Verified by:
  - [packages/cli/test/symbol-query.test.mjs](../../../packages/cli/test/symbol-query.test.mjs)
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [packages/pi/test/load-project-utils.test.ts](../../../packages/pi/test/load-project-utils.test.ts)
- Related docs:
  - [docs/spec/cli/CODE_OUTLINES.md](CODE_OUTLINES.md)
  - [docs/spec/LOAD_PROJECT.md](../LOAD_PROJECT.md)
  - [docs/spec/cli/DISCOVERY.md](DISCOVERY.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/commands/query.mjs","packages/cli/src/query/hybrid.mjs","packages/cli/src/query/chunks.mjs","packages/cli/src/query/store.mjs","packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/symbol-query.test.mjs","packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","packages/pi/test/load-project-utils.test.ts"],"relatedDocs":["docs/spec/cli/CODE_OUTLINES.md","docs/spec/LOAD_PROJECT.md","docs/spec/cli/DISCOVERY.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
