# @dotdotgod/cli

Command-line tools for dotdotgod project memory.

## Commands

```bash
dotdotgod validate .
dotdotgod status .
dotdotgod index .
dotdotgod load-snapshot .
dotdotgod graph query . --changed <path>
dotdotgod graph communities .
```

`validate` replaces the previous standalone docs validator package. Graph indexing currently extracts a deterministic first-pass graph from Markdown headings/links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, and metric-event string literals. The cache uses `.dotdotgod/manifest.json` plus compact graph shards under `.dotdotgod/graph/` so larger long-running projects do not require one giant JSON file. `status` is read-only and reports whether the cache is missing, fresh, or stale. `load-snapshot` and `graph` commands lazily refresh a missing/stale cache before producing agent-facing output and include `metadata.cacheRefreshed` plus refresh details in JSON output when that happens. `graph query` returns a bounded impact report grouped into files, docs, tests, commands, events, package resources, and symbols. `graph communities` projects durable graph nodes into weighted edges and runs Leiden community detection through `leiden-ts` with a deterministic fallback to domain grouping for tiny or invalid graphs.
