# Advisory Impact State

The shared context runtime persists observed edits in
`.dotdotgod/context/impact.sqlite`, keyed by host session and project-relative
path. Paths outside the project, dependency/cache/build paths and local plans
are not attributed to the project. Only observed edits are tracked.

`project_impact` snapshots requested revisions and clears only successfully
reviewed, unchanged paths. Failed or cancelled reviews and concurrent re-edits
remain pending. `impact_status` reads pending state without running a review.
`contextSessionId` routes calls on shared MCP connections independently of the
dedicated connection's `session_resume` identity.

Pending state is advisory for adopting Pi/OpenCode integrations. Host permissions
and planning restrictions remain independent. Claude/Codex/Hermes retain their
adapter lifecycle policies.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
- Verified by:
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/impact-state.mjs","packages/context/src/server.mjs"],"verifiedBy":["packages/context/test/impact-state.test.mjs","packages/context/test/mcp.test.mjs"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
