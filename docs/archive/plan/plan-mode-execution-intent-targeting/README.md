# Plan Mode Execution Intent Targeting

Status: active

## Scope

Fix Plan Mode so the `Which active plan should be executed?` selector appears only when the user clearly asks to execute a plan and the target plan is ambiguous.

Current issue reported by the user:

- With no selected/current plan, asking for planning or non-execution work can still trigger the active-plan execution selector.
- If no active plan is selected, Plan Mode appears to treat all active plans as execution candidates.

The intended behavior is stricter:

- Advisory/planning requests should stay in Plan Mode and should not ask which active plan to execute.
- Implementation-sounding requests should produce or refine a plan first, not execute an arbitrary active plan.
- Execution selection should happen only after explicit execution intent such as `execute`, `run`, `실행하자`, `진행하자` when phrased as executing a plan.
- If explicit execution intent has no selected/current/touched/mentioned plan and multiple active plans exist, ask which one to execute.
- If explicit execution intent has no selected/current/touched/mentioned plan and no single unambiguous active plan exists, warn or ask for a specific plan rather than silently considering all plans executable.

## Likely Root Cause

Relevant code paths:

- `packages/pi/extensions/plan-mode/context.ts`
  - `detectPlanExecutionIntent()` classifies the latest request.
  - `classifyPlanModeRequest()` turns that into `explicit_execution` framing.
- `packages/pi/extensions/plan-mode/plans.ts`
  - `resolvePlanExecutionTarget()` falls back from explicit mentions/current/touched context to all `activePlanPaths`.
- `packages/pi/extensions/plan-mode/index.ts`
  - `startExplicitPlanExecutionIfRequested()` calls `chooseExplicitPlanPath()` when resolution is ambiguous, which shows `Which active plan should be executed?`.

The fallback to all active plans is useful only after explicit execution intent. The bug is likely either an overly broad execution-intent regex or fallback resolution running for requests that should be advisory/implementation planning.

## Target Files

- `packages/pi/extensions/plan-mode/context.ts` — tighten explicit execution intent detection, especially Korean `진행하자` and implementation/planning phrases.
- `packages/pi/extensions/plan-mode/plans.ts` — make fallback-to-active-plan behavior explicit and testable; consider adding an option to disable fallback unless execution intent is confirmed.
- `packages/pi/extensions/plan-mode/index.ts` — ensure `chooseExplicitPlanPath()` is called only for confirmed execution requests and ambiguous candidates.
- `packages/pi/test/plan-mode-utils.test.ts` — add regression cases for planning/advisory/implementation requests not triggering execution, and explicit ambiguous execution still prompting.
- `docs/spec/plan-mode/WORKFLOW.md` — document selector timing if behavior contract changes.
- `packages/pi/extensions/plan-mode/README.md` and `docs/test/manual-smoke/PI_ADAPTER.md` — update operator-facing/manual smoke guidance if needed.

## Impact-Informed Related Files

Initial source inspection points to `context.ts`, `plans.ts`, `index.ts`, and `plan-mode-utils.test.ts`. Before source edits, run graph impact for those files and review any newly surfaced spec/test/docs targets.

The existing tests already cover:

- explicit execution detection for English/Korean plan execution phrases.
- non-execution detection for planning/refinement phrases, including bare `진행하자`.
- ambiguous active-plan resolution for explicit proceed requests.

Add cases for the reported behavior: no current plan plus planning/non-execution request must not result in active-plan selection.

## Verification

Automated:

- `pnpm --filter @dotdotgod/pi run verify`
- `pnpm --filter @dotdotgod/pi run pack:dry-run` if package metadata/docs are affected.
- `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index` after docs updates.

Manual smoke:

- In Plan Mode with multiple active plans and no current selected plan, ask a planning/advisory request; confirm no `Which active plan should be executed?` prompt appears.
- In Plan Mode with multiple active plans and no current selected plan, ask explicit execution such as `진행하자` only if it is intended to execute; confirm ambiguity prompt appears only then, or ask for a named plan if bare phrasing is considered insufficient.
- In Plan Mode with a current selected plan, ask `진행하자`; confirm it resolves to the selected plan and then shows saved-plan review before execution.
- Ask `계획하자`, `계획을 세우자`, `설계부터 진행하자`, and implementation-like requests; confirm Plan Mode remains planning-only.

## Risks

- Tightening Korean execution detection too much may make `진행하자` less convenient after a plan has just been selected. Preserve current-plan execution for explicit short commands when `currentPlanPath` or `pendingPlanChoicePath` exists.
- Disabling fallback to all active plans may require users to mention a plan slug more often. The selector should still be available for truly explicit but ambiguous execution requests.
- Current prompt framing may still say execution if the latest request is wrapped by compaction/runtime text; tests should cover direct helper behavior and runtime framing separately where possible.

## Plan:

1. Run dotdotgod graph impact for `packages/pi/extensions/plan-mode/context.ts`, `packages/pi/extensions/plan-mode/plans.ts`, `packages/pi/extensions/plan-mode/index.ts`, `packages/pi/test/plan-mode-utils.test.ts`, `docs/spec/plan-mode/WORKFLOW.md`, `packages/pi/extensions/plan-mode/README.md`, and `docs/test/manual-smoke/PI_ADAPTER.md`; review newly surfaced related docs/tests before source edits.
2. Add regression tests showing non-execution planning/advisory requests with multiple active plans do not classify as `explicit_execution` and do not resolve to an execution target.
3. Tighten execution-target resolution so active-plan fallback is used only after confirmed explicit execution intent and preferably only when the request is a bare execution command or execution phrasing, not planning/implementation text.
4. Keep `Which active plan should be executed?` only for `resolution.status === "ambiguous"` after explicit execution intent; otherwise notify the user to mention/select a plan without opening the selector.
5. Update Plan Mode docs/manual smoke if the selector contract changes.
6. Run focused Pi tests, full `@dotdotgod/pi` verify, post-edit graph impact, and dotdotgod validate.
7. If verified, bump/publish only if this behavior fix needs immediate package release; otherwise commit the focused fix and archive this plan.
