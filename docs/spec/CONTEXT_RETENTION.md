# Context Retention

## Fixed Lifetime

All context-owned SQLite business data expires 86,400,000 milliseconds after
storage, independent of scope or host session. Sources and their FTS chunks,
ingestion job inputs/results/errors/status, and `impact.sqlite` v2 rows
(`pending` impact records and `plan_notices` native plan sync notices) are
covered. Schema definitions, indexes and migration history are operational
metadata and do not expire. Original files, CLI caches, ignored legacy
`runtime/*.json` files, and backup files are outside this policy. Expiry is not
secure erasure or guaranteed file-size shrinkage.

Searches, reads, status updates, notification claims, and restarts do not extend
expiry. Reindexing creates new content; observed edits create a new impact
revision with a new day; a changed plan artifact hash creates a new notice
deadline while unchanged saves retain the original deadline. Job updates retain
the original creation deadline; their produced sources have their own indexing
deadlines. Custom ttlMs is removed and rejected, not ignored.

## Cleanup And Jobs

ContextStore startup and content/job operations clean expired rows on access.
Source and chunk deletion is transactional. No periodic cleanup daemon or automatic
VACUUM is installed: inactive databases may retain physical rows until next access.
Doctor remains read-only and does not clean or migrate data.

Expired queued jobs are not claimed; status returns null after expiry. Active
jobs receive cancellation at their deadline. Late completion cannot recreate job
records; fetched content checks cancellation before indexing. Synchronous local
processing is cooperative and does not promise hard real-time interruption.

Impact stores (`impact.sqlite` v2) separate read-only and write paths:

- Fast read-only path (`write = false`): if `impact.sqlite` does not exist,
  returns empty without creating files or directories. When v2 schema is already
  present, queries filter with `WHERE expires_at > ?` without opening
  `BEGIN IMMEDIATE` or physically deleting rows.
- Write path (`write = true`): inside `BEGIN IMMEDIATE`, physically deletes
  `expires_at <= now` rows from both `pending` and `plan_notices` (including
  other sessions' expired rows) before applying the write.

Expiry is not a successful review: an empty pending list does not prove all
edits were reviewed. Existing successful-review revision/content guards remain.

## Migration

Context schema version 4 sets legacy source and job expiry to original created_at
plus one day, replacing old custom or unlimited lifetimes. Already-old data is
removed at startup before queued-job recovery. For `impact.sqlite`, legacy v0/v1
stores missing `created_at`, `expires_at`, `notified`, or `plan_notices` migrate
idempotently inside one `BEGIN IMMEDIATE` transaction (even on a read-only open),
granting legacy `pending` rows a day from migration without renewing on reopen.
Unknown schemas still fail rather than being reset. Healing supports recognized
versions and retains its explicit backup/confirmation behavior.

## Verification

Controlled-clock tests cover boundary expiry, scope parity, no sliding lifetime,
restart, legacy migration, fast read-only filtering, job completion/non-resurrection,
and `pending` / `plan_notices` revisions. Existing atomic expiry, WAL, doctor,
and packed-runtime tests remain required.



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
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/store-operations.test.mjs](../../packages/context/test/store-operations.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

## Traceability

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/retention.mjs","packages/context/src/store.mjs","packages/context/src/impact-state.mjs","packages/context/src/jobs.mjs","packages/context/src/content.mjs","packages/context/src/execute.mjs","packages/context/src/server.mjs"],"verifiedBy":["packages/context/test/retention.test.mjs","packages/context/test/impact-state.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/spec/ADVISORY_IMPACT.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
