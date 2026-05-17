# Plan Mode Tool Settings

## Purpose

Plan Mode keeps a conservative default tool surface, but users can opt into additional installed tools when a project or local workflow needs them.

## Setting

`--plan-extra-tools` accepts a comma-separated list of extra tool names:

```bash
pi --plan --plan-extra-tools ctx_search,ctx_execute_file
```

Behavior:

- Default Plan Mode tools remain unchanged when the setting is absent.
- Extra tool names are appended after the default Plan Mode tools.
- Duplicate names are removed while preserving order.
- Invalid tool-name tokens are ignored.
- Tool names that are not installed in the current Pi session are ignored.
- The resolved active tool list is used both for `pi.setActiveTools()` and for the hidden full Plan Mode prompt.

This lets users opt into external read-oriented tools, such as context-mode tools, without making external plugins part of the default Plan Mode surface.

## Prompt Requirements

The full Plan Mode prompt must render the resolved active tool list from current settings.

The prompt must not contradict Plan Mode permissions. It should clearly distinguish forbidden source/code/config mutation from allowed durable plan/archive markdown updates.

The prompt should prefer already-loaded project memory and load-snapshot summaries before asking the agent to re-read baseline docs.

## Traceability

```json dotdotgod
{
  "kind": "spec",
  "implementedBy": [
    "packages/pi/extensions/plan-mode/index.ts",
    "packages/pi/extensions/plan-mode/utils.ts"
  ],
  "verifiedBy": [
    "packages/pi/test/plan-mode-utils.test.ts",
    "docs/test/README.md"
  ],
  "relatedDocs": [
    "docs/spec/PLAN_MODE.md",
    "docs/arch/EXTENSION_ARCHITECTURE.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/pi test",
    "pnpm --filter @dotdotgod/pi run typecheck"
  ]
}
```
