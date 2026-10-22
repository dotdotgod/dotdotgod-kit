# Context Retention

## Fixed Lifetime

All context-owned SQLite business data expires 86,400,000 milliseconds after
storage, independent of scope or host session. Sources and their FTS chunks,
ingestion job inputs/results/errors/status, and pending impact records are covered.
Schema definitions, indexes and migration history are operational metadata and
do not expire. Original files, CLI caches, JSON hook state and backup files are
outside this policy. Expiry is not secure erasure or guaranteed file-size shrinkage.

Searches, reads, status updates and restarts do not extend expiry. Reindexing
creates new content; observed edits create a new impact revision with a new day.
Job updates retain the original creation deadline; their produced sources have
their own indexing deadlines. Custom ttlMs is removed and rejected, not ignored.

## Cleanup And Jobs

ContextStore startup and content/job operations clean expired rows on access.
Source and chunk deletion is transactional. No periodic cleanup daemon or automatic
VACUUM is installed: inactive databases may retain physical rows until next access.
Doctor remains read-only and does not clean or migrate data.

Expired queued jobs are not claimed; status returns null after expiry. Active
jobs receive cancellation at their deadline. Late completion cannot recreate job
records; fetched content checks cancellation before indexing. Synchronous local
processing is cooperative and does not promise hard real-time interruption.

Impact accesses clean expired pending rows, including other sessions' expired rows.
Expiry is not a successful review: an empty pending list does not prove all edits
were reviewed. Existing successful-review revision/content guards remain.

## Migration

Context schema version 4 sets legacy source and job expiry to original created_at
plus one day, replacing old custom or unlimited lifetimes. Already-old data is
removed at startup before queued-job recovery. Legacy impact rows lack timestamps;
one transaction grants them a day from migration, without renewing on reopen.
Unknown schemas still fail rather than being reset. Healing supports recognized
versions and retains its explicit backup/confirmation behavior.

## Verification

Controlled-clock tests cover boundary expiry, scope parity, no sliding lifetime,
restart, legacy migration, job completion/non-resurrection and impact revisions.
Existing atomic expiry, WAL, doctor and packed-runtime tests remain required.



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/retention.mjs](../../packages/context/src/retention.mjs)
  - [packages/context/src/store.mjs](../../packages/context/src/store.mjs)
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
  - [packages/context/src/jobs.mjs](../../packages/context/src/jobs.mjs)
  - [packages/context/src/content.mjs](../../packages/context/src/content.mjs)
  - [packages/context/src/execute.mjs](../../packages/context/src/execute.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
- Verified by:
  - [packages/context/test/retention.test.mjs](../../packages/context/test/retention.test.mjs)
  - [packages/context/test/store-operations.test.mjs](../../packages/context/test/store-operations.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

## Traceability

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/retention.mjs","packages/context/src/store.mjs","packages/context/src/impact-state.mjs","packages/context/src/jobs.mjs","packages/context/src/content.mjs","packages/context/src/execute.mjs","packages/context/src/server.mjs"],"verifiedBy":["packages/context/test/retention.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
