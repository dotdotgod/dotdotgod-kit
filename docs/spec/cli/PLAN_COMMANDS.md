# CLI Plan Commands

## Purpose

The `dotdotgod plan` command group validates durable plan artifacts and creates internal Plan Generator checkpoint files for the simplified staged planning workflow.

## Plan Validate

- `dotdotgod plan validate docs/plan/<task-slug>/README.md [--stage stage] [--json]` MUST validate an active plan artifact without refreshing caches.
- The durable plan path MUST be `docs/plan/<kebab-case-task-slug>/README.md`.
- Plan Generator validation uses the simplified stages `01-intake`, `02-context-load`, `03-discovery`, `04-plan`, and optional final `05-workstream-handoff`.
- Validation MUST NOT require removed standalone decision queue, approval, execution-slices, or verify/replan/close stages.
- New workspace plans MAY use internal files under `.dotdotgod-plan/NN_STAGE_NAME.md` such as `03_DISCOVERY.md`.
- Required headers MUST exist in the selected internal checkpoint and contain non-empty content.
- Code validation MUST NOT infer blocker state or evidence quality from ordinary prose keywords. It MAY validate structured fields, enum values, checkboxes, headings, and non-empty content.
- Unresolved assumptions and discussion items MUST be blockers only when represented by unchecked checklist items or explicit structured fields such as `Status: unresolved` or `DecisionState: unresolved`.
- Atomic tasks without explicit `Acceptance:`/`Acceptance criteria:` and `Verification:` fields MUST be blockers.
- `--stage` MUST accept a canonical stage name or unambiguous numeric prefix such as `04` or `05`.
- Stage-scoped validation MUST validate only the selected stage and MUST NOT require later stages.
- Clean stage-scoped success MAY include optional `nextStage` guidance for the following stage.
- General docs validation MUST tolerate `.dotdotgod-plan/NN_STAGE_NAME.md` internal uppercase numeric filenames.
- Stage 05 split handoff validation MUST use structural fields such as `Workstream ID:`, `Purpose:`, `Required context:`, `Allowed edits:`, `Forbidden edits:`, `Tasks:`, `Validation:`, `Handoff output:`, `Dependencies:`, `Step:`, and `Handoff:` instead of keyword-based actionability checks.
- Human output MUST list blockers, include an agent repair prompt, and exit non-zero on failure.
- JSON output MUST include `ok`, `planPath`, `blockers`, `warnings`, `summary`, and failure output MUST include repair prompts.

## Plan Stage Create

- `dotdotgod plan stage create <stage> [docs/plan/<task-slug>/README.md] [--json]` MUST create the matching internal `.dotdotgod-plan/NN_STAGE_NAME.md` checkpoint for a simplified Plan Generator stage.
- `<stage>` MUST accept a canonical stage name or unambiguous numeric prefix such as `02`.
- Old 9-stage values MUST fail.
- When the plan path is omitted, the command MUST infer it only when exactly one active `docs/plan/<task-slug>/README.md` candidate exists.
- The command MUST create the workspace directory as needed.
- The command MUST NOT overwrite an existing checkpoint.
- The command MUST initialize the file with `Stage:`, `Status: created`, and `Updated:` metadata.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
  - [packages/cli/src/commands/plan.mjs](../../../packages/cli/src/commands/plan.mjs)
  - [packages/cli/src/commands/plan-stage-contract.mjs](../../../packages/cli/src/commands/plan-stage-contract.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../../test/CLI_INTERFACE.md)
- Related docs:
  - [docs/spec/cli/README.md](README.md)
  - [docs/test/README.md](../../test/README.md)
  - [packages/cli/README.md](../../../packages/cli/README.md)
  - [docs/spec/plan-mode/WORKFLOW.md](../plan-mode/WORKFLOW.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs plan validate --help`
  - `node packages/cli/bin/dotdotgod.mjs plan stage create --help`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/commands/plan.mjs","packages/cli/src/commands/plan-stage-contract.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md"],"relatedDocs":["docs/spec/cli/README.md","docs/test/README.md","packages/cli/README.md","docs/spec/plan-mode/WORKFLOW.md"],"verificationCommands":["pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs plan validate --help","node packages/cli/bin/dotdotgod.mjs plan stage create --help"]}
```
