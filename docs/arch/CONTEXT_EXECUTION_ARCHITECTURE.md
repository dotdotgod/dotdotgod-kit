# Context Execution Architecture

## Direction

Use one shared runtime package, thin transport/adapter wrappers, and platform-native lifecycle integration with unified non-blocking advisory impact.

```text
@dotdotgod/cli (src/context/)
├── process capture, file/directory ingestion, and safe fetch
├── structural chunking, provenance, ranking, and FTS5 storage
├── read-only runtime diagnostics and project workflow services
├── impact-path.mjs + impact-state.mjs (v3 WAL SQLite advisory store)
├── hook-state.mjs + hooks.mjs + hooks-antigravity.mjs (fail-open hooks)
└── stdio MCP server (roots/list workspace resolution + sessionBound)

Pi          ── host-managed MCP + native plan/load + impact.sqlite
OpenCode    ── plugin-registered MCP + native plan + impact.sqlite
Claude Code ── shared stdio MCP + advisory hooks (SessionStart/UserPromptSubmit/PostToolUse)
Codex       ── shared stdio MCP + advisory hooks (SessionStart/UserPromptSubmit/PostToolUse)
Antigravity ── shared stdio MCP (roots/list) + advisory hooks (PostToolUse/PreInvocation)
Hermes      ── per-session CLI bridge to MCP + Python post_tool_call/before_llm + impact.sqlite
```

## Runtime Boundary

`packages/cli/src/context/` owns shared behavior; adapters own host registration, paths, approvals, lifecycle, and naming.

The server writes only JSON-RPC to stdout. Child stdout/stderr flows to temporary files. Small bounded output returns directly; larger output is chunked and written to the project-local FTS5 database before excerpts return.

## MCP Workspace Resolution And Session Binding

- **Workspace resolution (`server.mjs`)**: when `DOTDOTGOD_PROJECT_ROOT` is unset and the MCP client advertises `capabilities.roots` (such as Antigravity, whose plugin MCP starts with `cwd === ${PLUGIN_ROOT}`), the server queries `roots/list` after `notifications/initialized` and updates on `notifications/roots/list_changed`. Non-roots clients fall back to `process.cwd()`.
- **`sessionBound` and `guidance` boundary (`server.mjs`)**: per-call session binding tracks whether `DOTDOTGOD_SESSION_ID`, `contextSessionId`, or `session_resume` bound an active host session. Both `impact_status` and `project_impact.impactStatus` emit `sessionBound: boolean`. When `sessionBound === false`, the server does not open or create `impact.sqlite` and emits a static single-line `guidance` string (`<= 120` chars, no path or session leakage) explaining that non-bound stdio MCP cannot inspect hook-tracked pending rows. When `sessionBound === true`, `guidance` is omitted and `withImpactReview` applies optimistic revision/fingerprint CAS.

## Retrieval Layers

Keep these layers separate: filesystem documentation map, local vector cache for semantic routing, graph/reference index for impact, FTS5 context store for transient outputs, and maintained project docs as durable source of truth. Execution output never automatically becomes graph evidence or maintained project truth.

## Pi Codemode Boundary

Pi 1.0.0 owns MCP discovery, connections, cancellation, and cleanup. Calls return envelopes through host hooks without aliases or duplicate schemas; native `project_memory_load` unwraps `ctx.executeTool`. See [Pi selection](../spec/PI_CONTEXT_TOOL_SELECTION.md).

## Storage And Retention

Storage enforces [24-hour retention](../spec/CONTEXT_RETENTION.md) across content, jobs, and impact rows using `node:sqlite` (`DatabaseSync`, Node `>=22.5.0`) below `.dotdotgod/context/`. Source metadata stays separate from FTS5 chunks with WAL, bounded busy timeout, transactional rollback, and operation-owned provenance (`unknown` on legacy read-time normalization).

## Chunking, Ranking, Ingestion, And Safe Fetch

- **Chunking & ranking**: Markdown, JSON, or plain-text chunks share one UTF-8 byte ceiling. Search applies authorization filters before Porter BM25 + label/path RRF fusion; wildcard browsing bypasses keyword matching ([search recovery](../spec/CONTEXT_SEARCH_RECOVERY.md)). Retrieved content carries `instructionAuthority: "none"`.
- **Directory & HTML acquisition**: deterministic manifests skip symlinks by default, reject special files, enforce traversal budgets, and strip active/hidden HTML without script execution.
- **Safe fetch (`safe-fetch.mjs`)**: Node core HTTP(S) validates all DNS answers, rechecks peers, revalidates manual redirects, and enforces wire/decoded byte limits and timeout/abort destruction (application-level checks, not a process/network sandbox).
- **Diagnostics (`doctor.mjs`)**: local, read-only checks; never creates DBs, migrates schemas, contacts registries, or repairs config.
- **Process capture (`execute.mjs`)**: strips reserved injection variables, streams detached process-group output to private temp files, and runs batch workers without shared shell state in input order.

## Modular Advisory Impact And Hook Architecture

Advisory impact and hook logic are split by responsibility:

