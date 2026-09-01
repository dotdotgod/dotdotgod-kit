# Context Execution And Retrieval

## Purpose

Dotdotgod keeps large command, file, and fetched text outside model context until bounded retrieval selects output.

## Tool Contract

Claude Code and Codex receive one local stdio MCP server with these tools:

- `execute`, `batch_execute`, and `execute_file`;
- `index`, `search`, and `fetch_and_index`;
- `stats`, `doctor`, and `purge`;
- `dotdotgod_project_load`, `dotdotgod_project_impact`, and `dotdotgod_project_initialize`;
- `dotdotgod_embedding_status` and confirmation-gated `dotdotgod_embedding_install`.

Pi exposes native dotdotgod-prefixed execution and context tools over the same core library. Existing Pi project-load lifecycle and graph-impact pending-state behavior remain native and do not proxy through MCP.

## Output Handling

Execution captures child stdout and stderr through internal pipes and temporary files. MCP protocol stdout remains reserved for JSON-RPC. Combined temporary capture is hard-limited to 10 MiB per command; exceeding it terminates the process and reports `captureLimitExceeded`. Direct stdout and stderr excerpts are each capped at 1 MiB even when callers request larger limits.

Output modes are:

- `auto`: return bounded direct output when small and index larger output;
- `direct`: return bounded output and report truncation;
- `indexed`: index output and return metadata instead of raw bytes;
- `discard`: return status and metrics without stream content.

The implementation MUST NOT place complete large output in a tool response before indexing or filtering. Batch results preserve input order. Execution entrypoints inherit a compatibility-oriented environment after removing runtime injection variables. Callers may add string overrides or delete inherited names, but cannot restore reserved variables. Results report policy and filtered names, never values. This filtering is defense in depth and does not isolate ordinary inherited credentials.

## Storage And Search

The context store is a project-local SQLite FTS5 database at `.dotdotgod/context/context.sqlite`. Sources carry scope, session, label, kind, metadata, creation time, and optional expiry.

Supported scopes are transient call, session, and project. Large automatic command output defaults to session scope with expiry. Search returns bounded excerpts and supports source, scope, session, and result-limit filters.

New sources receive operation-owned source type, trust, origin, SHA-256 hash, indexed time, extractor, and chunker version metadata. Caller metadata cannot override these fields. Legacy records remain readable as `unknown` without migration.

Markdown chunking preserves heading/fence metadata; JSON emits deterministic key-path chunks. Structural and fallback chunks have a hard UTF-8 byte bound, while generic text retains overlapping chunks.

Search applies scope/session/source predicates before building bounded Porter and label/path lists, then uses reciprocal-rank fusion and deterministic title/path/proximity signals. Existing result fields remain; provenance, `instructionAuthority: "none"`, and bounded ranking evidence are additive. Retrieved text is non-authoritative data; this boundary is defense in depth, not a prompt-injection guarantee.

`index` accepts one project-contained regular file or directory. Directory traversal is deterministic and bounded by depth, entries, file count, per-file bytes, and aggregate bytes. Symlinks are skipped by default; followed file symlinks must resolve inside the project. Responses contain path/status metadata, not file content, and report partial success, skips, failures, truncation, and cancellation.

Fetched HTML is normalized without a browser, JavaScript, subresources, or link following. The bounded extractor removes active and hidden content, preserves basic structure, records metadata, and keeps the source `external-untrusted`. It is not a complete HTML renderer or prompt-injection defense.

Writable database connections use WAL and a bounded busy timeout. Source replacement, expiry, and purge update source and FTS rows transactionally. Recognized older databases migrate transactionally; unknown, newer, incomplete, or corrupt databases fail clearly and doctor remains read-only.

`purge` requires explicit confirmation and exactly one selector: scope, session, or source.

## Execution Safety

