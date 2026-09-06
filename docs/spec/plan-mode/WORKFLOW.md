# Plan Mode Workflow

## Planning Context Shaping

After Plan Mode is enabled, the first user planning request triggers one planning-specific context-shaping pass. Inline `/dd:plan <request>` arguments use the same path, and synthetic planning requests use explicit follow-up delivery. Plan Mode requests planning-focused compaction when context is too large or noisy, refreshes its CLI planning summary, and otherwise does not own automatic project-memory decisions or execution.

The mode-neutral global project-memory extension independently assesses baseline coverage from the `input` event. When loading is needed, it leaves the original input and images unchanged, injects a hidden persistent custom instruction before agent start, and makes the read-only `dotdotgod_project_load` tool available for the same agent run. The global extension owns hidden-instruction delivery state, branch restoration, exactly-once completion, and continuation in ordinary and Plan Mode sessions. Generic active-tool composition preserves its pending tool regardless of extension callback order. Plan Mode does not classify load requests, inspect hidden load prose, or queue automatic loads. The agent generates a concise semantic `focus` from the current task's behavior, architecture, likely source areas, and verification needs. A non-empty focus uses query results and the depth-three documentation map; an intentionally empty focus uses the depth-five map without a query.

Planning reuses loaded memory and the map. A focused query routes selective doc and source reads. Impact review starts after likely changed files are known and refines plan targets, risks, and verification.

## Plan Sizing

Plan Mode should create a durable `docs/plan/<task-slug>/README.md` when the work is large, risky, multi-file, behavior-changing, architecture-changing, CLI/API-affecting, source/config-heavy, or likely to be paused and resumed by another agent.

Small work does not need a durable plan file before execution when the requested change is obvious and bounded, such as a typo fix, a single-file documentation clarification, a targeted test or validation run, or a one-file bug fix with an unambiguous implementation path. For those tasks, an in-chat checklist is enough unless the user explicitly asks for a saved plan.

If a small task grows into broader source/config or behavior work, the agent should stop, create or update a durable plan, and ask whether to execute, stay in plan mode, or refine.

## Planning-Focused Compaction

Plan Mode requests compaction only when context is likely to hurt plan quality. It checks once after the first planning request. Subsequent turns record metrics but do not rerun the Plan Mode compaction decision. Automatic-load assessment is separately one-shot and mode-neutral.

The extension passes planning-specific `customInstructions` to `ctx.compact()`. Compaction should preserve the latest request, decisions, active plan status, targets, relevant spec/test/arch context, validation/index/impact summaries, implementation decisions, verification outcomes, risks, next steps, and completed `[DONE:n]` markers.

Compaction demotes old completed plans unless relevant, repeated load summaries, unrelated publish history, recoverable Plan Mode boilerplate, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

Moderately proactive thresholds are:

- context usage at or above 60% when percentage is available
- context tokens within 32,000 tokens of the context window when window size is available
- 100,000 context tokens as a fallback when only token count is available

After successful automatic compaction, the already-active planning run continues from the compacted context. Plan Mode does not create a synthetic user-role compaction-resume message or duplicate the latest request. Global project-memory instruction delivery is independently owned; because it does not rewrite the user input, Plan Mode's latest request, compaction focus, and advisory impact selection remain task-directed without load-specific parsing. Inline `/dd:plan <request>` arguments remain authoritative before their synthetic command-delivery message reaches the transcript. Legacy persisted compaction resume prompts are recognized as Plan Mode runtime messages but are not replayed.

The extension skips compaction during execution and continues if compaction fails. Toggle Plan Mode off/on for a fresh context-shaping pass.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions: full prompt on the first active planning turn, compact reminder later. Free-form prose is advisory/planning context for the LLM, not keyword-classified implementation intent. Explicit load commands or missing baseline context trigger load flow. Structured execution handoff text such as `Execute the plan in docs/plan/<task-slug>/README.md` triggers execution flow. `/dd:plan <request>` sends a planning follow-up and suppresses the execution chooser for that turn. `/dd:plan <path>` loads an active-plan README or task directory and restores internal todo state from its `Plan:` section.

When an active plan is written or execution is explicitly requested, Plan Mode checks its `Discussion Queue` before execute/stay/refine/cancel review. Unresolved decisions open the [Plan Decision Wizard](DECISION_WIZARD.md): sequential choices or custom answers, Back/Next drafts, and an editable batch summary. Confirm answers sends one follow-up to update durable markdown, not execution authorization. Required deferrals remain blocking; historical answered and accepted-risk records remain compatible.

The wizard's [contract](DECISION_WIZARD.md) defines markdown fields, status compatibility, native editor behavior, cancellation, equivalent sequential fallback, and stale-result checks. Without interactive UI, Plan Mode surfaces pending decisions and remains in planning. Discussion and refinement prompts use explicit follow-up delivery.

After the agent updates the plan, review re-reads the durable queue: new or still-unresolved questions reopen the wizard. After the discussion queue is clear, Plan Mode opens the saved-plan review UI for execute/stay/refine/cancel. Execution starts only after execute is chosen. Structured execution requests use the same queue-first flow; ambiguous requests ask which active plan to execute only after structured execution intent is confirmed. Planning/design/refinement prose and non-plan commands such as `run tests` do not open the chooser by keyword inference. Consumed pending review state is cleared so the UI does not reopen at agent end.

