# Context Execution And Retrieval

## Purpose

Dotdotgod keeps large command, file, and fetched text outside model context until bounded retrieval selects output.

## Tool Contract

Pi, OpenCode, Claude Code, Codex, and Antigravity use nineteen shared stdio MCP tools:

- `execute`, `execute_file`;
- `index`, `search`, `fetch_and_index`;
- `stats`, `doctor`, `purge`;
- `session_resume`, durable `ingestion_job_start`, `ingestion_job_status`, `ingestion_job_cancel`;
- confirmation-gated `context_heal`;
- `project_load`, `project_impact`, `impact_status`, `project_initialize`;
- `embedding_status`, confirmation-gated `embedding_install`.

Unprefixed names are host-qualified by server. Pi uses host-managed MCP without aliases (pending-only `project_memory_load` calls `project_load`). OpenCode bundles MCP with Code Mode ([OPENCODE_ADAPTER.md](OPENCODE_ADAPTER.md)); Antigravity launches `dotdotgod_context` from `mcp_config.json` ([ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)); Hermes uses per-session native-to-MCP routing ([HERMES_ADAPTER.md](HERMES_ADAPTER.md)). When `DOTDOTGOD_PROJECT_ROOT` is unset and the client advertises `capabilities.roots`, the server resolves workspace root via MCP `roots/list` (and `notifications/roots/list_changed`), falling back to `process.cwd()`. Reload after upgrading; old names are unsupported.

## Output Handling

Child streams capture to private pipes/files, reserving MCP stdout for JSON-RPC. Combined capture caps at 10 MiB per command (exceeding terminates with `captureLimitExceeded`); direct excerpts cap at 1 MiB per stream.

Output modes: `auto` (bounded direct when small, indexed when larger), `direct` (bounded output + truncation flag), `indexed` (index + metadata only), `discard` (status/metrics only).

Complete large output MUST NOT enter a tool response before indexing or filtering. Batch results preserve order. Execution inherits a compatibility environment after removing runtime-injection variables; callers may override strings or delete inherited names, not restore reserved names. Results report policy and filtered names, never values (defense in depth, not credential isolation). See [TOOL_RESPONSES.md](TOOL_RESPONSES.md) and [PI_CONTEXT_TOOL_SELECTION.md](PI_CONTEXT_TOOL_SELECTION.md).

## Storage And Search

The store is `.dotdotgod/context/context.sqlite`. Content, jobs, and impact use fixed [24-hour retention](CONTEXT_RETENTION.md); custom `ttlMs` is unsupported.

Scopes are `transient`, `session`, and `project`; large automatic output defaults to `session`. Search returns bounded excerpts with source/scope/session/limit filters; see [CONTEXT_SEARCH_RECOVERY.md](CONTEXT_SEARCH_RECOVERY.md).

New sources get operation-owned type, trust, origin, SHA-256 hash, indexed time, extractor, and chunker version (non-overridable); legacy records read as `unknown`. Markdown chunks preserve heading/fence metadata; JSON emits deterministic key-path chunks with hard UTF-8 byte bounds; generic text uses overlapping chunks.

Search applies SQL scope/session/source predicates before bounded Porter and label/path lists, then reciprocal-rank fusion plus deterministic title/path/proximity signals. Provenance, `instructionAuthority: "none"`, and bounded ranking evidence are additive; retrieved text is untrusted data (defense in depth, not a prompt-injection guarantee).

`index` accepts one file or explicit directory (including external paths; root sets defaults/storage, not access rights) with bounded depth, entries, files, and bytes. Symlinks skip by default; enabled file symlinks may be external; directory aliases resolve only when explicitly requested. Responses report paths, skips, failures, truncation, and cancellation, never file content.

Fetched HTML normalizes without browser/JS/subresources/link-following, stripping active/hidden content and staying `external-untrusted` (not a full renderer or injection defense).

Writable connections use WAL and bounded `busy_timeout`. Replacement, expiry, and purge update source and FTS rows transactionally; recognized older schemas migrate transactionally while unknown/newer/corrupt schemas fail clearly and `doctor` stays read-only. `purge` requires explicit confirmation and exactly one selector (`scope`, `session`, or `source`).

## Execution Safety

- Command execution and shell mode are write-capable and subject to host approval; commands take either explicit executable/args or a shell command string.
- Concurrency caps at 8, batch size at 100, and bounded timeouts terminate process groups where supported.
- Indexing bounds resources, not filesystem access; filters do not imply `.gitignore`.
- URL fetching requires credential-free HTTP(S), denies private/reserved DNS answers, selected peers, and redirects, enforces redirect/timeout/wire/decoded byte limits, and fails closed on unsupported MIME/encodings (application validation, not network isolation).
- `doctor` runs local read-only runtime, SQLite/FTS5, schema, and fetch-policy checks without npm access, repair, migration, or execution.
- `project_initialize` defaults to dry-run; writes require `dryRun: false` and `confirmWrite: true`.

## Project Workflow Boundaries

