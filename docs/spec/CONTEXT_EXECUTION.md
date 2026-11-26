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

Unprefixed names are host-qualified by server. Pi uses host-managed MCP without aliases (pending-only `project_memory_load` calls `project_load`). OpenCode integrates the shared MCP server with Code Mode ([OPENCODE_ADAPTER.md](OPENCODE_ADAPTER.md)); Antigravity launches `dotdotgod_context` from `mcp_config.json` ([ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)); Hermes uses per-session native-to-MCP routing ([HERMES_ADAPTER.md](HERMES_ADAPTER.md)). When `DOTDOTGOD_PROJECT_ROOT` is unset and the client advertises `capabilities.roots`, the server resolves workspace root via MCP `roots/list` (and `notifications/roots/list_changed`), falling back to `process.cwd()`. Reload after upgrading; old names are unsupported.

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

`@dotdotgod/cli` owns context services, stdio MCP, and hook dispatch. Claude Code, Codex, and Antigravity point at `dotdotgod mcp` and `dotdotgod hook <host> <event>` through the installed binding. OpenCode and Hermes use thin host-native files without independent CLI or MCP bundles. Pi resolves the CLI bin export from its runtime dependency and invokes it with `mcp`. See [adapter install and runtime binding](cli/ADAPTER.md). Optional embeddings may degrade focused enrichment, never mandatory map Load; errors omit paths/stacks.

## Hook Routing

Claude Code, Codex, and Antigravity hooks persist advisory state in `.dotdotgod/context/impact.sqlite` v3 and ignore legacy `.dotdotgod/context/runtime/*.json`. Hooks activate only for initialized projects (`dotdotgod.config.json` regular file or `.dotdotgod` directory), validate session IDs strictly (no `'default'` fallback), and fail open on invalid input or errors.

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
  - [packages/cli/src/context/server.mjs](../../packages/cli/src/context/server.mjs)
  - [packages/cli/src/context/execute.mjs](../../packages/cli/src/context/execute.mjs)
  - [packages/cli/src/context/store.mjs](../../packages/cli/src/context/store.mjs)
  - [packages/cli/src/context/chunks.mjs](../../packages/cli/src/context/chunks.mjs)
  - [packages/cli/src/context/content.mjs](../../packages/cli/src/context/content.mjs)
  - [packages/cli/src/context/provenance.mjs](../../packages/cli/src/context/provenance.mjs)
  - [packages/cli/src/context/rank.mjs](../../packages/cli/src/context/rank.mjs)
  - [packages/cli/src/context/safe-fetch.mjs](../../packages/cli/src/context/safe-fetch.mjs)
  - [packages/cli/src/context/environment-policy.mjs](../../packages/cli/src/context/environment-policy.mjs)
  - [packages/cli/src/context/directory-ingestion.mjs](../../packages/cli/src/context/directory-ingestion.mjs)
  - [packages/cli/src/context/html-normalize.mjs](../../packages/cli/src/context/html-normalize.mjs)
  - [packages/cli/src/context/doctor.mjs](../../packages/cli/src/context/doctor.mjs)
  - [packages/cli/src/context/project.mjs](../../packages/cli/src/context/project.mjs)
  - [packages/cli/src/context/hooks.mjs](../../packages/cli/src/context/hooks.mjs)
  - [packages/cli/src/context/hooks-antigravity.mjs](../../packages/cli/src/context/hooks-antigravity.mjs)
  - [packages/cli/src/context/hook-state.mjs](../../packages/cli/src/context/hook-state.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/cli/src/adapters/hosts/claude-code.mjs](../../packages/cli/src/adapters/hosts/claude-code.mjs)
  - [packages/cli/assets/adapters/codex/plugin.json](../../packages/cli/assets/adapters/codex/plugin.json)
  - [packages/cli/src/adapters/hosts/codex.mjs](../../packages/cli/src/adapters/hosts/codex.mjs)
  - [packages/cli/assets/adapters/codex/hooks.json](../../packages/cli/assets/adapters/codex/hooks.json)
  - [packages/cli/assets/adapters/antigravity/plugin.json](../../packages/cli/assets/adapters/antigravity/plugin.json)
  - [packages/cli/src/adapters/hosts/antigravity.mjs](../../packages/cli/src/adapters/hosts/antigravity.mjs)
  - [packages/cli/assets/adapters/antigravity/hooks.json](../../packages/cli/assets/adapters/antigravity/hooks.json)
  - [packages/cli/src/context/jobs.mjs](../../packages/cli/src/context/jobs.mjs)
  - [packages/cli/src/primitives.mjs](../../packages/cli/src/primitives.mjs)
  - [packages/cli/bin/dotdotgod.mjs](../../packages/cli/bin/dotdotgod.mjs)
