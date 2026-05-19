# Plan Mode Workflow

## Planning Context Shaping

After Plan Mode is enabled, the first user planning request triggers one context-shaping pass. The request may be sent as a separate message after `/plan`, or inline as `/plan <request>`; inline requests enable Plan Mode before delivery and then use the same context shaping and request-framing path.

1. Queue a curated project-memory load if baseline project docs are missing, recent memory load is absent, or context has narrowed to one documentation area while the request needs cross-area planning.
2. Request planning-focused compaction if context is too large or noisy.
3. If both are needed, compact first, then flush the queued load from `agent_end`.

The curated load uses the `/dd:load` default surface: baseline files, docs indexes, specs, architecture, tests, and active plans. It excludes full repository scans and archive bodies unless targeted. When the CLI is available, Plan Mode validates, refreshes a bounded load snapshot, and runs advisory `graph impact --json` checks for likely target files.

## Planning-Focused Compaction

Plan Mode requests compaction only when context is likely to hurt plan quality. It checks once after the first planning request. Subsequent turns record metrics but do not rerun load/compaction decisions.

The extension passes planning-specific `customInstructions` to `ctx.compact()`. Compaction should preserve the latest request, decisions, active plan status, targets, relevant spec/test/arch context, validation/index/impact summaries, implementation decisions, verification outcomes, risks, next steps, and completed `[DONE:n]` markers.

Compaction demotes old completed plans unless relevant, repeated load summaries, unrelated publish history, recoverable Plan Mode boilerplate, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Moderately proactive thresholds are:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

The extension skips compaction during execution and continues if compaction fails. Toggle Plan Mode off/on for a fresh context-shaping pass.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions. The first active planning turn receives the full safety/workflow prompt; subsequent turns receive a compact reminder. Planning turns frame advisory requests lightly, convert implementation-looking requests into durable plans first, use curated load flow for memory-load requests, and use the execution path for explicit execution requests. If `/plan <request>` is invoked while Plan Mode is already active, the request is sent as another planning request and Plan Mode remains enabled.

When the agent creates or updates an active plan markdown file under `docs/plan/`, plan mode asks whether to execute, stay in plan mode, or refine the plan. If the user explicitly asks to execute a named active plan, Plan Mode resolves it and enters execution even if the file was not modified in the current turn.

Plan files remain the durable review artifact. Plan Mode stores the current active plan README path so execution prompts, resume, and compaction summaries can refer to it after context changes.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic template labels are ignored so they do not become execution todos.

When execution starts:

- Full tool access is restored.
- The execute follow-up names the active plan path when known.
- Remaining steps are loaded from the selected README when needed.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- After modification or coding work, execution guidance requires `dotdotgod validate` before final completion.
- `/todos` displays completion progress.

When all tracked steps are complete, plan execution state is cleared without an additional preview/message. Plan completion does not auto-index by default; cache-refresh hooks are opt-in and run only after all steps have `[DONE:n]` markers.

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