`project_load` requires a bounded documentation tree; semantic query is optional. Missing runtime returns `query: null`, `EMBEDDING_RUNTIME_MISSING`, and a confirmation-gated install offer; other query failures return `QUERY_UNAVAILABLE`. Load never auto-installs, degrades to map-only on refusal, and never gates shell/write tools (Pi's pending-only lifecycle stays separate). Standalone query fails visibly.

`project_impact` accepts 1–20 paths and returns compact evidence, checked paths, and `impactStatus`. Session-bound callers (`DOTDOTGOD_SESSION_ID`, `contextSessionId`, or `session_resume`) clear unchanged pending revisions in `.dotdotgod/context/impact.sqlite` on success and retain them on failure (`sessionBound: true`, no `guidance`). Unbound stdio MCP callers receive `sessionBound: false` with single-line static `guidance` (`<= 120` chars) on both `impact_status` and `project_impact.impactStatus` without opening or creating `impact.sqlite`. Pending impact is advisory across all adapters and never blocks tools; see [ADVISORY_IMPACT.md](ADVISORY_IMPACT.md).

`project_initialize` preserves existing initializer behavior and files.

## Packaged Adapter Runtime

Claude Code, Codex, and Antigravity bundle shared hooks, MCP, and CLI so extracted runtimes need no ancestor `node_modules`, workspace links, installers, or separate context package. Verification checks drift and isolated tarballs. Optional embeddings may degrade focused enrichment, never mandatory map Load; errors omit paths/stacks.

## Hook Routing

Claude Code, Codex, and Antigravity hooks persist advisory state in `.dotdotgod/context/impact.sqlite` v2 and ignore legacy `.dotdotgod/context/runtime/*.json`. Hooks activate only for initialized projects (`dotdotgod.config.json` regular file or `.dotdotgod` directory), validate session IDs strictly (no `'default'` fallback), and fail open on invalid input or errors.

- Claude Code and Codex register `SessionStart` (optional project-memory guidance), `UserPromptSubmit` (read-only advisory while pending `count > 0`), and `PostToolUse` (marks edits excluding `<docRoot>/(plan|archive)` and build/cache dirs with one `0 -> >0` transition notice; clears requested paths via `clearPaths` on successful allowlisted `project_impact` and retains pending on failure). `PreToolUse` is removed from `hooks.json` and returns `{}`.
- Antigravity registers only `PostToolUse` and `PreInvocation` (`claimUnnotified` one-time advisory and read-only `/plan` sync); see [ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md).

Hooks neither transform calls, deny tools, nor auto-retry; coverage is limited to tested interception points.

## Phase 3 Runtime Operations

- Search adds a bounded trigram candidate lane; SQL predicates apply before fusion and Porter FTS remains primary.
- Profile-1 databases migrate transactionally/idempotently via a version ledger; unknown, newer, incomplete, or corrupt schemas fail closed.
- `context_heal` requires explicit confirmation, backs up first, and migrates only recognized profiles without promising reconstruction when source bytes are missing.
- `session_resume` adopts one opaque validated session ID without listing historical sessions.
- Durable background ingestion jobs (`queued`, `running`, `completed`, `failed`, `cancelled`) run on one process-local worker; interrupted `running` jobs requeue on restart, and owners must await runner shutdown before closing or healing.
- `allowlist-v1` is an opt-in empty-environment mode requiring explicit allowed names for inherited values and overrides, reporting names without values.
- Strict fetch is default; `browser: true` requires an explicitly injected renderer (no bundled browser), stays bounded/abortable/`external-untrusted`, and is not a sandbox.

## Local-Only Boundary

No remote dotdotgod service is required. Runtime state and caches are local; `fetch_and_index` accesses the requested URL.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/context/src/execute.mjs](../../packages/context/src/execute.mjs)
  - [packages/context/src/store.mjs](../../packages/context/src/store.mjs)
  - [packages/context/src/chunks.mjs](../../packages/context/src/chunks.mjs)
  - [packages/context/src/content.mjs](../../packages/context/src/content.mjs)
  - [packages/context/src/provenance.mjs](../../packages/context/src/provenance.mjs)
  - [packages/context/src/rank.mjs](../../packages/context/src/rank.mjs)
  - [packages/context/src/safe-fetch.mjs](../../packages/context/src/safe-fetch.mjs)
  - [packages/context/src/environment-policy.mjs](../../packages/context/src/environment-policy.mjs)
  - [packages/context/src/directory-ingestion.mjs](../../packages/context/src/directory-ingestion.mjs)
  - [packages/context/src/html-normalize.mjs](../../packages/context/src/html-normalize.mjs)
  - [packages/context/src/doctor.mjs](../../packages/context/src/doctor.mjs)
  - [packages/context/src/project.mjs](../../packages/context/src/project.mjs)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
  - [packages/context/src/hooks-antigravity.mjs](../../packages/context/src/hooks-antigravity.mjs)
  - [packages/context/src/hook-state.mjs](../../packages/context/src/hook-state.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/claude-code/.claude-plugin/plugin.json](../../packages/claude-code/.claude-plugin/plugin.json)
  - [packages/claude-code/hooks/hooks.json](../../packages/claude-code/hooks/hooks.json)
  - [packages/codex/.codex-plugin/plugin.json](../../packages/codex/.codex-plugin/plugin.json)
  - [packages/codex/.mcp.json](../../packages/codex/.mcp.json)
  - [packages/codex/hooks/hooks.json](../../packages/codex/hooks/hooks.json)
  - [packages/antigravity/plugin.json](../../packages/antigravity/plugin.json)
  - [packages/antigravity/mcp_config.json](../../packages/antigravity/mcp_config.json)
  - [packages/antigravity/hooks.json](../../packages/antigravity/hooks.json)
  - [packages/context/src/jobs.mjs](../../packages/context/src/jobs.mjs)
  - [packages/context/src/session.mjs](../../packages/context/src/session.mjs)
  - [scripts/build-adapter-runtime.mjs](../../scripts/build-adapter-runtime.mjs)
