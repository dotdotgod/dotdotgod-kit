# Context Search Recovery

## Failure Diagnostic Guidance

For failed commands whose output is indexed, start with `fail OR error OR reason`, constrained by the returned source ID and appropriate session/scope filters. If no result matches, try concrete diagnostic terms or bounded wildcard browsing. This is advisory guidance, not automatic search or command re-execution.

No matches mean no match for that query, not that diagnostics are absent. Partial excerpts cannot prove complete inspection. Without supporting evidence, report the cause as unverified rather than absent.

## Wildcard Browse Contract

- Exact `*`, ignoring surrounding whitespace, browses indexed chunks without keyword matching.
- Source/scope/session predicates apply before candidate selection. Expired sources are removed as in ordinary search.
- Order: newest source creation first, source ID ascending for ties, then chunk ordinal ascending.
- Existing result-limit handling remains: 1–50 returned excerpts, with a bounded candidate list.
- Existing result fields, provenance, trust, and `instructionAuthority: "none"` remain unchanged.
- Each result is a bounded excerpt from the beginning of a chunk, not the full chunk or log. There is no pagination or complete-inspection guarantee.
- Missing matching sources return empty results. Other punctuation-only queries remain invalid.
- This does not enable arbitrary FTS syntax, general glob matching, or prefix wildcard queries.
- Pi native tools, codemode nested calls, and MCP use the same shared store behavior. Permissions and exposure do not change.

## Verification And Limits

`packages/context/test/search-recovery.test.mjs` verifies retrieval of a middle `FAIL quota exceeded` diagnostic in long retained nonzero stderr, plus wildcard limits, filtering, expiry, ordering, and provenance. Public Pi SDK tests verify native/codemode wildcard calls and delivery of recovery guidance.

These are deterministic integration checks, not proof that a live model always follows the guidance. The previous model evaluation remains historical; it has not been rerun for this change.

## Related Docs

- [Context execution](CONTEXT_EXECUTION.md): shared runtime and retrieval contract.
- [Pi selection](PI_CONTEXT_TOOL_SELECTION.md): active tool guidance and safety boundaries.
- [Context tests](../test/CONTEXT_EXECUTION.md): regression strategy.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/store.mjs](../../packages/context/src/store.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [AGENTS.md](../../AGENTS.md)
- Verified by:
  - [packages/context/test/search-recovery.test.mjs](../../packages/context/test/search-recovery.test.mjs)
  - [packages/pi/test/context-workflow.test.ts](../../packages/pi/test/context-workflow.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
  - [docs/test/CONTEXT_EXECUTION.md](../test/CONTEXT_EXECUTION.md)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/spec/PI_CONTEXT_TOOL_SELECTION.md](PI_CONTEXT_TOOL_SELECTION.md)
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/store.mjs","packages/context/src/server.mjs","packages/pi/extensions/context-tools/index.ts","AGENTS.md"],"verifiedBy":["packages/context/test/search-recovery.test.mjs","packages/pi/test/context-workflow.test.ts","packages/pi/test/context-codemode.test.ts","docs/test/CONTEXT_EXECUTION.md"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/spec/PI_CONTEXT_TOOL_SELECTION.md","docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