- Verified by:
  - [packages/pi/test/context-workflow.test.ts](../../packages/pi/test/context-workflow.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
  - [packages/cli/test/context/context.test.mjs](../../packages/cli/test/context/context.test.mjs)
  - [packages/cli/test/context/hooks.test.mjs](../../packages/cli/test/context/hooks.test.mjs)
  - [packages/cli/test/context/hooks-antigravity.test.mjs](../../packages/cli/test/context/hooks-antigravity.test.mjs)
  - [packages/cli/test/context/store-operations.test.mjs](../../packages/cli/test/context/store-operations.test.mjs)
  - [packages/cli/test/context/environment-policy.test.mjs](../../packages/cli/test/context/environment-policy.test.mjs)
  - [packages/cli/test/context/directory-ingestion.test.mjs](../../packages/cli/test/context/directory-ingestion.test.mjs)
  - [packages/cli/test/context/html-normalize.test.mjs](../../packages/cli/test/context/html-normalize.test.mjs)
  - [packages/cli/test/context/mcp.test.mjs](../../packages/cli/test/context/mcp.test.mjs)
  - [packages/cli/test/adapters/runtime-smoke.test.mjs](../../packages/cli/test/adapters/runtime-smoke.test.mjs)
  - [docs/test/CONTEXT_EXECUTION.md](../test/CONTEXT_EXECUTION.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
  - [packages/cli/test/context/phase3.test.mjs](../../packages/cli/test/context/phase3.test.mjs)
  - [packages/cli/test/adapters/packaging-contract.test.mjs](../../packages/cli/test/adapters/packaging-contract.test.mjs)
  - [packages/cli/test/adapters/installer-lifecycle.test.mjs](../../packages/cli/test/adapters/installer-lifecycle.test.mjs)
- Related docs:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
  - [docs/spec/ANTIGRAVITY_ADAPTER.md](ANTIGRAVITY_ADAPTER.md)
  - [docs/spec/ADVISORY_IMPACT.md](ADVISORY_IMPACT.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- Contracts:
  - `CONTEXT-EXECUTION-TOOLS-001` — Local context tools keep large raw bytes outside model context (sections: 3, implementedBy: 3, verifiedBy: 2, relatedDocs: 1)
  - `CONTEXT-EXECUTION-ADAPTERS-001` — Adapters use shared MCP while retaining native host lifecycle (sections: 3, implementedBy: 8, verifiedBy: 8, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/context/server.mjs","packages/cli/src/context/execute.mjs","packages/cli/src/context/store.mjs","packages/cli/src/context/chunks.mjs","packages/cli/src/context/content.mjs","packages/cli/src/context/provenance.mjs","packages/cli/src/context/rank.mjs","packages/cli/src/context/safe-fetch.mjs","packages/cli/src/context/environment-policy.mjs","packages/cli/src/context/directory-ingestion.mjs","packages/cli/src/context/html-normalize.mjs","packages/cli/src/context/doctor.mjs","packages/cli/src/context/project.mjs","packages/cli/src/context/hooks.mjs","packages/cli/src/context/hooks-antigravity.mjs","packages/cli/src/context/hook-state.mjs","packages/pi/extensions/context-tools/index.ts","packages/cli/src/adapters/hosts/claude-code.mjs","packages/cli/assets/adapters/codex/plugin.json","packages/cli/src/adapters/hosts/codex.mjs","packages/cli/assets/adapters/codex/hooks.json","packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/src/adapters/hosts/antigravity.mjs","packages/cli/assets/adapters/antigravity/hooks.json","packages/cli/src/context/jobs.mjs","packages/cli/src/primitives.mjs","packages/cli/bin/dotdotgod.mjs"],"verifiedBy":["packages/pi/test/context-workflow.test.ts","packages/pi/test/context-codemode.test.ts","packages/cli/test/context/context.test.mjs","packages/cli/test/context/hooks.test.mjs","packages/cli/test/context/hooks-antigravity.test.mjs","packages/cli/test/context/store-operations.test.mjs","packages/cli/test/context/environment-policy.test.mjs","packages/cli/test/context/directory-ingestion.test.mjs","packages/cli/test/context/html-normalize.test.mjs","packages/cli/test/context/mcp.test.mjs","packages/cli/test/adapters/runtime-smoke.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/cli/test/context/phase3.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs","packages/cli/test/adapters/installer-lifecycle.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md","docs/spec/ANTIGRAVITY_ADAPTER.md","docs/spec/ADVISORY_IMPACT.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"contracts":[{"id":"CONTEXT-EXECUTION-TOOLS-001","title":"Local context tools keep large raw bytes outside model context","sections":["Tool Contract","Output Handling","Storage And Search"],"implementedBy":["packages/cli/src/context/server.mjs","packages/cli/src/context/execute.mjs","packages/cli/src/context/store.mjs"],"verifiedBy":["packages/cli/test/context/context.test.mjs","packages/cli/test/context/mcp.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]},{"id":"CONTEXT-EXECUTION-ADAPTERS-001","title":"Adapters use shared MCP while retaining native host lifecycle","sections":["Project Workflow Boundaries","Packaged Adapter Runtime","Hook Routing"],"implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/cli/src/adapters/hosts/claude-code.mjs","packages/cli/assets/adapters/codex/plugin.json","packages/cli/assets/adapters/antigravity/plugin.json","packages/cli/src/context/hooks.mjs","packages/cli/src/context/hooks-antigravity.mjs","packages/cli/bin/dotdotgod.mjs","packages/cli/assets/adapters/opencode/src/mcp.mjs"],"verifiedBy":["packages/cli/test/adapters/runtime-smoke.test.mjs","packages/cli/test/context/hooks.test.mjs","packages/cli/test/context/hooks-antigravity.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/cli/test/adapters/opencode-plugin.test.mjs","packages/cli/test/adapters/packaging-contract.test.mjs","packages/cli/test/adapters/installer-lifecycle.test.mjs"],"relatedDocs":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}]}
```
