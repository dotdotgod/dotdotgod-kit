# Tool Response Presentation

## Contract

Non-graph-impact dotdotgod tool text is Markdown across Pi and both MCP adapters.
Pi details preserve original data; Pi structuredContent and output schemas expose
JSON-compatible data directly to codemode. MCP structuredContent preserves original
programmatic fields, with existing isError behavior for failures.

Impact-status participates. Native graph-impact and MCP project-impact retain
existing text and metadata contracts. Already-readable native project-load text
retains its guidance and lifecycle behavior.

Inputs, tool names, permissions, confirmations, and operation limits do not change.
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

Pi codemode callers access objects directly; legacy JSON.parse scripts must migrate
and existing sessions must reload. MCP callers read structuredContent, not Markdown.
Graph-impact remains a text-returning call in native codemode. Host policy may
expose structured fields as well; universal JSON invisibility is not guaranteed.

## Verification

- Shared presentation tests cover each included family, multiline fence payloads,
  null/empty results, status/error fields, summary omissions, structured-data
  immutability, smaller representative execution text than JSON, and absence of
  new presentation limits. Character-size comparisons are not token measurements.
- MCP integration verifies Markdown text and separate structured content.
- Public Pi SDK tests prove direct native object access and unchanged graph-impact
  text in the same real codemode script.



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
