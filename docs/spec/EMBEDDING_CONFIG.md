# Embedding Config

## Purpose

Embedding configuration selects the model or remote service used by `dotdotgod query` and graph-impact semantic retrieval.

## Resolution

One complete profile is selected in this order:

1. `embedding` in project `dotdotgod.config.json`
2. `embedding` in `~/.dotdotgod/config.json`
3. built-in `{ "provider": "local", "model": "Xenova/multilingual-e5-small" }`

Project profiles replace global profiles completely. Profiles are not deep-merged. The global file also retains initialization-time `defaultTemplate`.

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

## Credentials and Consent

Direct `apiKey` values are supported, but `apiKeyEnv` is recommended for committed projects. Credentials are excluded from output, diagnostics, cache manifests, and profile fingerprints.

Selecting a remote provider authorizes sending documentation chunks, queries, and changed-file profiles to its endpoint. No additional consent flag is required.

## Optional Local Runtime Installation

Local embeddings first use an ordinarily installed `@huggingface/transformers` package, then a persistent user runtime under `~/.dotdotgod/runtime/embedding/`. Missing runtime does not make Project Load fail: Load returns its documentation map plus an `EMBEDDING_RUNTIME_MISSING` recovery offer. The agent must ask the user before invoking `dotdotgod_embedding_install` or `dotdotgod embedding install --confirm`; refusal continues map-only work.

`dotdotgod embedding status [<root>] [--json]` is read-only and offline. `dotdotgod embedding install [<root>] --confirm [--json]` installs the fixed compatible runtime with npm using a fixed prefix and package version. Installation uses network access and dependency install scripts. The configured model may still download on the first subsequent local query. Remote embedding profiles do not require or offer local runtime installation.

## Cache and Failures

The vector manifest records provider, model, dimensions, and a secret-free profile fingerprint. Schema version 2 invalidates all schema-1 caches. Output-affecting profile changes rebuild the index.

`query` fails when embedding fails. Graph impact reports semantic retrieval as unavailable and continues with structural evidence. Remote authentication, rate-limit, timeout, malformed JSON, count, dimensions, and vector validity errors must be actionable and sanitized.

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
