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
- Agent-facing read commands such as `load-snapshot` and `graph ...` lazily refresh missing or stale caches before returning output.
- Lazy refresh output includes cache refresh metadata, changed-file counts, elapsed timing, rebuild mode, and cache size details.

Completion hooks that refresh the index are optional. The default workflow relies on lazy refresh and avoids mutating the cache after every task.

Claude Code and Codex hook examples should prefer `dotdotgod status` for read-only stop-time cache reporting and `dotdotgod validate . --include-local-memory --check-index` for explicit docs validation plus markdown index-fingerprint checks. Hook examples that call `load-snapshot`, `graph`, `index`, or `verify:cache` must describe the cache-refresh side effect or keep those commands opt-in.

`pnpm run verify:cache` validates docs, runs `dotdotgod index`, and checks `dotdotgod status`; the Husky pre-push hook runs this gate and may update ignored cache files locally.

Discovery is gitignore-aware through `git ls-files --cached --others --exclude-standard`, with a conservative directory-walk fallback. Supported files include common docs, package metadata, config, web, and infrastructure formats.

Current extraction covers Markdown headings/links, `json dotdotgod` traceability blocks, README routing links, package metadata/resources, and memory-area membership. Reference expansion reuses indexed graph nodes and edges to resolve prompt-time refs without a new full-repository grep pass. Other supported text files become metadata-only file nodes until routing rules need them.

Graph storage uses compact shards. Community summaries use `leiden-ts` over a weighted durable-node projection, with deterministic domain grouping as fallback. Impact reports use configurable ranking with curated traceability, docs-area routing, package/resource hints, memory policy, score breakdowns, and changed-file PPR. Load snapshots expose bounded quality, community, memory-area, archive-policy, and command-guidance summaries.
