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

## Remote Safety

Remote providers receive repository-derived text only after explicit profile selection. Transport uses a bounded timeout and does not include response bodies in surfaced errors. Authentication values are consumed only for request construction and are never returned by config inspection.

Model-specific literal prefixes are configured in embedding.inputFormat. Product callers send raw texts with a query/document role; the embedder applies prefixes once before transport or token-limit splitting. Low-level calls without roles stay raw. Empty prefixes support raw/server-formatted inputs; model aliases never select implicit presets. Public configuration still excludes arbitrary headers, request templates, normalization switches and batch tuning. Server-side preprocessing must not duplicate client prefixes.
