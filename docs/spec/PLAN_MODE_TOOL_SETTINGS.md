# Plan Mode Tool Settings

## Purpose

Plan Mode keeps a conservative default tool surface, but users can opt into additional installed tools when a project or local workflow needs them.

## Setting

`--plan-extra-tools` accepts a comma-separated list of extra tool names:

```bash
pi --plan --plan-extra-tools ctx_search,ctx_execute_file
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

Project config may define `planMode.writablePaths` as an array of repository-relative exact paths or `/**` subtree patterns under `docs/`. The default is `docs/plan/**` and `docs/archive/**`; an explicit array replaces that default, and an empty array disables general Plan Mode document mutation.

The resolved policy applies to `edit`/`write` and constrained `mkdir`/`mv`/`rm`/`rmdir` operations. It permits only conventionally named Markdown and safe directory operations, protects configured roots from deletion, and never permits source/config paths, traversal, secret-like paths, arbitrary shell composition, or unsupported file types. Config resolution fails closed to the built-in defaults. The `/plan-goal` checkpoint path remains a narrow system exception, while active-plan tracking and archive lifecycle remain specific to plan/archive paths.

## Prompt Requirements

The full Plan Mode prompt must render the resolved active tool list and writable documentation paths from current settings. The compact prompt must also name the resolved writable paths.

The prompt must not contradict Plan Mode permissions. It should clearly distinguish forbidden source/code/config mutation from allowed durable plan/archive markdown updates.

The prompt should prefer already-loaded project memory and load-snapshot summaries before asking the agent to re-read baseline docs.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../packages/pi/extensions/plan-mode/utils.ts)
- Verified by:
  - [packages/pi/test/plan-mode-utils.test.ts](../../packages/pi/test/plan-mode-utils.test.ts)
  - [docs/test/README.md](../test/README.md)
- Related docs:
  - [docs/spec/PLAN_MODE.md](PLAN_MODE.md)
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/pi test`
  - `pnpm --filter @dotdotgod/pi run typecheck`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/PLAN_MODE.md","docs/arch/EXTENSION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/pi test","pnpm --filter @dotdotgod/pi run typecheck"]}
```
