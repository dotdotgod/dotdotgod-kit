# Embedding Config Verification

## Automated Coverage

`packages/cli/test/embedding-config.test.mjs` verifies:

- default, global, and whole-project profile precedence
- arbitrary local model identifiers
- strict query/document input-format fields, literal whitespace/newlines and empty prefixes
- role formatting for OpenAI-compatible/Ollama requests and injected local execution; raw low-level compatibility
- shared formatting for documentation/code indexing, focused/project queries and graph-impact profiles
- equivalent-format/key-order cache identity, changed-prefix invalidation and legacy identity rebuild
- direct and environment credential validation and redaction
- OpenAI-compatible ordered responses
- token-limit batch halving (16 → 8 → 4 → 2), preserved order, no duplicate prefixes, terminal single-input failure, and no retry for authentication or unrelated HTTP 400 errors
- native Ollama responses
- dynamic dimensions and normalized vectors
- schema-1 cache invalidation and schema-2 persistence
- secret-free cache manifests and fingerprints
- persistent runtime missing/installed status without network access, including packages that do not export their `package.json` subpath and rejection of incomplete package installs
- explicit confirmation and fixed no-shell npm install arguments

Existing CLI tests verify incremental chunk reuse, query ranking, malformed vectors, and graph-impact graceful degradation. All provider tests use injected embedders or local HTTP fixtures; CI must not download models or contact external services. Run workspace tests with an isolated HOME so a user's remote global profile cannot change default-model expectations. Live profile changes and reindexing require explicit authorization; offline tests do not prove server-side prompt behavior.

## Scope-Safe Persistence

Document/code snapshots and batch checkpoints share one atomically replaced
`vectors/snapshots.json` state file. Only refreshed corpora are pruned, including
empty corpora; candidates always use current chunk metadata. Compatible legacy
artifacts migrate without new passage calls. A project lock serializes builds
with a 30-second wait and confirmed-dead-owner recovery; malformed locks fail
closed and require inspection. Diagnostics include invalidation reason, lock wait,
and per-corpus embedded/reused/recovered counts. Offline regression coverage is
`packages/cli/test/vector-cache-session.test.mjs`, including multiprocess writers.

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```