Terminals size/pad the preview so action controls stay visible near the review bottom.

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

One persisted lifecycle controls permissions, owned tools, prompts, and status. A review generation rejects stale asynchronous results. UI failures and interrupted review recover to planning; invalid legacy state normalizes to `off`.

When execution starts:

- Full tool access is restored.
- Execution state is persisted only after the plan-review UI returns an execute choice; preview rendering never triggers execution by itself.
- The execute follow-up names the active plan path when known.
- Extension-generated execute, refine, and discussion follow-ups use explicit follow-up delivery; global project-memory prompt scheduling and loading remain independent, and compaction continues the active run without a Plan Mode resume follow-up.
- Remaining steps are loaded from the selected README when needed.
- Execute enters `executing` without extracted steps; untracked execution completes after that turn.
- If optional `PROGRESS.md`, `DECISIONS.md`, or `VERIFY.md` files exist, the agent uses them as resume context before continuing work.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- After modification or coding work, execution guidance requires `dotdotgod validate` before final completion.

When all tracked steps are complete, plan execution state is cleared without an additional preview/message. Plan completion does not auto-index by default; cache-refresh hooks are opt-in and run only after all steps have `[DONE:n]` markers.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/components/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/components/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/controllers/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/controllers/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts](../../../packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts)
  - [packages/pi/extensions/plan-mode/controllers/plan-artifact.ts](../../../packages/pi/extensions/plan-mode/controllers/plan-artifact.ts)
  - [packages/pi/extensions/plan-mode/controllers/context-shaping.ts](../../../packages/pi/extensions/plan-mode/controllers/context-shaping.ts)
  - [packages/pi/extensions/plan-mode/controllers/context-orchestration.ts](../../../packages/pi/extensions/plan-mode/controllers/context-orchestration.ts)
  - [packages/pi/extensions/plan-mode/controllers/gates.ts](../../../packages/pi/extensions/plan-mode/controllers/gates.ts)
  - [packages/pi/extensions/plan-mode/controllers/review-gates.ts](../../../packages/pi/extensions/plan-mode/controllers/review-gates.ts)
  - [packages/pi/extensions/plan-mode/components/plan-mode-components.ts](../../../packages/pi/extensions/plan-mode/components/plan-mode-components.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-flow.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-flow.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-progress.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-progress.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../../packages/pi/extensions/plan-mode/prompts.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../../packages/pi/extensions/plan-mode/utils.ts)
  - [packages/shared/workflows/plan.md](../../../packages/shared/workflows/plan.md)
- Verified by:
  - [packages/pi/test/decision-wizard.test.ts](../../../packages/pi/test/decision-wizard.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [docs/test/README.md](../../test/README.md)
  - [docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md](../../test/manual-smoke/CROSS_AGENT_ADAPTERS.md)
- Related docs:
  - [docs/spec/plan-mode/README.md](README.md)
  - [docs/spec/PLAN_MODE_TOOL_SETTINGS.md](../PLAN_MODE_TOOL_SETTINGS.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CODE_CONVENTIONS.md](../../arch/CODE_CONVENTIONS.md)
- Contracts:
  - `PLAN-MODE-CONTEXT-001` — Planning context shaping manages compaction and advisory impact context (sections: 1, implementedBy: 3, verifiedBy: 1, relatedDocs: 2)
  - `PLAN-MODE-COMPACTION-001` — Planning-focused compaction preserves active planning state and resumes safely (sections: 1, implementedBy: 3, verifiedBy: 1, designDecisions: 1)
  - `PLAN-MODE-REVIEW-001` — Plan review confirms decision batches before separate execution approval (sections: 1, implementedBy: 6, verifiedBy: 3, relatedDocs: 1)
  - `PLAN-MODE-RESUME-001` — Durable plans provide resume context, optional support files, and checklist state (sections: 1, implementedBy: 3, verifiedBy: 1, designDecisions: 1)
  - `PLAN-MODE-EXECUTION-001` — Execution starts only after review, restores tool access, and tracks todo completion (sections: 1, implementedBy: 3, verifiedBy: 1, relatedDocs: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/controllers/gates.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/components/plan-mode-components.ts","packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts","packages/shared/workflows/plan.md"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"contracts":[{"id":"PLAN-MODE-CONTEXT-001","title":"Planning context shaping manages compaction and advisory impact context","sections":["Planning Context Shaping"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/IMPACT_RANKING_CONFIG.md"]},{"id":"PLAN-MODE-COMPACTION-001","title":"Planning-focused compaction preserves active planning state and resumes safely","sections":["Planning-Focused Compaction"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":[],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]},{"id":"PLAN-MODE-REVIEW-001","title":"Plan review confirms decision batches before separate execution approval","sections":["Plan Review Choice"],"implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/plan-mode-extension.test.ts"],"relatedDocs":["docs/spec/PLAN_MODE_TOOL_SETTINGS.md"]},{"id":"PLAN-MODE-RESUME-001","title":"Durable plans provide resume context, optional support files, and checklist state","sections":["Progress, Resume, and Checklists"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/utils.ts","packages/shared/workflows/plan.md"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":[],"designDecisions":["docs/arch/DOCS_STRUCTURE.md"]},{"id":"PLAN-MODE-EXECUTION-001","title":"Execution starts only after review, restores tool access, and tracks todo completion","sections":["Todo Extraction and Execution"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/index.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md"]}],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md"]}
```