- Verified by:
  - [packages/pi/test/context-workflow.test.ts](../../packages/pi/test/context-workflow.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
  - [packages/context/test/context.test.mjs](../../packages/context/test/context.test.mjs)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
  - [packages/context/test/hooks-antigravity.test.mjs](../../packages/context/test/hooks-antigravity.test.mjs)
  - [packages/context/test/store-operations.test.mjs](../../packages/context/test/store-operations.test.mjs)
  - [packages/context/test/environment-policy.test.mjs](../../packages/context/test/environment-policy.test.mjs)
  - [packages/context/test/directory-ingestion.test.mjs](../../packages/context/test/directory-ingestion.test.mjs)
  - [packages/context/test/html-normalize.test.mjs](../../packages/context/test/html-normalize.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/context/test/adapters.test.mjs](../../packages/context/test/adapters.test.mjs)
  - [docs/test/CONTEXT_EXECUTION.md](../test/CONTEXT_EXECUTION.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
  - [packages/context/test/phase3.test.mjs](../../packages/context/test/phase3.test.mjs)
  - [packages/context/test/adapter-packaging.test.mjs](../../packages/context/test/adapter-packaging.test.mjs)
- Related docs:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/spec/ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- Contracts:
  - `CONTEXT-EXECUTION-TOOLS-001` — Local context tools keep large raw bytes outside model context (sections: 3, implementedBy: 3, verifiedBy: 2, relatedDocs: 1)
  - `CONTEXT-EXECUTION-ADAPTERS-001` — Adapters use shared MCP while retaining native host lifecycle (sections: 3, implementedBy: 8, verifiedBy: 7, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs","packages/context/src/chunks.mjs","packages/context/src/content.mjs","packages/context/src/provenance.mjs","packages/context/src/rank.mjs","packages/context/src/safe-fetch.mjs","packages/context/src/environment-policy.mjs","packages/context/src/directory-ingestion.mjs","packages/context/src/html-normalize.mjs","packages/context/src/doctor.mjs","packages/context/src/project.mjs","packages/context/src/hooks.mjs","packages/context/src/hooks-antigravity.mjs","packages/context/src/hook-state.mjs","packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/claude-code/hooks/hooks.json","packages/codex/.codex-plugin/plugin.json","packages/codex/.mcp.json","packages/codex/hooks/hooks.json","packages/antigravity/plugin.json","packages/antigravity/mcp_config.json","packages/antigravity/hooks.json","packages/context/src/jobs.mjs","packages/context/src/session.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/pi/test/context-workflow.test.ts","packages/pi/test/context-codemode.test.ts","packages/context/test/context.test.mjs","packages/context/test/hooks.test.mjs","packages/context/test/hooks-antigravity.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/environment-policy.test.mjs","packages/context/test/directory-ingestion.test.mjs","packages/context/test/html-normalize.test.mjs","packages/context/test/mcp.test.mjs","packages/context/test/adapters.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/context/test/phase3.test.mjs","packages/context/test/adapter-packaging.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/spec/ANTIGRAVITY_ADAPTER.md","docs/spec/ADVISORY_IMPACT.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"contracts":[{"id":"CONTEXT-EXECUTION-TOOLS-001","title":"Local context tools keep large raw bytes outside model context","sections":["Tool Contract","Output Handling","Storage And Search"],"implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]},{"id":"CONTEXT-EXECUTION-ADAPTERS-001","title":"Adapters use shared MCP while retaining native host lifecycle","sections":["Project Workflow Boundaries","Packaged Adapter Runtime","Hook Routing"],"implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/antigravity/plugin.json","packages/context/src/hooks.mjs","packages/context/src/hooks-antigravity.mjs","scripts/build-adapter-runtime.mjs","packages/opencode/src/mcp.mjs"],"verifiedBy":["packages/context/test/adapters.test.mjs","packages/context/test/adapter-packaging.test.mjs","packages/context/test/hooks.test.mjs","packages/context/test/hooks-antigravity.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/opencode/test/plugin.test.mjs"],"relatedDocs":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}]}
```
