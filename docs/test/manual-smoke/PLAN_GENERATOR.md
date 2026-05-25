# Plan Generator Smoke Tests

1. Run `/plan-generator --help` and confirm usage is shown without creating `docs/plan/` files.
2. Run `/plan-generator` with no args and confirm the first-request editor opens; without custom UI support, confirm one follow-up asks what durable plan to create.
3. Run `/plan-generator add staged authoring smoke` and confirm it creates a semantic slug such as `docs/plan/add-staged-authoring-smoke/README.md` plus `.dotdotgod-plan/01_INTAKE.md` only; for empty or unusable text, confirm `new-plan` remains the fallback with collision suffixes.
4. Resume with both `/plan-generator docs/plan/<task>` and `/plan-generator docs/plan/<task>/README.md` and confirm state reloads from checkpoint files.
5. Confirm CLI validation failures mark the stage blocked, update validation blockers/counters in `.dotdotgod-plan`, and ask for normal plan markdown repairs.
6. Confirm CLI-passing stages queue an LLM review prompt using normal plan markdown only, excluding `.dotdotgod-plan/**`.
7. Paste malformed or missing `json dotdotgod-plan-stage` review output into the stage state and resume; confirm it records a malformed-review blocker and requests corrected review JSON.
8. Confirm LLM review questions are listed in `Next Questions` and only the first unresolved question is asked.
9. Confirm `ok:true` review completion advances to the next stage, creates only that next checkpoint, and resumes from the first non-completed stage.
10. While `.dotdotgod-plan/09_SUBAGENT_WORKSTREAMS.md` is missing or not `Status: completed`, edit the durable README in Plan Mode and confirm the saved-plan execution chooser is suppressed.
11. Complete Stage 09 and confirm Pi reports the durable plan path as ready for execution review without starting source/config execution.
12. Re-run the Plan Mode boundary checks: `/plan <request>` must not auto-run `/plan-generator`, and Plan Mode must not write `.dotdotgod-plan` checkpoints.
