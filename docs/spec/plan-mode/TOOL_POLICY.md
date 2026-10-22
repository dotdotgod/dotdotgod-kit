# Plan Mode Tool Policy

## Allowed Planning Work

While the authoritative lifecycle is `planning` or `reviewing`:

- Reading files and searching the project are allowed.
- The default active tool list is conservative; see [`../PLAN_MODE_TOOL_SETTINGS.md`](../PLAN_MODE_TOOL_SETTINGS.md) for optional extra installed tools.
- Read-only bash commands are allowed through an allowlist. Dotdotgod execution, including direct MCP and nested codemode calls, checks every command in its required commands array against the same Plan Mode policy. Explicit cwd is allowed. Pending impact is advisory, not a gate.
- `edit` and `write` allow Markdown planning documents at any location, not implementation edits. Non-Markdown source/config writes require execution mode.
- Moving, deleting, or creating directories through shell commands requires execution mode everywhere, including plan/archive paths.
- These planning workflow guards do not provide a filesystem sandbox.

The `executing` and `off` states do not apply these planning-only mutation restrictions. Todo presence or count never grants or revokes mutation permission; only the lifecycle state does.

## Dotdotgod Commands

Bounded dotdotgod context/status commands are auto-allowed when invoked directly as `dotdotgod ...` or through `node packages/cli/bin/dotdotgod.mjs ...`:

- `status`
- `query`
- `resolve`
- `expand`
- `graph impact`
- `graph communities`
- read-only `config`
- `index`

`index`, `query`, `resolve`, `expand`, `graph impact`, and `graph communities` are project-content safe but may create or refresh ignored `.dotdotgod/` cache metadata. They must not modify source, docs, or config files.



## Pending Impact Checks

Successful observed source/config edit and write results create durable session-local pending records. Pi injects a bounded hidden reminder without a persistent widget. The read-only status tool exposes pending paths. Pending impact never blocks edits, verification, commits, pushes or publishing and adds no approval dialog. Plan Mode and user permission restrictions remain separate.

`/impact-check` requests MCP project_impact review of pending and explicitly selected git-changed paths in batches of at most twenty. No native graph-impact/status forwarding tool is registered. Successful shared reviews clear only covered unchanged revisions; failures, cancellation and edits during review retain pending state. Manual shell command text alone does not clear records. Plan/archive, cache, dependency and build paths are excluded. Shell/external/unrecognized changes need explicit paths; all pre-existing git changes are not attributed to the session automatically.

## Verification by Change Type

Use impact checks for source/config changes and for broad tests, commits, pushes, or publishing that follow source/config edits. The check should guide related docs, tests, commands, package resources, and follow-up reads before final verification.

For docs-only changes, prefer documentation verification first: update the nearest README index when files are added, moved, split, or archived, then run `dotdotgod validate` when the CLI is available. Run targeted tests only when the docs define behavior that code must satisfy or when traceability points to a regression check.

For `docs/plan/` and `docs/archive/` housekeeping, impact checks are not required. Keep these changes bounded to plan/archive paths and preserve the archive routing map.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../../packages/pi/extensions/plan-mode/utils.ts)
- Verified by:
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../../packages/pi/test/context-execution-gates.test.ts)
  - [docs/test/README.md](../../test/README.md)
- Related docs:
  - [docs/spec/plan-mode/README.md](README.md)
  - [docs/spec/PLAN_MODE_TOOL_SETTINGS.md](../PLAN_MODE_TOOL_SETTINGS.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CODE_CONVENTIONS.md](../../arch/CODE_CONVENTIONS.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/context-execution-gates.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md"]}
```
