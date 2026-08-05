# Plan Mode Workflow

## Planning Context Shaping

After Plan Mode is enabled, the first user planning request triggers one context-shaping pass. Inline `/dd:plan <request>` arguments use the same path, and synthetic planning requests use explicit follow-up delivery.

1. Mark curated project-memory load as pending when baseline docs are missing or recent memory load is absent. Plan Mode MUST NOT infer cross-area load needs from free-form keywords.
2. Request planning-focused compaction if context is too large or noisy.
3. If both are needed, mark focused load as required on the current planning turn, then compact before substantive planning continues.

For a pending automatic load, Plan Mode activates the read-only `dotdotgod_project_load` tool and requires the agent to call it before substantive planning. The extension decides whether loading is needed; the agent generates a concise semantic `focus` from the current task's behavior, architecture, likely source areas, and verification needs. The focus MUST NOT be a verbatim copy of the planning request or deterministic keyword extraction. A non-empty focus uses the existing query results and depth-three documentation map; an intentionally empty focus uses the depth-five map without a query. The tool result returns curated memory in the same turn, after which the agent continues the original request. Latest-request selection skips synthetic load and compaction prompts.

Planning reuses loaded memory and the map. A focused query routes selective doc and source reads. Impact review starts after likely changed files are known and refines plan targets, risks, and verification.

## Plan Sizing

Plan Mode should create a durable `docs/plan/<task-slug>/README.md` when the work is large, risky, multi-file, behavior-changing, architecture-changing, CLI/API-affecting, source/config-heavy, or likely to be paused and resumed by another agent.

Small work does not need a durable plan file before execution when the requested change is obvious and bounded, such as a typo fix, a single-file documentation clarification, a targeted test or validation run, or a one-file bug fix with an unambiguous implementation path. For those tasks, an in-chat checklist is enough unless the user explicitly asks for a saved plan.

If a small task grows into broader source/config or behavior work, the agent should stop, create or update a durable plan, and ask whether to execute, stay in plan mode, or refine.

## Planning-Focused Compaction

Plan Mode requests compaction only when context is likely to hurt plan quality. It checks once after the first planning request. Subsequent turns record metrics but do not rerun load/compaction decisions.

The extension passes planning-specific `customInstructions` to `ctx.compact()`. Compaction should preserve the latest request, decisions, active plan status, targets, relevant spec/test/arch context, validation/index/impact summaries, implementation decisions, verification outcomes, risks, next steps, and completed `[DONE:n]` markers.

Compaction demotes old completed plans unless relevant, repeated load summaries, unrelated publish history, recoverable Plan Mode boilerplate, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Moderately proactive thresholds are:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

After successful automatic compaction, the already-active planning run continues from the compacted context. The extension does not create a synthetic user-role resume message or duplicate the latest request. When focused project-memory load is also needed, the current turn receives the pending load requirement before compaction starts and calls the tool before substantive planning. Inline `/dd:plan <request>` arguments remain authoritative before their synthetic command-delivery message reaches the transcript. Legacy persisted resume prompts are recognized as runtime messages but are not replayed.

The extension skips compaction during execution and continues if compaction fails. Toggle Plan Mode off/on for a fresh context-shaping pass.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions: full prompt on the first active planning turn, compact reminder later. Free-form prose is advisory/planning context for the LLM, not keyword-classified implementation intent. Explicit load commands or missing baseline context trigger load flow. Structured execution handoff text such as `Execute the plan in docs/plan/<task-slug>/README.md` triggers execution flow. `/dd:plan <request>` sends a planning follow-up and suppresses the execution chooser for that turn. `/dd:plan <path>` loads an active-plan README or task directory and restores internal todo state from its `Plan:` section.

When the agent creates or updates an active plan markdown file under `docs/plan/`, interactive Plan Mode first checks the README for `Discussion Queue`. Queue items use rows such as `- [ ] Q1 scope blocks-execute-review: <question>` plus fields (`Why`, `Affects`, `Options`, `Recommended`, `Verification impact`, `Status`). `Recommended:` names option labels structurally; option prose is not scanned for recommendation words. Checked items and answered, deferred, or accepted-risk items are resolved; others display in file order.

If unresolved discussion items exist, Plan Mode suppresses execute/stay/refine/cancel review and opens the Discussion Queue Console. The console supports option selection, custom answers, deferral, research requests, plan revision, or cancel. Follow-up prompts ask the agent to update durable plan markdown rather than arbitrary prose directly.

The same queue-first ordering applies to explicit execution requests. If the custom queue UI is unavailable, Plan Mode falls back to `ctx.ui.select()` plus `ctx.ui.editor()` for the first unresolved item and still does not enable execution while the queue remains unresolved. Discussion and refinement prompts are explicit follow-up deliveries.



After the discussion queue is clear, Plan Mode opens the saved-plan review UI for execute/stay/refine/cancel. Execution starts only after execute is chosen. Structured execution requests resolve the target plan and use the same queue-first flow; ambiguous requests ask which active plan to execute only after structured execution intent is confirmed. Planning/design/refinement prose and non-plan commands such as `run tests` do not open the chooser by keyword inference. Consumed pending review state is cleared so the UI does not reopen at agent end.


## Progress, Resume, and Checklists

When a durable plan exists, Plan Mode treats the task README as the required resume surface. For bounded small tasks that do not create a saved plan, the chat checklist should be short enough to complete without relying on cross-session resume.

