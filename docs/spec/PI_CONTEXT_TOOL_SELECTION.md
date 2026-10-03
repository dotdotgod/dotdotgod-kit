# Pi Context Tool Selection

## Purpose

Guide native Pi and codemode callers toward bounded execution and retrieval while preserving host permissions.

## Selection Contract

- `dotdotgod_execute` is the sole command tool. Input requires `commands` (1..100 entries), with optional `concurrency`, `cwd`, and `timeoutMs`. Group independent known commands; separate dependent commands. Results always contain ordered `results`, including single-command calls.
- Pi descriptions and active-tool prompt guidance recommend `dotdotgod_execute` with `auto` for commands whose output size is unknown, including `tools.dotdotgod_execute` inside codemode.
- Known-large output needed for retrieval uses `indexed`; `discard` is appropriate only when status suffices. Short located source and images remain direct-read cases.
- Guidance MUST NOT force routing, enable codemode automatically, retry write-capable commands silently, or authorize a blocked command.
- Context FTS retrieval does not require document-query embeddings.

## Native Results In Codemode

Native context tools expose output schemas and structuredContent for direct object access in codemode. Model-facing content is Markdown; Pi details and MCP structuredContent preserve programmatic data. Codemode callers MUST access object fields directly, without JSON.parse, and SHOULD return bounded metadata/evidence rather than complete results. Existing external JSON.parse scripts require migration and sessions require reload. Graph-impact tools retain their existing text contracts; impact-status uses structured access. Codemode's small-value store is for source IDs or cursors, not raw logs.

Execution failure can return `ok: false` without a thrown tool error. Callers inspect each `results` entry's `code`, `timedOut`, `aborted`, and `captureLimitExceeded`; tool-call errors may reject separately. Search uses the returned source ID and bounded limits. For failure diagnostics, guidance recommends `fail OR error OR reason`, followed by concrete diagnostic terms or bounded `*` browsing with the same filters when needed. Empty results mean no match, not tool failure or complete verification. Wildcard excerpts also do not prove full inspection; unsupported causes must be reported as unverified, not absent.

The execution source is each result's `indexed.id`; file ingestion returns `id`, while directory ingestion reports individual IDs in `indexed`. Scope/session/source filters constrain retrieval before ranking.

## SDK And Safety Boundary

The source checkout pins Pi agent-core, AI, coding-agent, and TUI development dependencies to `1.0.0` for public SDK codemode tests; these SDK packages require Node `>=22.19.0`. Published host peer ranges and `pi-subagents` remain unchanged.

Codemode nested calls traverse Pi's tool pipeline. This does not establish complete Plan Mode/impact coverage for every execution entrypoint. Guidance does not authorize bypassing restrictions; each command in the array passes the existing Plan Mode allowlist and impact gates before the batch starts.

Deterministic integration tests verify real SDK tools/scripts and guidance delivery, not real model adoption. Actual tool-choice evaluation requires separately observed model runs.

## Related Docs

- [Context execution](CONTEXT_EXECUTION.md): output, retrieval, and security contracts.
- [Context verification](../test/CONTEXT_EXECUTION.md): workflow and SDK regression coverage.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/context-tools/index.ts](../../packages/pi/extensions/context-tools/index.ts)
  - [packages/pi/package.json](../../packages/pi/package.json)
  - [AGENTS.md](../../AGENTS.md)
- Verified by:
  - [packages/pi/test/context-workflow.test.ts](../../packages/pi/test/context-workflow.test.ts)
  - [packages/pi/test/context-codemode.test.ts](../../packages/pi/test/context-codemode.test.ts)
  - [packages/pi/test/sdk-compatibility.test.ts](../../packages/pi/test/sdk-compatibility.test.ts)
  - [docs/test/CONTEXT_EXECUTION.md](../test/CONTEXT_EXECUTION.md)
- Related docs:
  - [docs/spec/CONTEXT_EXECUTION.md](CONTEXT_EXECUTION.md)
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
  - [packages/pi/README.md](../../packages/pi/README.md)
- Design decisions:
  - [docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md](../arch/CONTEXT_EXECUTION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/context-tools/index.ts","packages/pi/package.json","AGENTS.md"],"verifiedBy":["packages/pi/test/context-workflow.test.ts","packages/pi/test/context-codemode.test.ts","packages/pi/test/sdk-compatibility.test.ts","docs/test/CONTEXT_EXECUTION.md"],"relatedDocs":["docs/spec/CONTEXT_EXECUTION.md","docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md","packages/pi/README.md"],"designDecisions":["docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md"]}
```
