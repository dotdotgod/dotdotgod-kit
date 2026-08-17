# Context Execution Verification

## Automated Coverage

`packages/context/test/context.test.mjs` covers:

- bounded overlapping chunk creation;
- FTS5 indexing, ranked search, scope filters, and source purge;
- small direct output and large indexed output;
- ordered batch results under concurrency;
- file processing without returning source bytes;
- destructive purge selector validation.

`packages/context/test/mcp.test.mjs` starts the real stdio server and verifies:

- MCP initialization succeeds;
- `tools/list` exposes the complete context and project workflow surface;
- a structured tool call succeeds without protocol stdout corruption.

`packages/context/test/adapters.test.mjs` starts both Claude Code and Codex MCP wrappers from working directories outside their plugin directories and verifies all twelve tools plus `doctor`.

Pi typecheck and adapter package verification cover native imports, packaged MCP wrappers, hook resources, manifests, and package allowlists.

## Required Regression Cases

Add or preserve focused cases for:

- nonzero exit, spawn failure, timeout, abort, and process-group cleanup;
- stdout/stderr identity, Unicode, huge lines, binary-like bytes, JSON, logs, and Markdown;
- automatic direct/indexed threshold and response-size bound;
- concurrent session/project isolation;
- TTL expiry and scoped purge;
- URL protocol, HTTP error, timeout, and response-size bounds;
- initializer dry-run default and explicit write confirmation;
- project-load query and project-impact 20-path bound;
- hook recursion bypass, retry cap, stale fingerprint, and unsupported-tool gaps.

## Manual Adapter Verification

Follow [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Verify Claude Code and Codex from working directories different from the installed plugin path. Confirm the local MCP server starts, hooks follow host trust rules, large output is indexed without appearing in full, and denial messages lead to a successful MCP call followed by retry.

Verify Pi registers native tools and does not start a dotdotgod MCP child process.

## Commands

```bash
pnpm --filter @dotdotgod/context verify
pnpm --filter @dotdotgod/pi verify
pnpm --filter @dotdotgod/claude-code verify
pnpm --filter @dotdotgod/codex verify
pnpm run verify:generated
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
pnpm run pack:dry-run
```
