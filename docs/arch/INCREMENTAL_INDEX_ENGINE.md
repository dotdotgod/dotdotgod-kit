# Incremental Index Engine

## SQLite Is Authoritative

The derived project-local `.dotdotgod/index.sqlite` uses Node's `DatabaseSync`,
WAL journal mode and schema version 1. No new runtime dependency is required.
The structural graph manifest and the advisory impact store remain separate.

- `files` records path, source hash, stat tuple, extraction status, and imports.
  `symbols`, `chunks` and `chunks_fts` are replaced with their file in one
  transaction. `dir_hashes` contains directory Merkle digests.
- `vectors` stores the secret-free profile fingerprint, passage fingerprint,
  dimensions and packed Float32 BLOB. Pending and published corpus membership
  are separate. Each successful remote batch is one SQLite commit; a completed
  refresh publishes only its selected corpus membership. Isolated local aborts
  discard staged vectors. Neither path rewrites a monolithic vector snapshot.
- `hnsw_nodes` maps stable vector IDs to graph nodes and tombstones. `meta`
  records corpus counts, extraction policy, migration state and graph generations.
  `dirty_queue` holds unique paths pending background reconciliation.

The first writer imports compatible legacy outlines, version-1 vector snapshots
(including pending rows), or the version-2 manifest/chunks/BLOB trio without an
embedding call. Readers do not migrate. An unowned legacy build lock defers the
vector migration; new SQLite readers never consult it for committed data.

Foreground writers set a 5-second SQLite busy timeout; background and hook
writers try without waiting. Readers use an existing
WAL snapshot with zero busy timeout, or immutable mode for a checkpointed DB.
An incomplete set of WAL sidecars is unavailable to read-only callers. Readers
neither take the vector build lock nor create or repair graph artifacts.
Symlinked database/cache paths are refused.

## Change Detection And Lexical Retrieval

With a usable Git baseline, changed working-tree paths come from NUL-delimited
`git diff --name-status` and `git status` (including untracked paths). Previous
working-tree changes are revisited to detect reverts. Missing baselines, parser
or ignore-policy changes, and non-Git projects use eligible-file discovery.
The size/mtime/inode tuple avoids reopening unchanged files; explicit validation
independently hashes source bytes. File edits rehash only ancestor directories;
each such hash reads that directory's sorted immediate children, so the cost
also depends on their fan-out. File discovery, Gitignore and configured scope
rules stay separate from vector membership.

FTS5 uses `unicode61 remove_diacritics 2`, split identifiers and CJK/Hangul
bigrams. BM25 ranks lexical candidates; name and qualified-name B-tree lookups
supply exact-name priority. Scope and current-path checks apply before candidates
are returned. Relationship evidence loads symbol/import data for at most 30
result files; relative import targets use point lookups in indexed file paths.

## Adaptive Vector Retrieval

Below 2,000 committed vectors the reader uses exact cosine search. At larger
sizes it can use the profile's pure-JS HNSW graph (`M=16`, `M0=32`,
`efConstruction=100`). Base search uses `efSearch=max(64, 4*k)`; integrated
retrieval widens the beam to allow scope and tombstone filtering. Tombstoned
nodes can still connect the search, but are not returned. A missing graph,
generation mismatch or unusually selective scope can require an exact scan.

A 64-byte `DDGHNSW1` header precedes binary Float32 and integer slabs containing
vectors, node IDs, layer adjacency and tombstones. A framed `.wal` records
incremental inserts/deletes beyond the `.bin` checkpoint. SQLite publishes the
committed graph generation; readers use only that prefix, ignoring appended
uncommitted frames. If compaction replaced the checkpoint during an older read,
that reader falls back to its SQLite snapshot. On a writable refresh, derived
files can be rebuilt from SQLite. Compaction triggers above 20% tombstones with
at least 500 deletions and atomically replaces the binary checkpoint. Warm handles
are cached in-process by project, profile, SQLite instance and generation.

## Continuous MCP Indexing

The stdio MCP server starts background maintenance after client-root negotiation
succeeds (or immediately after initialization with an explicit root or a client
without roots support). Failed negotiation leaves foreground tools available
without starting maintenance. The root must be initialized, have valid config
and a real documentation directory, and allow `indexing.watch`. Discovery,
SQLite writer opens and HNSW writes run in a Node worker thread, not on the
MCP request loop. Root switches and shutdown revoke outstanding work before
draining it.

One session per root claims `meta.worker_lease` in a SQLite write transaction.
It renews every 4 seconds with a 10-second expiry; a dead PID can be replaced
before expiry. Standbys poll read-only and never watch or index while another
leader is active. The leader releases the lease on orderly close and checks its
token before publishing work that crossed an asynchronous boundary.

Startup catch-up uses Git or a stat-cache walk. Recursive OS watches on
macOS/Windows and capped directory watches on Linux add eligible changes.
Watch exhaustion falls back to edit-hook notifications in `dirty_queue`.
Tier 1 debounces for 200 ms, drains up to 20 files per tick and yields between
files. Changed files update outlines, FTS, directory digests and obsolete vector
membership. Prepared queries can read committed work without the build lock.

Tier 2 debounces for 1,500 ms and only runs with a configured embedding profile
and `indexing.backgroundEmbeddings` enabled. It publishes up to 16 vectors per
batch, docs before code, with cooperative yields and the same SQLite/HNSW
writer as foreground queries. Paths, file stats, profile and policy are
rechecked before sending content and before committing a response; local memory,
hidden or secret-like paths, and current exclusions are not sent. Transient
rate-limit, network and timeout failures back off; fatal authentication or
runtime errors stop background embeddings without installing dependencies.
Tier 1 continues when Tier 2 is disabled or stops.
