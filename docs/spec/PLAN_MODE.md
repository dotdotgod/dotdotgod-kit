# Plan Mode

Plan Mode is now documented as a focused domain under [`plan-mode/`](plan-mode/README.md).

Use this file as the compatibility route for existing links. The split keeps the same behavior contract while making the default docs surface easier to load selectively.

## Domain Files

- [`plan-mode/README.md`](plan-mode/README.md): purpose, commands, allowed work summary, and routing.
- [`plan-mode/WORKFLOW.md`](plan-mode/WORKFLOW.md): context shaping, compaction, review choice, and execution workflow.
- [`plan-mode/TOOL_POLICY.md`](plan-mode/TOOL_POLICY.md): planning tool and command boundaries.
- [`plan-mode/DEBUG_AND_ARCHIVE.md`](plan-mode/DEBUG_AND_ARCHIVE.md): debug measurement, archive policy, and traceability.

## Compatibility Summary

`plan-mode` is a Pi extension that provides safe planning before source changes. It allows read-only project inspection, local plan/archive markdown updates, conservative local-memory housekeeping, bounded dotdotgod context/status commands, and later execution with todo tracking once the user chooses to proceed.

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
    "docs/spec/plan-mode/README.md",
    "docs/spec/PLAN_MODE_TOOL_SETTINGS.md",
    "docs/arch/EXTENSION_ARCHITECTURE.md",
    "docs/arch/CODE_CONVENTIONS.md",
    "docs/spec/IMPACT_RANKING_CONFIG.md"
  ],
  "verificationCommands": [
    "pnpm --filter @dotdotgod/pi test",
    "pnpm --filter @dotdotgod/pi run typecheck",
    "node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"
  ]
}
```
