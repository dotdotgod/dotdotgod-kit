# Cache And Index Architecture

The CLI uses `.dotdotgod/` at the project root as the default local cache directory.

- `.dotdotgod/` is ignored by git.
- The cache manifest is `.dotdotgod/manifest.json`.
- Compact graph shards live under `.dotdotgod/graph/nodes/` and `.dotdotgod/graph/edges/`.
- Cache entries use content hashes to detect stale files.
- Cache manifests include a schema version; incompatible schemas are reported as `schema-mismatch` and rebuilt by `index` or lazy-refreshing read commands.
- The index records whether archive bodies were included; default indexes exclude archive bodies.
- `dotdotgod status <root>` reports `missing`, `fresh`, or `stale` from file fingerprints and schema state without rebuilding the graph.
- `dotdotgod index <root>` incrementally rebuilds changed file graph shards when a compatible manifest already exists.
- Graph-facing commands such as `resolve`, `expand`, and `graph ...` lazily refresh missing or stale graph caches before returning output; `query` uses the separate [SQLite retrieval index](../INCREMENTAL_INDEX_ENGINE.md).
- Lazy refresh output includes cache refresh metadata, changed-file counts, elapsed timing, rebuild mode, and cache size details.

`validate --check-index` verifies outline-policy and source freshness in addition to the structural graph manifest. Validation does not refresh either index; where SQLite has not been created, compatible legacy outline files can still be inspected.

The [MCP background worker](../INCREMENTAL_INDEX_ENGINE.md#continuous-mcp-indexing) maintains the SQLite retrieval index independently; it does not rewrite the structural graph manifest or shards. Edit hooks enqueue existing SQLite indexes without creating them. Completion hooks that refresh the structural graph are still optional.

`status --json` and MCP `doctor` expose an `incrementalIndex` snapshot: presence, schema version, queued paths, docs and code chunks, stored vectors, active and tombstoned HNSW nodes, and an optional worker lease (PID, expiry and liveness, never its token). Counts span all stored profiles. These diagnostics do not create index databases or sidecars or repair missing state.

Claude Code and Codex hook examples should prefer `dotdotgod status` for read-only stop-time cache reporting and `dotdotgod validate . --include-local-memory --check-index` for explicit docs validation plus markdown index-fingerprint checks. Hook examples that call `query`, `graph`, `index`, or `verify:cache` must describe the cache-refresh side effect or keep those commands opt-in.

`pnpm run verify:cache` validates docs, runs `dotdotgod index`, and checks `dotdotgod status`; the Husky pre-push hook validates docs through workspace verification, then runs index/status directly to avoid duplicate validation. Both workflows may update ignored cache files locally.

Discovery is gitignore-aware through `git ls-files --cached --others --exclude-standard`, with a conservative directory-walk fallback. Supported files include common docs, package metadata, config, web, and infrastructure formats.

Current extraction covers Markdown headings/links, `json dotdotgod` traceability blocks, README routing links, package metadata/resources, and memory-area membership. Reference expansion reuses indexed graph nodes and edges to resolve prompt-time refs without a new full-repository grep pass. Other supported text files become metadata-only file nodes until routing rules need them.

Graph storage uses compact shards. Community summaries use `leiden-ts` over a weighted durable-node projection, with deterministic domain grouping as fallback. Impact reports use configurable ranking with curated traceability, docs-area routing, package/resource hints, memory policy, score breakdowns, and changed-file PPR. Load builds its documentation map directly from the filesystem rather than exposing graph statistics.
