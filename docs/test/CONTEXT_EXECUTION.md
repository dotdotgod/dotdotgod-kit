# Context Execution Verification

## Automated Coverage

`packages/cli/test/context/context.test.mjs` covers end-to-end execution and retrieval contracts: bounded overlapping generic chunks, FTS5 indexing/ranked search/scope filters/purge, small direct vs large indexed output, ordered single/multi `execute` batches under concurrency, file ingestion without raw source bytes, and destructive purge selector validation.

Focused unit and hardening suites cover:

- `impact-path.test.mjs` (`IP-01`..`IP-04`): `resolveDocumentationRoot` validation (`256 KiB` pass vs `+1 B` fallback, symlink/dir/corrupt JSON, traversal/dot-segment/control-char/external-symlink rejections falling back to `'docs'`), `impactPath` exclusions (`<docRoot>/(plan|archive)` and 6 build/cache dirs while preserving `<docRoot>/post`), and `impactReminder` post-`JSON.stringify` C1/separator/bidi escaping, 200-char/8-item caps (`status.count - shown.length`), `"does not block"`, and untrusted-data notice.
- `impact-state.test.mjs` + `retention.test.mjs` (`IS-01`..`IS-05`): `impact.sqlite` schema compatibility (`journal_mode === 'wal'`, `pending.notified`, 5-column `plan_notices`, no `pending(expires_at)` index), legacy read compatibility without migration on read, read-only fast path (`write = false` creates nothing on missing DB and filters `expires_at > now` without write locks), `mark()` `{ becameNonEmpty }`, `clearPaths()` session isolation, 2-process `claimUnnotified()` concurrency (disjoint claims + re-edit reset), and `plan_notices` dedup/clear/24h TTL.
- `hooks.test.mjs` (`HK-01`..`HK-05`) and `hooks-antigravity.test.mjs` (`AG-01`..`AG-03`): non-blocking advisory hooks across Claude Code, Codex, and Antigravity. See [`HOOKS.md`](HOOKS.md) and [`ANTIGRAVITY_ADAPTER.md`](ANTIGRAVITY_ADAPTER.md).
- `chunks.test.mjs`, `provenance.test.mjs`, `rank.test.mjs`, `search-recovery.test.mjs`: structural Markdown/JSON chunking, operation-owned trust/spoof prevention, RRF ranking, and failure diagnostic/wildcard browsing ([recovery contract](../spec/CONTEXT_SEARCH_RECOVERY.md)).
- `safe-fetch.test.mjs`, `directory-ingestion.test.mjs`, `html-normalize.test.mjs`, `environment-policy.test.mjs`: DNS/peer/redirect/byte limits, directory traversal budgets, active HTML stripping, and child environment filtering.
- `doctor.test.mjs`, `store-operations.test.mjs`, `phase3.test.mjs`, `package-audit.test.mjs`: read-only diagnostics, WAL/transactional rollback, migration ledger, durable job runner, backup-before-heal, and package export/license audit.

`packages/cli/test/context/mcp.test.mjs` + `presentation.test.mjs` (`MC-01`..`MC-02`) start the real stdio server and verify:

- MCP initialization, full 19-tool `tools/list`, and clean JSON-RPC stdout;
- **MCP `roots/list` workspace resolution**: resolving the default project root from client `roots/list` (and `notifications/roots/list_changed`) when `DOTDOTGOD_PROJECT_ROOT` is unset;
- **`sessionBound` & `guidance` contract** (in an isolated `test()` with fresh temp root): unbound `impact_status` and `project_impact.impactStatus` return `sessionBound: false` with static single-line `guidance` (`<= 120` chars, no path/UUID leakage) without creating `impact.sqlite`; bound sessions (`contextSessionId` / `DOTDOTGOD_SESSION_ID` / `session_resume`) return `sessionBound: true` with `guidance: undefined`; `presentation.test.mjs` verifies inline `guidance` rendering.

[`runtime-smoke.test.mjs`](../../packages/cli/test/adapters/runtime-smoke.test.mjs) runs the installed host entrypoints in pinned and PATH modes against the shared runtime. [`bin-dispatch-and-bridge.test.mjs`](../../packages/cli/test/context/bin-dispatch-and-bridge.test.mjs) covers lazy dispatch, fail-open hooks and the Hermes stdio bridge. [`packaging-contract.test.mjs`](../../packages/cli/test/adapters/packaging-contract.test.mjs) installs the CLI and Pi tarballs together outside the workspace, checks all nine CLI exports, and rejects duplicate legacy runtime bundles or Python bytecode.

Pi verification covers alias-free MCP registration, envelopes, and nested calls. See [OpenCode coverage](OPENCODE_ADAPTER.md), [Hermes coverage](HERMES_ADAPTER.md), and [Antigravity coverage](ANTIGRAVITY_ADAPTER.md).

## Pi Native And Codemode Workflows

- `packages/pi/test/context-workflow.test.ts` and `context-codemode.test.ts` run public Pi SDK (`1.0.0`) sessions with an isolated loader, real host MCP extension, and faux stream: direct/indexed output, source/scope isolation, codemode envelopes, nested hooks, policy rejection, and abort/shutdown cleanup.
- `context-tools.test.ts`: automatic-load retry, compact narrative, baseline routing, and Help guidance.

```bash
node --test --experimental-strip-types packages/pi/test/context-workflow.test.ts packages/pi/test/context-codemode.test.ts
```

## Opt-In Model Selection Evaluation

`packages/pi/scripts/evaluate-context-tools.mjs` runs disposable fixture tasks against a configured model (not a CI test; may incur usage charges). Compare eligible command selection, source-scoped retrieval, fixture accuracy, and model-visible bytes; failed retrieval never proves absent diagnostics.

## Required Regression Cases

Preserve focused coverage for:

- process nonzero exit, spawn failure, timeout, abort, process-group cleanup, and environment policy across command/batch/file execution;
- direct/indexed output threshold, Unicode/binary-like bytes, and response-size bounds;
- concurrent SQLite WAL/busy handling, fixed 24-hour TTL expiry, atomic purge, and v1→v2 migration;
- provenance spoof prevention, `instructionAuthority: "none"`, scope filtering before RRF, and structural chunk bounds;
- directory escape/symlink/special-file limits, HTML stripping, safe-fetch DNS/redirect/byte/MIME limits, and read-only `doctor`;
- `impact.sqlite` v3 advisory hooks: invalid session fail-open, symlinked config/marker rejection, workspace segment boundaries, 2-process `claimUnnotified`, `clearPaths` on success vs retention on `isError`/error, third-party MCP rejection, legacy `runtime/*.json` ignore, and Antigravity Option C-2 `readArtifactBounded` safety;
- packed CLI and Pi installs without workspace dependencies, and thin installed host integration smoke.

## Manual Adapter Verification

Follow [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md) for Claude Code, Codex, Antigravity, Hermes, and Pi live verification. Safe-fetch integration tests require an explicit private-network override in controlled fixtures; production defaults always reject private/reserved addresses.

## Commands

```bash
pnpm --filter @dotdotgod/cli run verify
pnpm --filter @dotdotgod/pi run verify
pnpm run verify:generated
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
pnpm run pack:dry-run
```