For durable plans, the README should carry enough status, decisions, verification notes, and remaining steps for another agent to continue after compaction or a new session.

Long-running tasks may add optional support files in the same task directory:

- `PROGRESS.md` for chronological checkpoints, completed work, blockers, and current handoff state.
- `DECISIONS.md` for local decisions, rejected alternatives, constraints, and follow-up questions that should survive compaction.
- `VERIFY.md` for task-specific command results, manual checks, fixtures, or release-readiness checklists.

Support files should be short, indexed from the task README, and used only when they make the task easier to resume. They do not replace the executable `Plan:` section or internal todo tracking.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic template labels are ignored so they do not become execution todos.

When the user chooses refine from saved-plan review, Plan Mode wraps the user's feedback with the active plan path and current extracted execution-step context before sending the follow-up; it does not send raw feedback alone.

When execution starts:

- Full tool access is restored.
- Execution state is persisted only after the plan-review UI returns an execute choice; preview rendering never triggers execution by itself.
- The execute follow-up names the active plan path when known.
- Extension-generated execute, refine, and discussion follow-ups use explicit follow-up delivery; project-memory load runs through the pending tool requirement, and compaction continues the active run without a resume follow-up.
- Remaining steps are loaded from the selected README when needed.
- If optional `PROGRESS.md`, `DECISIONS.md`, or `VERIFY.md` files exist, the agent uses them as resume context before continuing work.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- After modification or coding work, execution guidance requires `dotdotgod validate` before final completion.

When all tracked steps are complete, plan execution state is cleared without an additional preview/message. Plan completion does not auto-index by default; cache-refresh hooks are opt-in and run only after all steps have `[DONE:n]` markers.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts](../../../packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts)
  - [packages/pi/extensions/plan-mode/controllers/plan-artifact.ts](../../../packages/pi/extensions/plan-mode/controllers/plan-artifact.ts)
  - [packages/pi/extensions/plan-mode/controllers/context-shaping.ts](../../../packages/pi/extensions/plan-mode/controllers/context-shaping.ts)
  - [packages/pi/extensions/plan-mode/controllers/context-orchestration.ts](../../../packages/pi/extensions/plan-mode/controllers/context-orchestration.ts)
  - [packages/pi/extensions/plan-mode/controllers/gates.ts](../../../packages/pi/extensions/plan-mode/controllers/gates.ts)
  - [packages/pi/extensions/plan-mode/controllers/review-gates.ts](../../../packages/pi/extensions/plan-mode/controllers/review-gates.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-flow.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-flow.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-progress.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-progress.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../../packages/pi/extensions/plan-mode/prompts.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../../packages/pi/extensions/plan-mode/utils.ts)
  - [packages/shared/workflows/plan.md](../../../packages/shared/workflows/plan.md)
- Verified by:
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [docs/test/README.md](../../test/README.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
- Related docs:
  - [docs/spec/plan-mode/README.md](README.md)
  - [docs/spec/PLAN_MODE_TOOL_SETTINGS.md](../PLAN_MODE_TOOL_SETTINGS.md)
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CODE_CONVENTIONS.md](../../arch/CODE_CONVENTIONS.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/pi test`
  - `pnpm --filter @dotdotgod/pi run typecheck`
  - `node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml`
- Contracts:
  - `PLAN-MODE-CONTEXT-001` — Planning context shaping queues memory load, compaction, and advisory impact checks (sections: 1, impl: 3, verify: 1, docs: 2)
  - `PLAN-MODE-COMPACTION-001` — Planning-focused compaction preserves active planning state and resumes safely (sections: 1, impl: 3, verify: 1, docs: 1)
  - `PLAN-MODE-REVIEW-001` — Plan review prioritizes discussion queue decisions before execution choices (sections: 1, impl: 3, verify: 1, docs: 1)
  - `PLAN-MODE-RESUME-001` — Durable plans provide resume context, optional support files, and checklist state (sections: 1, impl: 3, verify: 1, docs: 1)
  - `PLAN-MODE-EXECUTION-001` — Execution starts only after review, restores tool access, and tracks todo completion (sections: 1, impl: 3, verify: 1, docs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/controllers/gates.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts","packages/shared/workflows/plan.md"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"verificationCommands":["pnpm --filter @dotdotgod/pi test","pnpm --filter @dotdotgod/pi run typecheck","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"],"contracts":[{"id":"PLAN-MODE-CONTEXT-001","title":"Planning context shaping queues memory load, compaction, and advisory impact checks","sections":["Planning Context Shaping"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/IMPACT_RANKING_CONFIG.md"]},{"id":"PLAN-MODE-COMPACTION-001","title":"Planning-focused compaction preserves active planning state and resumes safely","sections":["Planning-Focused Compaction"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/arch/EXTENSION_ARCHITECTURE.md"]},{"id":"PLAN-MODE-REVIEW-001","title":"Plan review prioritizes discussion queue decisions before execution choices","sections":["Plan Review Choice"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/gates.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/PLAN_MODE_TOOL_SETTINGS.md"]},{"id":"PLAN-MODE-RESUME-001","title":"Durable plans provide resume context, optional support files, and checklist state","sections":["Progress, Resume, and Checklists"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/utils.ts","packages/shared/workflows/plan.md"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/arch/DOCS_STRUCTURE.md"]},{"id":"PLAN-MODE-EXECUTION-001","title":"Execution starts only after review, restores tool access, and tracks todo completion","sections":["Todo Extraction and Execution"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/index.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md"]}]}
```
