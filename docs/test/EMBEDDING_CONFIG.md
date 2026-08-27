# Embedding Config Verification

## Automated Coverage

`packages/cli/test/embedding-config.test.mjs` verifies:

- default, global, and whole-project profile precedence
- arbitrary local model identifiers
- direct and environment credential validation and redaction
- OpenAI-compatible ordered responses
- native Ollama responses
- dynamic dimensions and normalized vectors
- schema-1 cache invalidation and schema-2 persistence
- secret-free cache manifests and fingerprints
- persistent runtime missing/installed status without network access, including packages that do not export their `package.json` subpath and rejection of incomplete package installs
- explicit confirmation and fixed no-shell npm install arguments

Existing CLI tests verify incremental chunk reuse, query ranking, malformed vectors, and graph-impact graceful degradation. All provider tests use injected embedders or local HTTP fixtures; CI must not download models or contact external services.

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs config . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```
