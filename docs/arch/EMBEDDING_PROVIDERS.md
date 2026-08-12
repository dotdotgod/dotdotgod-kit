# Embedding Providers

## Boundary

Embedding configuration resolution, provider execution, index orchestration, and cache persistence are separate concerns.

- `query/embedding-config.mjs` resolves and validates the whole effective profile.
- `query/embedder.mjs` owns local model initialization and remote transport.
- `commands/query.mjs` owns chunks, batching, incremental reuse, and ranking.
- `query/store.mjs` owns provider-aware cache validation and atomic persistence.
- `impact/vector-overlay.mjs` reuses the resolved index/provider.

The provider interface returns ordered, finite, consistently sized, normalized vectors. Local pipelines are cached by model ID rather than globally so multiple projects can use different models in one process.

## Cache Identity

The cache fingerprint includes output-affecting profile fields but excludes `apiKey` and `apiKeyEnv`. Dimensions are learned from provider output and stored in the manifest. Schema mismatches and profile changes rebuild the full vector cache; chunk-level reuse applies only within the same schema and profile.

## Remote Safety

Remote providers receive repository-derived text only after explicit profile selection. Transport uses a bounded timeout and does not include response bodies in surfaced errors. Authentication values are consumed only for request construction and are never returned by config inspection.

Provider-specific input differences remain inside adapters. Public configuration does not expose arbitrary headers, request templates, normalization switches, prefixes, or batch tuning.
