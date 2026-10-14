# Plan Mode Tool Settings

## Purpose

Plan Mode keeps a conservative default tool surface, but users can opt into additional installed tools when a project or local workflow needs them.

## Setting

`--plan-extra-tools` accepts a comma-separated list of extra tool names:

```bash
pi --dd-plan --plan-extra-tools ctx_search,ctx_execute_file
```

Behavior:

- The default Plan Mode tool list applies when the setting is absent.
- Extra tool names are appended after the default Plan Mode tools.
- Duplicate names are deduplicated while preserving order.
- Invalid tool-name tokens are ignored.
- Tool names that are not installed in the current Pi session are ignored.
- The resolved active tool list is used both for `pi.setActiveTools()` and for the hidden full Plan Mode prompt.

This lets users opt into external read-oriented tools, such as context-mode tools, without making external plugins part of the default Plan Mode surface. Extra tools remain subject to Plan Mode command and mutation guards.

## Planning Document Writes

Markdown planning documents may be written at any location. Non-Markdown source/config writes and implementation edits require execution mode. This is a workflow guard, not a filesystem sandbox. Legacy `planMode.writablePaths` is deprecated: accepted for compatibility, ignored on load, and omitted from normalized configuration. Plan/archive paths remain routing conventions, not authorization.


## Prompt Requirements

The full Plan Mode prompt renders the resolved active tool list; both prompts explain the location-independent planning-document exception and use the configured documentation root for durable plan routing.

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
- Verified by:
  - [packages/pi/test/plan-mode-extension.test.ts](../../packages/pi/test/plan-mode-extension.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/context-execution-gates.test.ts](../../packages/pi/test/context-execution-gates.test.ts)
  - [docs/test/README.md](../test/README.md)
- Related docs:
  - [docs/spec/PLAN_MODE.md](PLAN_MODE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts","packages/pi/extensions/plan-mode/runtime/paths.ts","packages/pi/extensions/plan-mode/tools.ts","packages/pi/extensions/plan-mode/prompts.ts"],"verifiedBy":["packages/pi/test/plan-mode-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/context-execution-gates.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/PLAN_MODE.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
