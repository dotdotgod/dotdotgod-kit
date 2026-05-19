# Plan Mode Debug And Archive

## Debug Measurement

With `--dd-context-debug`, Plan Mode records local JSONL events for entry, first-request context shaping, planning turn end, compaction request/result, and execution start.

Events include context usage when available, git state, compaction reason, current-work focus, queued/flushed load state, CLI context availability, entry counts, and todo counts. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

## Archive Policy

After implementation and verification, completed task directories should move from:

```text
docs/plan/<task-slug>/
```

to:

```text
docs/archive/plan/<task-slug>/
```

## Traceability

This domain owns the detailed Plan Mode behavior contract. Keep traceability blocks on non-README spec files and keep the compatibility route file so stable Plan Mode links remain valid.

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
