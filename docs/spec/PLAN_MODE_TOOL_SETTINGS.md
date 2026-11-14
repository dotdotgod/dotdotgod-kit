# Plan Mode Tool Settings

## Purpose

Plan Mode keeps a conservative default tool surface, but users can opt into additional installed tools when a project or local workflow needs them.

## Setting

`--plan-extra-tools` accepts a comma-separated list of extra tool names:

```bash
pi --dd-plan --plan-extra-tools mcp__dotdotgod_context__search,mcp__dotdotgod_context__stats
```

Behavior:

- The default Plan Mode tool list applies when the setting is absent.
- Extra tool names are appended after the default Plan Mode tools.
- Duplicate names are deduplicated while preserving order.
- Invalid tool-name tokens are ignored.
- Tool names that are not installed in the current Pi session are ignored.
- The resolved active tool list is used both for `pi.setActiveTools()` and for the hidden full Plan Mode prompt.

This lets users opt into installed read-oriented tools without expanding the default surface. Discover exact host-qualified MCP names; forwarding aliases are not registered. Extra tools remain subject to Plan Mode command and mutation guards; adding execute_file does not authorize it while planning.

MCP executor environments are not attested: unknown commands are non-reusable and once-only, not session/persistent grants. Verified built-in safe reads remain allowed.

## Planning Document Writes

Built-in roots are `docs/plan/**` and `docs/archive/report/**`, including routing README files. Activated project metadata may select active-task-intent roots or `documentation.root/plan` and the corresponding report/archive routing paths. Unactivated projects use built-in roots only.

Additional eligible Markdown targets offer deny/once/session approval for that exact canonical planning edit/write target. No sibling or implementation permission is implied. Source/config, host instructions (`AGENTS.md`, `CLAUDE.md`, `CODEX.md`, `.pi/**`) and escaping symlinks remain denied. Shell moves/deletions and arbitrary directory creation require execution mode. These trusted workflow controls are not a filesystem sandbox.

`planMode.commands` contains exact `{effect, executable, args, cwd}` rules; `markdown.allow/deny` use exact paths or terminal `/**` subtrees. Empty allow lists add no paths; denies can exclude defaults. User and activated project additions are additive, with deny precedence. Legacy `writablePaths` is ignored. CLI config output shows project data, not Pi trust.

Edit `planMode` manually through the existing user/project configuration; there is no policy-saving UI or `/dd:plan-policy` command. In-context approval explicitly activates the exact trusted project revision separately from generic once/session command and Markdown approvals. Project changes require activation again. Headless operation cannot grant unknown commands or activate new project policy.


## Prompt Requirements

The full Plan Mode prompt renders the resolved active tool list; prompts distinguish default roots and explicit extra planning targets from implementation authority and use the configured documentation root for routing. `--dd-plan` startup restriction wins over restored off/executing state. Managed child startup additionally requires verified plugin readiness before parent task delivery; see [tool policy](plan-mode/TOOL_POLICY.md).

The managed loadout does not discover custom-provider extensions. A selected model requiring one may fail startup/readiness: deliver no task, report failure and clean up the run. Never silently substitute another model or unrestricted launch.

The prompt must not contradict Plan Mode permissions. It should clearly distinguish forbidden source/code/config mutation from allowed durable plan/archive markdown updates.

The prompt should prefer already-loaded project memory and documentation maps before asking the agent to re-read baseline docs.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../packages/pi/extensions/plan-mode/utils.ts)
  - [packages/pi/extensions/plan-mode/runtime/paths.ts](../../packages/pi/extensions/plan-mode/runtime/paths.ts)
  - [packages/pi/extensions/plan-mode/tools.ts](../../packages/pi/extensions/plan-mode/tools.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../packages/pi/extensions/plan-mode/prompts.ts)
  - [packages/pi/extensions/plan-mode/policy/runtime.ts](../../packages/pi/extensions/plan-mode/policy/runtime.ts)
  - [packages/pi/extensions/plan-mode/policy/markdown.ts](../../packages/pi/extensions/plan-mode/policy/markdown.ts)
  - [packages/pi/extensions/plan-mode/policy/storage.ts](../../packages/pi/extensions/plan-mode/policy/storage.ts)
- Verified by:
  - [packages/pi/test/plan-mode-extension.test.ts](../../packages/pi/test/plan-mode-extension.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../packages/pi/test/context-execution-gates.test.ts)
  - [packages/pi/test/plan-mode-policy-review.test.ts](../../packages/pi/test/plan-mode-policy-review.test.ts)
  - [packages/pi/test/plan-mode-policy-storage.test.ts](../../packages/pi/test/plan-mode-policy-storage.test.ts)
  - [packages/pi/test/plan-mode-policy-runtime.test.ts](../../packages/pi/test/plan-mode-policy-runtime.test.ts)
  - [docs/test/README.md](../test/README.md)
- Related docs:
  - [docs/spec/PLAN_MODE.md](PLAN_MODE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts","packages/pi/extensions/plan-mode/runtime/paths.ts","packages/pi/extensions/plan-mode/tools.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/policy/runtime.ts","packages/pi/extensions/plan-mode/policy/markdown.ts","packages/pi/extensions/plan-mode/policy/storage.ts"],"verifiedBy":["packages/pi/test/plan-mode-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/context-execution-gates.test.ts","packages/pi/test/plan-mode-policy-review.test.ts","packages/pi/test/plan-mode-policy-storage.test.ts","packages/pi/test/plan-mode-policy-runtime.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/PLAN_MODE.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
