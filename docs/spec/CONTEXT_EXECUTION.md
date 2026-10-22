# Context Execution And Retrieval

## Purpose

Dotdotgod keeps large command, file, and fetched text outside model context until bounded retrieval selects output.

## Tool Contract

Pi, OpenCode, Claude Code and Codex use these shared stdio MCP tools:

- `execute` and `execute_file`;
- `index`, `search`, and `fetch_and_index`;
- `stats`, `doctor`, and `purge`;
- `session_resume` and durable `ingestion_job_start`, `ingestion_job_status`, `ingestion_job_cancel`;
- confirmation-gated `context_heal`;
- `project_load`, `project_impact`, `impact_status`, and `project_initialize`;
- `embedding_status` and confirmation-gated `embedding_install`.

Nineteen unprefixed names are host-qualified by server. Pi uses host-managed MCP without aliases; pending-only `project_memory_load` calls `project_load`. Reload after upgrading; old names are unsupported.
Hermes: [per-session native-to-MCP routing](HERMES_ADAPTER.md).

## Output Handling

Execution captures child streams in private pipes/files, reserving MCP stdout for JSON-RPC. Combined capture is limited to 10 MiB per command; exceeding it terminates the process with captureLimitExceeded. Direct excerpts are capped at 1 MiB per stream even when callers request more.

Output modes are:

- `auto`: return bounded direct output when small and index larger output;
- `direct`: return bounded output and report truncation;
- `indexed`: index output and return metadata instead of raw bytes;
- `discard`: return status and metrics without stream content.

The implementation MUST NOT place complete large output in a tool response before indexing or filtering. Batch results preserve input order. Execution entrypoints inherit a compatibility-oriented environment after removing runtime injection variables. Callers may add string overrides or delete inherited names, but cannot restore reserved variables. Results report policy and filtered names, never values. This filtering is defense in depth and does not isolate ordinary inherited credentials.

See [tool presentation](TOOL_RESPONSES.md) and [Pi selection](PI_CONTEXT_TOOL_SELECTION.md).

## Storage And Search

The store is `.dotdotgod/context/context.sqlite`. Content, jobs and impact use fixed [24-hour retention](CONTEXT_RETENTION.md); custom ttlMs is unsupported.

Supported scopes are transient call, session, and project. Large automatic command output defaults to session scope with expiry. Search returns bounded excerpts and supports source, scope, session, and result-limit filters.

See [search recovery](CONTEXT_SEARCH_RECOVERY.md).

New sources receive operation-owned source type, trust, origin, SHA-256 hash, indexed time, extractor, and chunker version metadata. Caller metadata cannot override these fields. Legacy records remain readable as `unknown` without migration.

Markdown chunking preserves heading/fence metadata; JSON emits deterministic key-path chunks. Structural and fallback chunks have a hard UTF-8 byte bound, while generic text retains overlapping chunks.

Search applies scope/session/source predicates before building bounded Porter and label/path lists, then uses reciprocal-rank fusion and deterministic title/path/proximity signals. Existing result fields remain; provenance, `instructionAuthority: "none"`, and bounded ranking evidence are additive. Retrieved text is non-authoritative data; this boundary is defense in depth, not a prompt-injection guarantee.

`index` accepts one file or explicit directory, including external paths. Root sets path defaults and storage, not access rights. Traversal bounds depth, entries, files and bytes. Symlinks default to skipped; enabled file symlinks may be external. Directory aliases are resolved only when explicitly requested, not recursively followed. Responses report paths, partial success, skips, failures, truncation and cancellation, not file content.

Fetched HTML is normalized without a browser, JavaScript, subresources, or link following. The bounded extractor removes active and hidden content, preserves basic structure, records metadata, and keeps the source `external-untrusted`. It is not a complete HTML renderer or prompt-injection defense.

Writable database connections use WAL and a bounded busy timeout. Source replacement, expiry, and purge update source and FTS rows transactionally. Recognized older databases migrate transactionally; unknown, newer, incomplete, or corrupt databases fail clearly and doctor remains read-only.

