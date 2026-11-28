# Release 0.12.1

## Prepared-Only Load And Incremental Background Indexing

Release `0.12.1` decouples project-memory loading from index builds, replaces monolithic JSON cache rewrites with incremental SQLite and vector indexes, and adds real-time background indexing to the stdio MCP server (`7de13ac`).

- **Phase 1: Load Decoupling**:
  - Adds the `--prepared-only` query policy and a lock-free snapshot reader so Load can use an existing index without starting a build or waiting for a writer lock.
  - Applies a pre-traversal docs-root guard across MCP `project_load`, Pi `/load`, Hermes, and the shared load workflow.
- **Phase 2: Unified SQLite Store & Adaptive Vector Index**:
  - Uses built-in `node:sqlite` in WAL mode, with FTS5 BM25 ranking and B-tree lookups for lexical search, and Git, Merkle, and stat caches to detect changes.
  - Adds an adaptive pure-JS HNSW binary index, migrates legacy vectors without re-embedding, and hardens read-only opens against initialization races.
- **Phase 3: MCP Background Indexing**:
  - Runs a two-tier `BackgroundIndexWorker` on a worker thread in the stdio MCP server, with a SQLite lease that limits indexing to one leader per project.
  - Combines OS file watches, hook updates to `dirty_queue`, and Git catch-up, with docs-first debounced embeddings, optional indexing configuration switches, and read-only `status` and `doctor` telemetry.

## Version Alignment And Verification

Workspace packages (`@dotdotgod/cli`, `@dotdotgod/pi`, `@dotdotgod/obsidian`) and Obsidian metadata (`manifest.json`, `versions.json`, minimum Obsidian `1.14.5`) align to `0.12.1`. Verification covers full workspace `pnpm run verify` (`@dotdotgod/cli`: 474 Node and 26 Hermes tests; `@dotdotgod/pi`: 344 tests and `tsc`; `@dotdotgod/obsidian`: 12 tests), documentation validation, and `pack:dry-run`.
