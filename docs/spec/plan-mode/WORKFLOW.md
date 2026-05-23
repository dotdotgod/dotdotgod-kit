# Plan Mode Workflow

## Planning Context Shaping

After Plan Mode is enabled, the first user planning request triggers one context-shaping pass. The request may be sent as a separate message after `/plan`, or inline as `/plan <request>`; inline requests are recorded as the latest planning request before delivery, enable Plan Mode, and then use the same context shaping and request-framing path.

1. Queue a curated project-memory load if baseline project docs are missing, recent memory load is absent, or context has narrowed to one documentation area while the request needs cross-area planning.
2. Request planning-focused compaction if context is too large or noisy.
3. If both are needed, compact first, flush the queued load, then resume the latest planning request as a real follow-up.

The curated load uses the `/dd:load compact` surface: baseline files, docs indexes, specs, architecture, tests, and active plans. Explicit manual `/dd:load` remains full by default, but Plan Mode's automatic prompt-injected refreshes request compact mode to avoid repeated stable background summaries. Compact curated loads exclude full repository scans and archive bodies unless targeted. When the CLI is available, Plan Mode validates, refreshes a bounded load snapshot, and runs advisory `graph impact --json` checks for likely target files.

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

After successful automatic compaction, the extension queues a concise resume follow-up for the latest planning request. Inline `/plan <request>` arguments are authoritative for this resume prompt even if their synthetic user message has not reached the session transcript yet. When a curated project-memory load was deferred until after compaction, the load follow-up is delivered first and the resume follow-up is delivered after that load turn finishes. The resume prompt is persisted and cleared after one delivery so compaction does not make the user repeat the request or create duplicate planning turns.

The extension skips compaction during execution and continues if compaction fails. Toggle Plan Mode off/on for a fresh context-shaping pass.

## Plan Review Choice

Plan Mode uses tiered hidden runtime instructions. The first active planning turn receives the full safety/workflow prompt; subsequent turns receive a compact reminder. The full prompt tells agents to explore files in bounded passes: start from loaded memory, README indexes, and impact/load-snapshot results; inspect top related specs/tests/source files first; and expand only with a concrete reason. Planning turns frame advisory requests lightly, convert implementation-looking requests into durable plans first, use curated load flow for memory-load requests, and use the execution path for explicit execution requests. If `/plan <request>` is invoked while Plan Mode is already active, the request is sent as another planning request and Plan Mode remains enabled.

When the agent creates or updates an active plan markdown file under `docs/plan/`, interactive Plan Mode opens a full-page custom saved-plan review UI before accepting the execute/stay/refine/cancel choice. The review UI should use the available terminal surface rather than a small fixed preview box, support keyboard scrolling, and keep the choice synchronous with the review flow. Execution starts only after the user chooses execute from that review UI. If the saved plan cannot be read, Plan Mode shows a fallback preview of extracted execution steps in the same review flow. If the user explicitly asks to execute an active plan, Plan Mode resolves the target plan and opens the same review UI even if the file was not modified in the current turn. If the execution request is ambiguous and no current or mentioned active plan can be resolved, Plan Mode asks the user which active plan to execute instead of silently continuing generic planning.

Plan files remain the durable review artifact and the session-rendered preview is a convenience copy of that artifact, not a replacement for the file. Plan Mode stores the current active plan README path so execution prompts, resume, and compaction summaries can refer to it after context changes. Plans should summarize impact findings rather than embedding large raw impact payloads unless the user explicitly asks for the raw output.

## Progress, Resume, and Checklists

When a durable plan exists, Plan Mode treats the task README as the required resume surface. For bounded small tasks that do not create a saved plan, the chat checklist should be short enough to complete without relying on cross-session resume.

For durable plans, the README should carry enough status, decisions, verification notes, and remaining steps for another agent to continue after compaction or a new session.

Long-running tasks may add optional support files in the same task directory:

- `PROGRESS.md` for chronological checkpoints, completed work, blockers, and current handoff state.
- `DECISIONS.md` for local decisions, rejected alternatives, constraints, and follow-up questions that should survive compaction.
- `VERIFY.md` for task-specific command results, manual checks, fixtures, or release-readiness checklists.

Support files should be short, indexed from the task README, and used only when they make the task easier to resume. They do not replace the executable `Plan:` section or `/todos` tracking.

## Todo Extraction and Execution

Plan mode extracts numbered executable steps from a `Plan:` section. Generic template labels are ignored so they do not become execution todos.

When execution starts:

- Full tool access is restored.
- Execution state is persisted only after the plan-review UI returns an execute choice; preview rendering never triggers execution by itself.
- The execute follow-up names the active plan path when known.
- Remaining steps are loaded from the selected README when needed.
- If optional `PROGRESS.md`, `DECISIONS.md`, or `VERIFY.md` files exist, the agent uses them as resume context before continuing work.
- The agent marks completed steps by including `[DONE:n]` in the same response that reports completion.
- After modification or coding work, execution guidance requires `dotdotgod validate` before final completion.
- `/todos` displays completion progress.

When all tracked steps are complete, plan execution state is cleared without an additional preview/message. Plan completion does not auto-index by default; cache-refresh hooks are opt-in and run only after all steps have `[DONE:n]` markers.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
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

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts","packages/shared/workflows/plan.md"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"verificationCommands":["pnpm --filter @dotdotgod/pi test","pnpm --filter @dotdotgod/pi run typecheck","node packages/cli/bin/dotdotgod.mjs graph impact . --changed packages/pi/extensions/plan-mode/index.ts --yml"]}
```
