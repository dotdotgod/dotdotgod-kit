# Context Retention

## Fixed Lifetime

All context-owned SQLite business data expires 86,400,000 milliseconds after
storage, independent of scope or host session. Sources and their FTS chunks,
ingestion job inputs/results/errors/status, and `impact.sqlite` v3 rows
(`pending` impact records, `plan_notices` native plan sync notices, and
`load_state` load assessment records) are covered. Schema definitions, indexes,
and migration history are operational metadata and do not expire. Original files, CLI caches, ignored legacy
`runtime/*.json` files, and backup files are outside this policy. Expiry is not
secure erasure or guaranteed file-size shrinkage.

Searches, reads, status updates, notification claims, and restarts do not extend
expiry. Reindexing creates new content; observed edits create a new impact
revision with a new day; a changed plan artifact hash creates a new notice
deadline while unchanged saves retain the original deadline. Assessment leases,
skips, advice, and marking an existing unexpired load record loaded do not renew
its deadline. Job updates retain their creation deadline; their produced sources
have their own indexing deadlines. Custom ttlMs is removed and rejected, not ignored.

## Cleanup And Jobs

ContextStore startup and content/job operations clean expired rows on access.
Source and chunk deletion is transactional. No periodic cleanup daemon or automatic
VACUUM is installed: inactive databases may retain physical rows until next access.
Doctor remains read-only and does not clean or migrate data.

Expired queued jobs are not claimed; status returns null after expiry. Active
jobs receive cancellation at their deadline. Late completion cannot recreate job
records; fetched content checks cancellation before indexing. Synchronous local
processing is cooperative and does not promise hard real-time interruption.

Impact stores (`impact.sqlite` v3) separate read-only and write paths. The
reserved `default` session ID is rejected case-insensitively before DB access.

- Fast read-only path (`write=false`, `write=False` in Hermes): zero WAL or DDL
  writes, no migration or physical cleanup, and no creation for a missing DB.
  Reads of TTL-aware rows filter on `expires_at > now`; missing `load_state`
  is treated as unloaded.
- Write path (`write=true`): inside `BEGIN IMMEDIATE`, physically deletes
  `expires_at <= now` rows from `pending`, `plan_notices`, and `load_state`
  (including other sessions' rows) before applying the write.

Expiry is not a successful review: an empty pending list does not prove all
edits were reviewed. Existing successful-review revision/content guards remain.

## Migration

Context schema version 4 sets legacy source and job expiry to original created_at
plus one day, replacing old custom or unlimited lifetimes. Already-old data is
removed at startup before queued-job recovery. `impact.sqlite` adds `load_state`
when writing to a v2 store, preserving unexpired pending edits and plan notices.
Legacy v0/v1 pending columns and missing tables are migrated idempotently on
write, not on read. Legacy pending rows without expiry receive a one-day TTL;
Node can anchor it to the store instance's first observation, while Hermes
anchors it to migration. Healing retains its explicit backup/confirmation behavior.

## Verification

Controlled-clock tests cover boundary expiry, scope parity, no sliding lifetime,
restart, legacy migration, read-only filtering, job completion/non-resurrection,
`pending` / `plan_notices` revisions, and fixed `load_state` expiry. Existing atomic
expiry, WAL, doctor, and packed-runtime tests remain required.



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
  - [packages/context/src/session.mjs](../../packages/context/src/session.mjs)
  - [packages/hermes/impact.py](../../packages/hermes/impact.py)
- Verified by:
  - [packages/context/test/retention.test.mjs](../../packages/context/test/retention.test.mjs)
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/store-operations.test.mjs](../../packages/context/test/store-operations.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/hermes/test/test_runtime.py](../../packages/hermes/test/test_runtime.py)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

## Traceability

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/retention.mjs","packages/context/src/store.mjs","packages/context/src/impact-state.mjs","packages/context/src/jobs.mjs","packages/context/src/content.mjs","packages/context/src/execute.mjs","packages/context/src/server.mjs","packages/context/src/session.mjs","packages/hermes/impact.py"],"verifiedBy":["packages/context/test/retention.test.mjs","packages/context/test/impact-state.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/mcp.test.mjs","packages/hermes/test/test_runtime.py"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/spec/ADVISORY_IMPACT.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
