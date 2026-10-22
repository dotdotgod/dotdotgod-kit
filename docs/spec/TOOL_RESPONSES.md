# Tool Response Presentation

## Contract

Non-graph-impact shared tool text is Markdown across MCP adapters.
MCP structuredContent preserves original programmatic fields, with existing
isError behavior for failures. Pi's host MCP tools expose the complete MCP envelope
through their structuredContent to codemode; transcript details are host metadata.

Impact-status participates. MCP project-impact retains its text and metadata
contract. Pi has no native graph-impact/status forwarding tools. Native
project_memory_load retains compact Load text, guidance, and lifecycle behavior.

Presentation does not change inputs, permissions, confirmations, or operation limits.
No new Markdown size budget or format-selection argument is introduced.
Structured data retains all original fields, result ordering, null values, and
status flags. Markdown is a summary: short metadata values appear inline; empty
stdout/stderr and null error/signal fields are omitted. Successful execution omits
working directory, environment policy, timing/byte counts, and false default flags;
failed execution retains diagnostic metadata and false status flags. True timeout,
abort, capture-limit, and truncation indicators, exit codes, outputs, and source IDs
remain visible. Search summaries omit duplicate provenance and ranking metadata,
while retaining source IDs, labels, locations, and excerpts. Other tool results
retain their fields, with compact scalar and array formatting. No payload is
shortened or newly capped. Command and retrieved text use payload-safe fenced
blocks; retrieved data is not authoritative, and partial evidence or no matches
must not be interpreted as complete inspection.

Pi/OpenCode MCP callers inspect isError and structuredContent on the MCP envelope,
not Markdown. Individual shared tool names are unprefixed; Pi forwarding aliases
are removed. Reload existing sessions after upgrading.
Hermes native wrappers return a JSON envelope containing content and
structuredContent, not Pi codemode objects; its project-load map/query result is
host-specific. Shared context MCP payloads and graph-impact presentation remain
unchanged. See [HERMES_ADAPTER.md](HERMES_ADAPTER.md).
Pi project-impact also returns the MCP envelope in codemode; tool validation or
permission failures may reject separately from server-reported isError responses.

## Verification

- Shared presentation tests cover each included family, multiline fence payloads,
  null/empty results, status/error fields, summary omissions, structured-data
  immutability, smaller representative execution text than JSON, and absence of
  new presentation limits. Character-size comparisons are not token measurements.
- MCP integration verifies Markdown text and separate structured content.
- Public Pi SDK tests prove native structured-value access and raw MCP envelopes
  in the same real codemode script, including schema-failure rejection.



## Traceability

<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/presentation.mjs](../../packages/context/src/presentation.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/pi/extensions/project-memory/index.ts](../../packages/pi/extensions/project-memory/index.ts)
  - [packages/pi/extensions/plan-mode/index.ts](../../packages/pi/extensions/plan-mode/index.ts)
- Verified by:
  - [packages/context/test/presentation.test.mjs](../../packages/context/test/presentation.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/pi/test/structured-output.test.ts](../../packages/pi/test/structured-output.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
- Related docs:
  - [docs/spec/PI_CONTEXT_TOOL_SELECTION.md](PI_CONTEXT_TOOL_SELECTION.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/presentation.mjs","packages/context/src/server.mjs","packages/pi/extensions/context-tools/index.ts","packages/pi/extensions/project-memory/index.ts","packages/pi/extensions/plan-mode/index.ts"],"verifiedBy":["packages/context/test/presentation.test.mjs","packages/context/test/mcp.test.mjs","packages/pi/test/structured-output.test.ts","packages/pi/test/context-codemode.test.ts"],"relatedDocs":["docs/spec/PI_CONTEXT_TOOL_SELECTION.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
