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

Pi registers its context MCP connection with the active session working directory
as both `cwd` and `DOTDOTGOD_PROJECT_ROOT`. A parent context executor's inherited
project root MUST NOT redirect the connection to another project's store.
Project impact/status still use the host session identity after context resume.

Pending state is advisory for adopting Pi/OpenCode integrations. Host permissions
and planning restrictions remain independent. Claude/Codex/Hermes retain their
adapter lifecycle policies.

Pending records expire under the fixed 24-hour context retention policy.
Expiry does not prove that a review succeeded. See `CONTEXT_RETENTION.md`.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/context/src/impact-state.mjs](../../packages/context/src/impact-state.mjs)
  - [packages/context/src/server.mjs](../../packages/context/src/server.mjs)
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
- Verified by:
  - [packages/context/test/impact-state.test.mjs](../../packages/context/test/impact-state.test.mjs)
  - [packages/context/test/mcp.test.mjs](../../packages/context/test/mcp.test.mjs)
  - [packages/pi/test/context-root-isolation.test.ts](../../packages/pi/test/context-root-isolation.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../packages/pi/test/context-execution-gates.test.ts)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/context/src/impact-state.mjs","packages/context/src/server.mjs","packages/pi/extensions/context-tools/index.ts"],"verifiedBy":["packages/context/test/impact-state.test.mjs","packages/context/test/mcp.test.mjs","packages/pi/test/context-root-isolation.test.ts","packages/pi/test/context-execution-gates.test.ts"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
