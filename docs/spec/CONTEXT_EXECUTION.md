# Context Execution And Retrieval

## Purpose

Dotdotgod provides a local-first context layer that keeps large command, file, and fetched text outside the model context until bounded processing or retrieval selects useful output.

## Tool Contract

Claude Code and Codex receive one local stdio MCP server with these tools:

- `execute`, `batch_execute`, and `execute_file`;
- `index`, `search`, and `fetch_and_index`;
- `stats`, `doctor`, and `purge`;
- `dotdotgod_project_load`, `dotdotgod_project_impact`, and `dotdotgod_project_initialize`.

Pi exposes native dotdotgod-prefixed execution and context tools over the same core library. Existing Pi project-load lifecycle and graph-impact pending-state behavior remain native and do not proxy through MCP.

## Output Handling

Execution captures child stdout and stderr through internal pipes and temporary files. MCP protocol stdout remains reserved for JSON-RPC.

Output modes are:

- `auto`: return bounded direct output when small and index larger output;
- `direct`: return bounded output and report truncation;
- `indexed`: index output and return metadata instead of raw bytes;
- `discard`: return status and metrics without stream content.

The implementation MUST NOT place the complete large output in a tool response before indexing or filtering. Batch results preserve input order even when commands run concurrently.

## Storage And Search

The context store is a project-local SQLite FTS5 database at `.dotdotgod/context/context.sqlite`. Sources carry scope, session, label, kind, metadata, creation time, and optional expiry.

Supported scopes are transient call, session, and project. Large automatic command output defaults to session scope with expiry. Search returns bounded excerpts and supports source, scope, session, and result-limit filters.

`purge` requires explicit confirmation and exactly one selector: scope, session, or source.

## Execution Safety

- Arbitrary command execution and shell mode are write-capable operations that remain subject to host approval.
- Commands accept either an explicit executable/arguments pair or an explicit shell command string.
- Concurrency is bounded to eight and batch size to one hundred commands.
- Timeouts are bounded and terminate the process group where supported.
- File indexing and URL fetching enforce size bounds.
- URL fetching accepts only HTTP and HTTPS.
- Project initialization defaults to dry-run; writes require `dryRun: false` and `confirmWrite: true`.

## Project Workflow Boundaries

`dotdotgod_project_load` returns a bounded documentation tree and optional local semantic query. It does not reproduce Pi's session-specific pending-only lifecycle.

`dotdotgod_project_impact` accepts one to twenty unique changed paths and returns CLI-equivalent structured impact evidence. It does not mutate Pi extension state when called from Claude Code or Codex.

`dotdotgod_project_initialize` preserves existing initializer behavior and existing files.

## Hook Routing

Claude Code and Codex adapter hooks maintain project/session runtime state under `.dotdotgod/context/runtime/`.

- Session start marks project load as required.
- Substantive shell or write tools are denied until project load succeeds.
- Successful edit tools record changed paths and content fingerprints.
- Broad test, build, lint, verify, commit, push, publish, and deploy commands are denied while impact is pending.
- Denial identifies the required MCP tool; the model calls it and retries the original operation.
- Project MCP tools bypass their own guards.
- Impact clears only paths whose current fingerprint matches the recorded edit.

Hooks do not claim transparent conversion of one tool type into another or automatic retry. Hook coverage is limited to documented and tested host interception points.

## Local-Only Boundary

No remote dotdotgod service is required. The MCP server, process execution, SQLite FTS5 database, temporary files, vector query cache, and graph cache operate locally. `fetch_and_index` accesses the requested remote URL by definition.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/context/src/execute.mjs](../../packages/context/src/execute.mjs)
  - [packages/context/src/store.mjs](../../packages/context/src/store.mjs)
  - [packages/context/src/content.mjs](../../packages/context/src/content.mjs)
  - [packages/context/src/project.mjs](../../packages/context/src/project.mjs)
  - [packages/context/src/hooks.mjs](../../packages/context/src/hooks.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/claude-code/.claude-plugin/plugin.json](../../packages/claude-code/.claude-plugin/plugin.json)
  - [packages/claude-code/hooks/hooks.json](../../packages/claude-code/hooks/hooks.json)
  - [packages/codex/.codex-plugin/plugin.json](../../packages/codex/.codex-plugin/plugin.json)
  - [packages/codex/.mcp.json](../../packages/codex/.mcp.json)
  - [packages/codex/hooks/hooks.json](../../packages/codex/hooks/hooks.json)
- Verified by:
  - [packages/context/test/context.test.mjs](../../packages/context/test/context.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/context/test/adapters.test.mjs](../../packages/context/test/adapters.test.mjs)
  - [docs/test/CONTEXT_EXECUTION.md](../test/CONTEXT_EXECUTION.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
- Related docs:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../arch/CROSS_AGENT_ARCHITECTURE.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- Contracts:
  - `CONTEXT-EXECUTION-TOOLS-001` — Local context tools keep large raw bytes outside model context (sections: 3, implementedBy: 3, verifiedBy: 2, relatedDocs: 1)
  - `CONTEXT-EXECUTION-ADAPTERS-001` — Claude and Codex use MCP while Pi retains native adapter tools (sections: 2, implementedBy: 4, verifiedBy: 3, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs","packages/context/src/content.mjs","packages/context/src/project.mjs","packages/context/src/hooks.mjs","packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/claude-code/hooks/hooks.json","packages/codex/.codex-plugin/plugin.json","packages/codex/.mcp.json","packages/codex/hooks/hooks.json"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/mcp.test.mjs","packages/context/test/adapters.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"contracts":[{"id":"CONTEXT-EXECUTION-TOOLS-001","title":"Local context tools keep large raw bytes outside model context","sections":["Tool Contract","Output Handling","Storage And Search"],"implementedBy":["packages/context/src/server.mjs","packages/context/src/execute.mjs","packages/context/src/store.mjs"],"verifiedBy":["packages/context/test/context.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]},{"id":"CONTEXT-EXECUTION-ADAPTERS-001","title":"Claude and Codex use MCP while Pi retains native adapter tools","sections":["Project Workflow Boundaries","Hook Routing"],"implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/claude-code/.claude-plugin/plugin.json","packages/codex/.codex-plugin/plugin.json","packages/context/src/hooks.mjs"],"verifiedBy":["packages/context/test/adapters.test.mjs","docs/test/CONTEXT_EXECUTION.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}]}
```
