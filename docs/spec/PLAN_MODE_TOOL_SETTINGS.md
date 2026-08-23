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

This lets users opt into external read-oriented tools, such as context-mode tools, without making external plugins part of the default Plan Mode surface. Extra tools remain subject to Plan Mode path, command, and mutation guards.

## Writable Documentation Paths

Project config may define `planMode.writablePaths` as an array of repository-relative exact paths or `/**` subtree patterns contained by the resolved `documentation.root`. The default is `docs/plan/**` and `docs/archive/**`; the defaults follow the configured root; an explicit array replaces that default without rebasing, and an empty array disables general Plan Mode document mutation.


## Prompt Requirements

The full Plan Mode prompt must render the resolved active tool list and writable documentation paths from current settings. The compact prompt must also name the resolved writable paths.

The prompt must not contradict Plan Mode permissions. It should clearly distinguish forbidden source/code/config mutation from allowed durable plan/archive markdown updates.

The prompt should prefer already-loaded project memory and documentation maps before asking the agent to re-read baseline docs.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../packages/pi/extensions/plan-mode/utils.ts)
- Verified by:
  - [packages/pi/test/plan-mode-extension.test.ts](../../packages/pi/test/plan-mode-extension.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../packages/pi/test/plan-mode-utils.test.ts)
  - [docs/test/README.md](../test/README.md)
- Related docs:
  - [docs/spec/PLAN_MODE.md](PLAN_MODE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/PLAN_MODE.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
