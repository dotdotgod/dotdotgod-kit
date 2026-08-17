# Context Execution Architecture

## Direction

Use one shared runtime package, thin transport/adapter wrappers, and platform-native lifecycle integration.

```text
@dotdotgod/context
├── process capture and file processing
├── chunking and FTS5 storage/search
├── fetch/index operations
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