- `packages/cli/src/context/impact-path.mjs`: SQLite-free `resolveDocumentationRoot` (validating `dotdotgod.config.json` regular-file `<= 256 KiB` relative paths, rejecting escapes/dot-segments/control chars), `impactPath` (excluding build/cache dirs and `<docRoot>/(plan|archive)` while keeping `<docRoot>/post`), `impactFingerprint`, `sanitizeDisplayPath`, and `impactReminder` (post-`JSON.stringify` C1/separator/bidi escaping, 200-char/8-item caps, untrusted-data notice).
- `packages/cli/src/context/impact-state.mjs`: single owner of `.dotdotgod/context/impact.sqlite` v3 schema (`pending`, `plan_notices` without `$HOME` paths, and `load_state`), 24-hour fixed TTL, `ImpactState`, and `withImpactReview` (re-exporting `impact-path.mjs`).
- `packages/cli/src/context/hook-state.mjs`: trust-boundary helpers — `parseHookInput`, `extractHookSessionId` (strict `validateSessionId`, fail-open `null`, no `'default'` fallback), `isInitializedProject` (`lstatSync` non-symlink `dotdotgod.config.json` or `.dotdotgod`), `findInitializedRoot`, `selectWorkspaceForPath` (segment-boundary longest match), `parseApplyPatchPaths`, `isDotdotgodMcpTool`, `hasFailedToolResult`, `readArtifactBounded` (`O_NOFOLLOW | O_NONBLOCK`, `2 MiB` ceiling), `formatHookError`, and `runHookSafely`.
- `packages/cli/src/context/hooks.mjs`: Claude Code and Codex hooks (`sessionstart`, `userpromptsubmit`, `posttooluse`; `pretooluse` returns `{}` and is removed from `hooks.json`). Legacy `.dotdotgod/context/runtime/*.json` files are ignored.
- `packages/cli/src/context/hooks-antigravity.mjs`: Antigravity hooks (`posttooluse`, `preinvocation`) tracking CLI/App edit tools, clearing on successful `call_mcp_tool` (`dotdotgod_context` / `project_impact`) or direct MCP, claiming unnotified rows once (`claimUnnotified`), and observing Option C-2 `/plan` artifacts.
- `packages/cli/assets/adapters/hermes/impact.py`: Python `sqlite3` (`isolation_level=None`, WAL, `BEGIN IMMEDIATE`, ms TTL) interoperable with `impact.sqlite` v3 for Hermes `post_tool_call` and `before_llm`.

## `impact.sqlite` Concurrency And Fast Read-Only Path

1. `database(write = false)` returns `undefined` when `impact.sqlite` does not exist (never creates directories or files).
2. Writable connections use `PRAGMA busy_timeout = 5000` and `PRAGMA journal_mode = WAL` before `BEGIN IMMEDIATE`.
3. **Fast read-only path (`write = false`)**: queries use available expiry fields without `BEGIN IMMEDIATE`, DDL, or physical `DELETE`. Older layouts migrate on write; the installer does not open these stores.
4. **Write path (`write = true`)**: runs inside `BEGIN IMMEDIATE`, prunes `expires_at <= now` from `pending`, `plan_notices`, and `load_state`, performs the atomic mutation (`mark` returning `{ becameNonEmpty }`, `clearPaths`, `claimUnnotified` via `UPDATE ... RETURNING`, `recordPlanNotice`, `claimPlanNotice`, or `clearPlanNotice`), and commits.

Non-bound hooks use `clearPaths` on successful `PostToolUse(project_impact)` and retain pending rows on failure. Session-bound MCP (`withImpactReview`) protects concurrent edits via revision/fingerprint CAS. External or shell mutations remain outside observed-edit interception.

## Packaging

The CLI's bin owns the shared stdio server and fail-open hook dispatch. Thin
host files bind to a durable CLI installation; they contain no self-contained
MCP/CLI/parser copies. Hermes uses a per-session `mcp-bridge` to the same
runtime; Pi registers the bin export with `mcp`. Optional semantic embeddings
remain separately installed and missing embeddings degrade focused Load to
bounded recovery evidence without leaking raw module paths.

## Phase 3 Components

`ContextStore` owns the migration ledger, bounded trigram scan, and durable ingestion-job rows (`BEGIN IMMEDIATE` migration, restart requeue, explicit backup-before-heal). `IngestionJobRunner` is a concurrency-one local pump whose `close()` drains active work before store shutdown/heal. Session IDs remain opaque validated routing keys.

## Related Behavior And Verification

- Behavior: [`docs/spec/CONTEXT_EXECUTION.md`](../spec/CONTEXT_EXECUTION.md), [`docs/spec/ADVISORY_IMPACT.md`](../spec/ADVISORY_IMPACT.md), [`docs/spec/ANTIGRAVITY_ADAPTER.md`](../spec/ANTIGRAVITY_ADAPTER.md)
- Tests: [`docs/test/CONTEXT_EXECUTION.md`](../test/CONTEXT_EXECUTION.md), [`docs/test/HOOKS.md`](../test/HOOKS.md), [`docs/test/ANTIGRAVITY_ADAPTER.md`](../test/ANTIGRAVITY_ADAPTER.md)
- Cross-agent architecture: [`CROSS_AGENT_ARCHITECTURE.md`](CROSS_AGENT_ARCHITECTURE.md)
