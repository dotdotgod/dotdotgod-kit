# Plan Mode Tool Policy

## Allowed Planning Work

While the authoritative lifecycle is `planning` or `reviewing`:

- Reading files and searching the project are allowed.
- The default active tool list is conservative; see [`../PLAN_MODE_TOOL_SETTINGS.md`](../PLAN_MODE_TOOL_SETTINGS.md) for optional extra installed tools.
- Verified argument-aware read commands are allowed. Unknown simple commands offer Deny, Allow once, or Allow same invocation this session; identifiable native targets also offer Always allow this project and Always allow all projects. Unavailable UI or cancellation denies. Shell operators, wrappers, destructive/implementation commands and unknown tool classes remain blocked. Direct MCP batches authorize every entry before any execution and revalidate context before dispatch.
- `edit` and `write` allow Markdown planning documents under approved roots or exact extra targets, not implementation edits. Source/config and host instruction Markdown remain forbidden. See [policy settings](../PLAN_MODE_TOOL_SETTINGS.md).
- Moving, deleting, or creating directories through shell commands requires execution mode everywhere, including plan/archive paths.
- These planning workflow guards do not provide a filesystem sandbox.

The `executing` and `off` states do not apply these planning-only mutation restrictions. Todo presence or count never grants or revokes mutation permission; only the lifecycle state does.

## Policy and Managed Children

User/project `planMode` configuration remains manually edited; no general policy editor or `/dd:plan-policy` command is provided. Individual eligible command approvals may be remembered in the separate local-user store described in [policy settings](../PLAN_MODE_TOOL_SETTINGS.md), without modifying those configurations. In-context approval activates a trusted project's exact revision separately from generic once/session approvals. Configuration data is separate from runtime activation. Denies win; policy, root, environment, executable identity, mode or session changes invalidate relevant grants. Explicit environment overrides and non-default shell contexts are once-only. Unknown MCP execution is also once-only because Pi cannot attest the separate executor environment; verified built-in reads remain allowed. Git read execution disables external helpers/pagers, and rg ignores inherited config.

Use the existing native `bash` path: `hc run --bg pi --dd-plan [task]` routes internally through explicit launch approval, the audited Pi plugin/bootstrap loadout and inherited ceiling. The child starts without the task; authenticated loaded-plugin readiness must precede task delivery. Missing/failed bootstrap means no task and scoped cleanup, never unrestricted retry. There is no `/dd:plan-child` command or custom manager tool, and no Pi host patch is required.

Existing `hc send/wait/get/read/interrupt/kill/rm` lifecycle operations require an owned child ID; unrelated IDs are rejected. `hc ls` inspection uses generic command approval rather than granting ownership of listed terminals. Stateful hc calls through MCP execution are explicitly denied with guidance to use native `bash`; ordinary read inspections retain their normal policy. Remote launches, templates and custom launch flags are outside this supported Plan Mode route and rejected as scope limitations, not declarations that hc itself lacks those features.

Children inherit activated manual-policy ceilings, not parent once/session or remembered command grants, nor new approval rights. Environment-mismatched persistent activations remain unavailable, never silently rebound. Reload, parent narrowing, disconnect or session change ends authority. Registry-bound cleanup and cancellation are best effort for in-flight operations: trusted plugin/tool controls are not an OS sandbox. Live-host acceptance must be checked separately.

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
  - [packages/pi/extensions/plan-mode/policy/runtime.ts](../../../packages/pi/extensions/plan-mode/policy/runtime.ts)
  - [packages/pi/extensions/plan-mode/policy/invocation.ts](../../../packages/pi/extensions/plan-mode/policy/invocation.ts)
  - [packages/pi/extensions/plan-mode/policy/execution.ts](../../../packages/pi/extensions/plan-mode/policy/execution.ts)
  - [packages/pi/extensions/plan-mode/children/hc-command.ts](../../../packages/pi/extensions/plan-mode/children/hc-command.ts)
  - [packages/pi/extensions/plan-mode/children/manager.ts](../../../packages/pi/extensions/plan-mode/children/manager.ts)
  - [packages/pi/extensions/plan-mode/children/bootstrap.ts](../../../packages/pi/extensions/plan-mode/children/bootstrap.ts)
  - [packages/pi/extensions/plan-mode/policy/durable.ts](../../../packages/pi/extensions/plan-mode/policy/durable.ts)
  - [packages/pi/extensions/plan-mode/policy/admission.ts](../../../packages/pi/extensions/plan-mode/policy/admission.ts)
  - [packages/pi/extensions/plan-mode/policy/native-binary.ts](../../../packages/pi/extensions/plan-mode/policy/native-binary.ts)
  - [packages/pi/extensions/plan-mode/policy/ui.ts](../../../packages/pi/extensions/plan-mode/policy/ui.ts)
- Verified by:
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../../packages/pi/test/context-execution-gates.test.ts)
  - [packages/pi/test/plan-mode-policy-review.test.ts](../../../packages/pi/test/plan-mode-policy-review.test.ts)
  - [packages/pi/test/plan-mode-policy-runtime.test.ts](../../../packages/pi/test/plan-mode-policy-runtime.test.ts)
  - [packages/pi/test/plan-mode-commands.test.ts](../../../packages/pi/test/plan-mode-commands.test.ts)
  - [packages/pi/test/plan-mode-children.test.ts](../../../packages/pi/test/plan-mode-children.test.ts)
  - [docs/test/README.md](../../test/README.md)
  - [packages/pi/test/plan-mode-durable.test.ts](../../../packages/pi/test/plan-mode-durable.test.ts)
  - [packages/pi/test/plan-mode-durable-boundaries.test.ts](../../../packages/pi/test/plan-mode-durable-boundaries.test.ts)
  - [packages/pi/test/plan-mode-admission-handlers.test.ts](../../../packages/pi/test/plan-mode-admission-handlers.test.ts)
- Related docs:
  - [docs/spec/plan-mode/README.md](README.md)
  - [docs/spec/PLAN_MODE_TOOL_SETTINGS.md](../PLAN_MODE_TOOL_SETTINGS.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CODE_CONVENTIONS.md](../../arch/CODE_CONVENTIONS.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts","packages/pi/extensions/plan-mode/policy/runtime.ts","packages/pi/extensions/plan-mode/policy/invocation.ts","packages/pi/extensions/plan-mode/policy/execution.ts","packages/pi/extensions/plan-mode/children/hc-command.ts","packages/pi/extensions/plan-mode/children/manager.ts","packages/pi/extensions/plan-mode/children/bootstrap.ts","packages/pi/extensions/plan-mode/policy/durable.ts","packages/pi/extensions/plan-mode/policy/admission.ts","packages/pi/extensions/plan-mode/policy/native-binary.ts","packages/pi/extensions/plan-mode/policy/ui.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/context-execution-gates.test.ts","packages/pi/test/plan-mode-policy-review.test.ts","packages/pi/test/plan-mode-policy-runtime.test.ts","packages/pi/test/plan-mode-commands.test.ts","packages/pi/test/plan-mode-children.test.ts","docs/test/README.md","packages/pi/test/plan-mode-durable.test.ts","packages/pi/test/plan-mode-durable-boundaries.test.ts","packages/pi/test/plan-mode-admission-handlers.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md"]}
```
