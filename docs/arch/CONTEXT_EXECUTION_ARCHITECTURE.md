# Context Execution Architecture

## Direction

Use one shared runtime package, thin transport/adapter wrappers, and platform-native lifecycle integration.

```text
@dotdotgod/context
├── process capture and file processing
├── structural chunking, provenance, ranking, and FTS5 storage
├── strict fetch/index operations
├── read-only runtime diagnostics
├── project workflow services
├── shared hook state machine
└── stdio MCP server

Claude Code ── local stdio MCP + hooks
Codex      ── local stdio MCP + hooks
Pi         ── native extension tools over shared core
```

## Runtime Boundary

`packages/context` owns reusable behavior. Adapter packages own registration, host path variables, approvals, lifecycle state, and user-facing naming.

The server writes only JSON-RPC to stdout. Child stdout/stderr flows to temporary files. Small bounded output may be returned directly; larger output is chunked and written to the project-local FTS5 database before excerpts are returned.

## Retrieval Layers

Keep these layers separate:

- filesystem documentation map for navigation;
- local vector cache for semantic document routing;
- graph/reference index for explicit relationships and impact;
- FTS5 context store for transient command, file, and fetched text;
- maintained project docs as durable source of truth.

Project Load can provide focus and paths to execution retrieval. Execution output does not automatically become graph evidence or maintained project truth.

## Storage

The initial implementation uses Node's built-in `node:sqlite` `DatabaseSync` and FTS5. The database lives below `.dotdotgod/context/`, which is expected to remain ignored local state.

Source metadata is stored separately from FTS chunks so expiry and scoped purge can remove complete sources. WAL mode supports concurrent readers with one local writer.

Provenance is additive metadata rather than a schema column. The indexing operation owns source type, trust, origin, SHA-256 content hash, timestamp, extractor, and chunker version, preventing caller metadata from promoting trust. Read-time normalization maps legacy or inconsistent records to `unknown` without rewriting them.

## Chunking And Retrieval Pipeline

Format detection selects Markdown or JSON structural chunking; plain text retains overlapping character chunks. Structural paths apply one UTF-8 byte ceiling, preserve Markdown headings and fence metadata, and emit deterministic JSON key paths. Extractor and chunker versions make mixed legacy/new indexes observable without mandatory reindexing.

Search keeps authorization filters at candidate selection time. Porter BM25 and bounded label/path lists use the same scope, session, and source predicates. Reciprocal-rank fusion combines the lists; title, path, and term-proximity signals rerank fused candidates with deterministic ties. Search responses add bounded ranking evidence and provenance without removing existing fields.

Transport adapters add a non-authoritative data notice. Retrieved content remains structured data with `instructionAuthority: "none"`; it is not promoted to system or developer instruction by the context runtime.

## Safe Fetch Boundary

`safe-fetch.mjs` uses Node core HTTP(S) with explicit lookup results rather than ambient proxy configuration. It rejects credentials and blocked address classes, validates all DNS answers, binds the connection lookup to the accepted addresses, rechecks the socket peer, and repeats validation for every manual redirect.

Wire bytes are counted before optional gzip, deflate, or Brotli decoding, and decoded bytes have a separate limit. Timeouts and caller aborts destroy the request. Unsupported MIME types, encodings, statuses, redirects, or address policy results fail before indexing.

This is application-level destination and resource validation. It does not provide a network namespace or process sandbox.

## Diagnostics

Doctor checks Node support, project/storage access, SQLite FTS5/Porter capability, existing schema compatibility, current store statistics, and configured fetch mode. Checks are local and read-only: doctor does not create the context database, migrate schemas, contact package registries, repair configuration, or execute commands.

## Process Capture

Commands may use an executable/argument array or explicit shell string. The runtime:

1. resolves the working directory;
2. creates private temporary stdout/stderr files;
3. spawns a detached process group where supported;
4. streams output without echoing it to MCP stdout;
5. handles timeout or abort;
6. returns bounded output or indexes content;
7. removes temporary files.

Batch workers share no shell state. Result order follows input order, not completion order.

## Hook State Machine

Hooks store session state separately from indexed content. `loadRequired` gates substantive work. `pending[path] = fingerprint` gates broad verification and handoff operations.

A denied host tool is not transformed. The denial tells the model which MCP tool to call. Successful MCP PostToolUse updates state, and the model retries the original operation. MCP project tools bypass PreToolUse guards to prevent loops.

This is tested interception coverage, not a claim that every external file mutation is observable.

## Packaging

- `@dotdotgod/context` is published before adapters.
- Claude and Codex depend on it and package small plugin-local server/hook wrappers.
- Claude uses `${CLAUDE_PLUGIN_ROOT}` for its server and hook scripts.
- Codex references root `.mcp.json` and `hooks/hooks.json` through its plugin manifest.
- Pi depends on the runtime package but starts no MCP process.

## Related Behavior And Verification

- Behavior: [`docs/spec/CONTEXT_EXECUTION.md`](../spec/CONTEXT_EXECUTION.md)
- Tests: [`docs/test/CONTEXT_EXECUTION.md`](../test/CONTEXT_EXECUTION.md)
- Cross-agent architecture: [`CROSS_AGENT_ARCHITECTURE.md`](CROSS_AGENT_ARCHITECTURE.md)