- Arbitrary command execution and shell mode are write-capable operations that remain subject to host approval.
- Commands accept either an explicit executable/arguments pair or an explicit shell command string.
- Concurrency is bounded to eight and batch size to one hundred commands.
- Timeouts are bounded and terminate the process group where supported.
- File and directory indexing enforce project containment and per-operation resource bounds; explicit filters do not imply `.gitignore` processing.
- URL fetching accepts credential-free HTTP(S), validates DNS answers, the selected peer, and every redirect against a private/reserved network deny policy.
- Redirect, timeout, wire-byte, and decoded-byte limits apply; unsupported MIME types and encodings fail closed. This is application validation, not network isolation.
- `doctor` performs local read-only runtime, storage, SQLite/FTS5, schema, and fetch-policy checks without npm access, repair, migration, or command execution.
- Project initialization defaults to dry-run; writes require `dryRun: false` and `confirmWrite: true`.

## Project Workflow Boundaries

`dotdotgod_project_load` requires a bounded documentation tree; its semantic query is optional. If the local runtime is missing, Load succeeds with `query: null`, code `EMBEDDING_RUNTIME_MISSING`, and a confirmation-gated installation offer. Other focused-query failures use `QUERY_UNAVAILABLE`. Load never installs automatically; refusal continues map-only work. Standalone query still fails visibly. Rejected Load keeps the hook gate; map-success Load may clear it through successful PostToolUse. This does not reproduce Pi's pending-only lifecycle.

`dotdotgod_project_impact` accepts one to twenty unique changed paths and returns CLI-equivalent structured impact evidence. It does not mutate Pi extension state when called from Claude Code or Codex.

`dotdotgod_project_initialize` preserves existing initializer behavior and existing files.

## Packaged Adapter Runtime

Claude Code and Codex packages contain generated hook, MCP server, and CLI entry artifacts built from `@dotdotgod/context` and CLI source. The extracted core plugin runtime must start without workspace symlinks, ancestor `node_modules`, runtime package-manager commands, or a separately installed `@dotdotgod/context` package. Adapter verification checks generated drift and executes packed artifacts after isolated extraction. Optional semantic embeddings remain package-managed, not embedded. Extracted adapters satisfy mandatory map Load without ancestor `node_modules`; unavailable embeddings degrade only focused query and expose no raw paths or stacks.

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

Hooks do not transform tool types or retry automatically. Coverage is limited to tested host interception points.

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
  - `CONTEXT-EXECUTION-ADAPTERS-001` — Claude and Codex use MCP while Pi retains native adapter tools (sections: 3, implementedBy: 5, verifiedBy: 4, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs","packages/context/src/chunks.mjs","packages/context/src/content.mjs","packages/context/src/provenance.mjs","packages/context/src/rank.mjs","packages/context/src/safe-fetch.mjs","packages/context/src/environment-policy.mjs","packages/context/src/directory-ingestion.mjs","packages/context/src/html-normalize.mjs","packages/context/src/doctor.mjs","packages/context/src/project.mjs","packages/context/src/hooks.mjs","packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/claude-code/hooks/hooks.json","packages/codex/.codex-plugin/plugin.json","packages/codex/.mcp.json","packages/codex/hooks/hooks.json","packages/context/src/jobs.mjs","packages/context/src/session.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/hooks.test.mjs","packages/context/test/store-operations.test.mjs","packages/context/test/environment-policy.test.mjs","packages/context/test/directory-ingestion.test.mjs","packages/context/test/html-normalize.test.mjs","packages/context/test/mcp.test.mjs","packages/context/test/adapters.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md","packages/context/test/phase3.test.mjs","packages/context/test/adapter-packaging.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"contracts":[{"id":"CONTEXT-EXECUTION-TOOLS-001","title":"Local context tools keep large raw bytes outside model context","sections":["Tool Contract","Output Handling","Storage And Search"],"implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]},{"id":"CONTEXT-EXECUTION-ADAPTERS-001","title":"Claude and Codex use MCP while Pi retains native adapter tools","sections":["Project Workflow Boundaries","Packaged Adapter Runtime","Hook Routing"],"implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/context/src/hooks.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/context/test/adapters.test.mjs","packages/context/test/adapter-packaging.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}]}
```
