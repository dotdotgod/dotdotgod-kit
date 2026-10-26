# Embedding Config

## Purpose

Embedding configuration selects the model or remote service used by `dotdotgod query` and graph-impact semantic retrieval.

## Resolution

One complete profile is selected in this order:

1. `embedding` in project `dotdotgod.config.json`
2. `embedding` in `~/.dotdotgod/config.json`
3. no profile: keyword-only retrieval; no automatic local model selection

Project profiles replace global profiles completely. Profiles are not deep-merged. The global file also retains initialization-time `defaultTemplate`.

Without either profile, query/Load skip model loading, downloads, endpoint calls
and vector indexing without warnings or installation offers. Existing vector
caches do not opt in. Explicit vector search fails with configuration guidance.
Keyword search always skips embeddings. Configured hybrid search retains keyword
fallback with a warning on embedding failure; vector-only search fails visibly.
Graph impact keeps structural evidence and disables its vector overlay when
unconfigured. No relationship expansion or ranking changes are introduced.
Config/status report not-configured with a null profile/provider. Local runtime
installation requires an explicit local profile; installation alone is not opt-in.

## Schema

Supported providers are `local`, `openai-compatible`, and `ollama`. Every profile requires `provider` and `model`.

Remote profiles may set `baseUrl` and one of mutually exclusive `apiKey` or `apiKeyEnv`. Local profiles reject remote connection fields. Arbitrary Hugging Face model IDs are allowed for `local`.

```json
{
  "embedding": {
    "provider": "openai-compatible",
    "model": "text-embedding-3-small",
    "baseUrl": "https://api.openai.com/v1",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

Ollama defaults to `http://localhost:11434` and uses its native `/api/embed` endpoint. OpenAI-compatible providers default to `https://api.openai.com/v1` and use `/embeddings`.

## Input Formatting

Optional `embedding.inputFormat` specifies literal query/document prefixes for
all three providers. If present, it must contain exactly two strings:
`queryPrefix` and `documentPrefix`. Empty strings are valid; whitespace and
newlines are preserved. Unknown fields, partial objects and nonstrings fail
validation. Project profiles still replace global profiles as a whole.

For EmbeddingGemma, add this object inside the selected embedding profile:

```json
{
  "inputFormat": {
    "queryPrefix": "task: search result | query: ",
    "documentPrefix": "title: none | text: "
  }
}
```

Omission preserves E5 formatting (`query: ` and `passage: `), regardless of model
name. For raw-input models or server-owned formatting, explicitly set both
prefixes to empty strings. No model-name guessing or server role fields are used.
Qwen3 users can set queryPrefix to an instruction followed by `\nQuery:` and
use an empty documentPrefix. Consult the actual model/server documentation.

Query, document/code indexing and changed-file impact inputs supply their role
to one embedder boundary. It prefixes once before transport and batch splitting;
existing content is never stripped. Low-level embedder calls without a role
retain raw-input behavior. Dynamic titles, suffixes and templates are unsupported.
Do not configure client prefixes if the server already applies the same format.

## Credentials and Consent

Direct `apiKey` values are supported, but `apiKeyEnv` is recommended for committed projects. Credentials are excluded from output, diagnostics, cache manifests, and profile fingerprints.

Selecting a remote provider in project or global embedding configuration authorizes sending documentation chunks, code metadata (names, signatures, and original documentation comments), queries, and changed-file profiles to its endpoint. No additional per-query consent flag is required. Code implementation bodies are not embedding passages; metadata and comments may still contain sensitive repository information. Use a local provider or keyword-only search when this transmission is not acceptable.

## Optional Local Runtime Installation

Local embeddings first use an ordinarily installed `@huggingface/transformers` package, then a persistent user runtime under `~/.dotdotgod/runtime/embedding/`. Missing runtime does not make Project Load fail: Load returns its documentation map plus an `EMBEDDING_RUNTIME_MISSING` recovery offer. The agent must ask the user before invoking `embedding_install` or `dotdotgod embedding install --confirm`; refusal continues map-only work.

`dotdotgod embedding status [<root>] [--json]` is read-only and offline. `dotdotgod embedding install [<root>] --confirm [--json]` installs the fixed compatible runtime with npm using a fixed prefix and package version. Installation uses network access and dependency install scripts. The configured model may still download on the first subsequent local query. Remote embedding profiles do not require or offer local runtime installation.

## Scope-Safe Persistence

Document/code snapshots and batch checkpoints share one atomically replaced
`vectors/snapshots.json` state file. Only refreshed corpora are pruned, including
empty corpora; candidates always use current chunk metadata. Compatible legacy
artifacts migrate without new passage calls. A project lock serializes builds
with a 30-second wait and confirmed-dead-owner recovery; malformed locks fail
closed and require inspection. Diagnostics include invalidation reason, lock wait,
and per-corpus embedded/reused/recovered counts. Offline regression coverage is
`packages/cli/test/vector-cache-session.test.mjs`, including multiprocess writers.

## Cache and Failures

The vector manifest records provider, model, dimensions, and a secret-free profile fingerprint. Schema version 2 invalidates all schema-1 caches. Output-affecting profile changes rebuild the index. Cache identity includes effective prefixes and a formatting version. Omitted and explicit equivalent E5 formats share identity; object key order does not matter. Query- or document-prefix changes invalidate the cache, and legacy identities without formatting information rebuild once. Credentials remain excluded.

Documentation indexing starts with batches of 16 inputs. Remote HTTP 400/413 token-limit responses split the failed batch in half recursively, preserving input order. A single oversized input fails without further retry; unrelated errors are not retried. Provider response bodies are not exposed in diagnostics.

Vector-only query fails when embedding fails; configured hybrid falls back with a warning. Graph impact reports configured semantic failures as unavailable and continues structurally. Provider errors remain actionable and sanitized.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/query/embedding-config.mjs](../../packages/cli/src/query/embedding-config.mjs)
  - [packages/cli/src/query/embedder.mjs](../../packages/cli/src/query/embedder.mjs)
  - [packages/cli/src/query/store.mjs](../../packages/cli/src/query/store.mjs)
  - [packages/cli/src/commands/query.mjs](../../packages/cli/src/commands/query.mjs)
  - [packages/cli/src/impact/vector-overlay.mjs](../../packages/cli/src/impact/vector-overlay.mjs)
- Verified by:
  - [packages/cli/test/embedding-config.test.mjs](../../packages/cli/test/embedding-config.test.mjs)
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [docs/test/EMBEDDING_CONFIG.md](../test/EMBEDDING_CONFIG.md)
- Related docs:
  - [docs/spec/cli/QUERY.md](cli/QUERY.md)
  - [docs/spec/cli/GRAPH_IMPACT.md](cli/GRAPH_IMPACT.md)
- Design decisions:
  - [docs/arch/EMBEDDING_PROVIDERS.md](../arch/EMBEDDING_PROVIDERS.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/query/embedding-config.mjs","packages/cli/src/query/embedder.mjs","packages/cli/src/query/store.mjs","packages/cli/src/commands/query.mjs","packages/cli/src/impact/vector-overlay.mjs"],"verifiedBy":["packages/cli/test/embedding-config.test.mjs","packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/EMBEDDING_CONFIG.md"],"relatedDocs":["docs/spec/cli/QUERY.md","docs/spec/cli/GRAPH_IMPACT.md"],"designDecisions":["docs/arch/EMBEDDING_PROVIDERS.md"]}
```