`purge` requires explicit confirmation and exactly one selector: scope, session, or source.

## Execution Safety

- Arbitrary command execution and shell mode are write-capable operations that remain subject to host approval.
- Commands accept either an explicit executable/arguments pair or an explicit shell command string.
- Concurrency is bounded to eight and batch size to one hundred commands.
- Timeouts are bounded and terminate the process group where supported.
- Indexing limits resource use, not accessible filesystem areas; filters do not imply `.gitignore` processing.
- URL fetching accepts credential-free HTTP(S), validates DNS answers, the selected peer, and every redirect against a private/reserved network deny policy.
- Redirect, timeout, wire-byte, and decoded-byte limits apply; unsupported MIME types and encodings fail closed. This is application validation, not network isolation.
- `doctor` performs local read-only runtime, storage, SQLite/FTS5, schema, and fetch-policy checks without npm access, repair, migration, or command execution.
- Project initialization defaults to dry-run; writes require `dryRun: false` and `confirmWrite: true`.

## Project Workflow Boundaries

`project_load` requires a bounded documentation tree; semantic query is optional. A missing local runtime returns `query: null`, `EMBEDDING_RUNTIME_MISSING`, and a confirmation-gated install offer; other query failures use `QUERY_UNAVAILABLE`. Load never auto-installs; refusal continues map-only. Standalone query fails visibly. Rejected Load keeps the hook gate; successful PostToolUse may clear it after map success. Pi's pending-only lifecycle remains separate.

`project_impact` accepts 1–20 paths and returns compact evidence, checked paths and impactStatus. Pi/OpenCode supply contextSessionId per call; successful reviews clear unchanged pending revisions, failures retain them. State lives in .dotdotgod/context/impact.sqlite with a bounded status tool. Pending never blocks tools; see [advisory contract](ADVISORY_IMPACT.md). Claude/Codex hooks below remain unchanged.

`project_initialize` preserves existing initializer behavior and existing files.

## Packaged Adapter Runtime

Claude/Codex bundle shared hooks, MCP and CLI. Extracted runtimes require no ancestor node_modules, workspace links, installers or separate context package. Verification checks drift and isolated tarballs. Optional package-managed embeddings may degrade focused enrichment, never mandatory map Load; errors omit paths/stacks.

## Hook Routing

Claude Code and Codex hooks keep project/session state under `.dotdotgod/context/runtime/`. Declared roots override transient cwd. Otherwise hooks find nearest same-session ancestor state; only SessionStart creates state at cwd. Each invocation shares one root across state and fingerprints. Unidentified events fail open.

- Session start marks project load as required.
- Substantive shell or write tools are denied until project load succeeds.
- Successful edit tools record project-contained changed paths and fingerprints.
- Broad test, build, lint, verify, commit, push, publish, and deploy commands are denied while impact is pending.
- Denial identifies the required MCP tool; the model calls it and retries the original operation.
- Project MCP tools bypass their own guards.
- Pending paths outside the canonical project root are pruned before gating, so host scratchpad files cannot block commits.
- Impact PostToolUse clears matching requested pending paths without fingerprint checks. Failed impact results warn while still clearing the gate to avoid retry loops.

Hooks neither transform calls nor auto-retry; coverage is limited to tested interception points.

## Phase 3 Runtime Operations

