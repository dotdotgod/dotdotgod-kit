# Embedding Providers

## Boundary

Embedding configuration resolution, provider execution, index orchestration, and cache persistence are separate concerns.

- `query/embedding-config.mjs` resolves and validates the whole effective profile.
- `query/embedder.mjs` owns role-based input formatting, local initialization and remote transport.
- `commands/query.mjs` owns chunks, batching, incremental reuse, and ranking.
- `query/store.mjs` owns provider-aware cache validation and atomic persistence.
- `impact/vector-overlay.mjs` reuses the resolved index/provider.

The provider interface returns ordered, finite, consistently sized, normalized vectors. Local pipelines are cached by model ID rather than globally so multiple projects can use different models in one process.

## Cache Identity

The cache fingerprint canonically orders provider/model/endpoint and includes effective query/document prefixes plus a formatting version, but excludes `apiKey` and `apiKeyEnv`. Equivalent omitted/explicit E5 formats share identity. Legacy identities and either prefix changing trigger a rebuild. Dimensions are learned from provider output and stored in the manifest. Schema mismatches and profile changes rebuild the full vector cache; chunk-level reuse applies only within the same schema and profile.

## Scope-Safe Persistence

Document/code snapshots and batch checkpoints share one atomically replaced
`vectors/snapshots.json` state file. Only refreshed corpora are pruned, including
empty corpora; candidates always use current chunk metadata. Compatible legacy
artifacts migrate without new passage calls. A project lock serializes builds
with a 30-second wait and confirmed-dead-owner recovery; malformed locks fail
closed and require inspection. Diagnostics include invalidation reason, lock wait,
and per-corpus embedded/reused/recovered counts. Offline regression coverage is
`packages/cli/test/vector-cache-session.test.mjs`, including multiprocess writers.

## Remote Safety

Remote providers receive repository-derived text only after explicit profile selection. Project or global remote profile selection authorizes documentation, code metadata (names, signatures, and original documentation comments), queries, and changed-file profiles without separate per-query consent. Code implementation bodies are not embedding passages. Transport uses a bounded timeout and does not include response bodies in surfaced errors. Authentication values are consumed only for request construction and are never returned by config inspection.

Model-specific literal prefixes are configured in embedding.inputFormat. Product callers send raw texts with a query/document role; the embedder applies prefixes once before transport or token-limit splitting. Low-level calls without roles stay raw. Empty prefixes support raw/server-formatted inputs; model aliases never select implicit presets. Public configuration still excludes arbitrary headers, request templates, normalization switches and batch tuning. Server-side preprocessing must not duplicate client prefixes.