- Search adds a bounded trigram candidate lane for typo tolerance. Scope, session, and source predicates are applied in SQL before fusion; Porter FTS remains primary.
- Existing profile-1 databases migrate transactionally and idempotently through a version ledger. Unknown, newer, incomplete, and corrupt schemas fail closed.
- Healing requires an explicit tool call and confirmation, creates a backup first, and only migrates recognized profiles. It does not promise reconstruction when source bytes are unavailable.
- A caller may resume an opaque validated session ID. The runtime does not list historical session IDs.
- Background file/directory and strict-fetch ingestion uses durable bounded job rows with queued, running, completed, failed, and cancelled states. One process-local worker runs jobs; interrupted running jobs return to queued on restart. Owners must await runner shutdown before closing or healing its store; shutdown aborts active work and rejects later enqueue attempts.
- Command execution retains compatibility-oriented filtered inheritance by default; this default is not credential isolation. `allowlist-v1` is opt-in, starts from an empty child environment, requires explicit allowed names for inherited values and caller overrides, and reports names without values.
- Strict fetch remains the default. Browser rendering requires an explicitly injected renderer capability and `browser: true`; no browser dependency is bundled. Rendered content is bounded, abortable, and `external-untrusted`. This is not a sandbox.

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
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/claude-code/.claude-plugin/plugin.json](../../packages/claude-code/.claude-plugin/plugin.json)
  - [packages/claude-code/hooks/hooks.json](../../packages/claude-code/hooks/hooks.json)
  - [packages/codex/.codex-plugin/plugin.json](../../packages/codex/.codex-plugin/plugin.json)
  - [packages/codex/.mcp.json](../../packages/codex/.mcp.json)
  - [packages/codex/hooks/hooks.json](../../packages/codex/hooks/hooks.json)
  - [packages/context/src/jobs.mjs](../../packages/context/src/jobs.mjs)
  - [packages/context/src/session.mjs](../../packages/context/src/session.mjs)
  - [scripts/build-adapter-runtime.mjs](../../scripts/build-adapter-runtime.mjs)
- Verified by:
  - [packages/pi/test/context-workflow.test.ts](../../packages/pi/test/context-workflow.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
  - [packages/context/test/context.test.mjs](../../packages/context/test/context.test.mjs)
  - [packages/context/test/hooks.test.mjs](../../packages/context/test/hooks.test.mjs)
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
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- Contracts:
  - `CONTEXT-EXECUTION-TOOLS-001` — Local context tools keep large raw bytes outside model context (sections: 3, implementedBy: 3, verifiedBy: 2, relatedDocs: 1)
  - `CONTEXT-EXECUTION-ADAPTERS-001` — Adapters use shared MCP while retaining native host lifecycle (sections: 3, implementedBy: 5, verifiedBy: 4, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs","packages/context/src/chunks.mjs","packages/context/src/content.mjs","packages/context/src/provenance.mjs","packages/context/src/rank.mjs","packages/context/src/safe-fetch.mjs","packages/context/src/environment-policy.mjs","packages/context/src/directory-ingestion.mjs","packages/context/src/html-normalize.mjs","packages/context/src/doctor.mjs","packages/context/src/project.mjs","packages/context/src/hooks.mjs","packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/claude-code/hooks/hooks.json","packages/codex/.codex-plugin/plugin.json","packages/codex/.mcp.json","packages/codex/hooks/hooks.json","packages/context/src/jobs.mjs","packages/context/src/session.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/pi/test/context-workflow.test.ts","packages/pi/test/context-codemode.test.ts","packages/context/test/context.test.mjs","packages/context/test/hooks.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/environment-policy.test.mjs","packages/context/test/directory-ingestion.test.mjs","packages/context/test/html-normalize.test.mjs","packages/context/test/mcp.test.mjs","packages/context/test/adapters.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/context/test/phase3.test.mjs","packages/context/test/adapter-packaging.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"contracts":[{"id":"CONTEXT-EXECUTION-TOOLS-001","title":"Local context tools keep large raw bytes outside model context","sections":["Tool Contract","Output Handling","Storage And Search"],"implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]},{"id":"CONTEXT-EXECUTION-ADAPTERS-001","title":"Adapters use shared MCP while retaining native host lifecycle","sections":["Project Workflow Boundaries","Packaged Adapter Runtime","Hook Routing"],"implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/context/src/hooks.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/context/test/adapters.test.mjs","packages/context/test/adapter-packaging.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}]}
```
