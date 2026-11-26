# Plan Mode Workflow

## Planning Context Shaping

The first planning request refreshes bounded advisory impact and references without auto-validation. Reuse loaded memory and use focused queries for selective reads; review impact once likely targets are known. Pi owns compaction. Independent project-memory scheduling keeps the pending `project_memory_load` tool available. Non-empty focus routes query + depth-three map; empty focus uses the depth-five map.

## Plan Sizing

Save risky, multi-file, behavior-changing, source/config-heavy, or resumable work. Promote even a small task if it needs mandatory commands: use `<docRoot>/plan/<task-slug>/README.md` with `## Verification` and `## Re-plan If`. Simple checklists without required commands can stay in chat.

## Plan Review Choice

The first planning turn uses full instructions; later turns use a compact reminder. Inline requests suppress the chooser for that turn. Structured execution intent uses queue-first review; advisory prose or “run tests” alone does not. Ask which plan to review if explicit execution intent is ambiguous.

Unresolved questions open the [Decision Wizard](DECISION_WIZARD.md). Confirming answers updates the durable queue but never approves execution; unresolved or new questions reopen it. A cleared queue allows Execute/Stay/Refine/Cancel. The TUI shows the saved preview and a fixed action bar; RPC uses a direct select. Selecting an existing plan only makes it a candidate when prior approved evidence exists. [Snapshot and drift rules](EXECUTION_VERIFICATION.md#review-and-approval) apply.

## Progress, Resume, and Checklists

The durable README carries scope, decisions, verification, and remaining steps for resume. Optional indexed `PROGRESS.md`, `DECISIONS.md`, and `VERIFY.md` support it, not replace `Plan:`. Keep file-free checklists short.

## Todo Extraction and Execution

Numbered `Plan:` steps end at the next heading; template labels are ignored. Refine queues plan path, extracted steps, and feedback. Generated discussion, refine, and execute messages use explicit follow-up delivery.

Execute persists approval before restoring tools. `[DONE:n]` reports progress, not proof. Even a zero-todo plan uses [verified settlement](EXECUTION_VERIFICATION.md#settlement-and-re-planning); `dotdotgod validate` checks docs, not code or feature behavior. Clean completion is quiet; it does not auto-index.

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
  - [packages/cli/src/context/impact-state.mjs](../../../packages/cli/src/context/impact-state.mjs)
  - [packages/pi/extensions/plan-mode/controllers/review-gates.ts](../../../packages/pi/extensions/plan-mode/controllers/review-gates.ts)
  - [packages/pi/extensions/plan-mode/components/plan-mode-components.ts](../../../packages/pi/extensions/plan-mode/components/plan-mode-components.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-flow.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-flow.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-progress.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-progress.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../../packages/pi/extensions/plan-mode/prompts.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../../packages/pi/extensions/plan-mode/utils.ts)
  - [packages/cli/assets/workflows/plan.md](../../../packages/cli/assets/workflows/plan.md)
- Verified by:
  - [packages/pi/test/decision-wizard.test.ts](../../../packages/pi/test/decision-wizard.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/planning-context.test.ts](../../../packages/pi/test/planning-context.test.ts)
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
  - `PLAN-MODE-CONTEXT-001` — Planning context shaping manages advisory impact and reference context (sections: 1, implementedBy: 3, verifiedBy: 2, relatedDocs: 2)
  - `PLAN-MODE-REVIEW-001` — Plan review confirms decision batches before separate execution approval (sections: 1, implementedBy: 6, verifiedBy: 3, relatedDocs: 1)
  - `PLAN-MODE-RESUME-001` — Durable plans provide resume context, optional support files, and checklist state (sections: 1, implementedBy: 3, verifiedBy: 1, designDecisions: 1)
  - `PLAN-MODE-EXECUTION-001` — Execution starts only after review and settles after verification (sections: 1, implementedBy: 3, verifiedBy: 1, relatedDocs: 2)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/controllers/mode-lifecycle.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/cli/src/context/impact-state.mjs","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/components/plan-mode-components.ts","packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/prompts.ts","packages/pi/extensions/plan-mode/utils.ts","packages/cli/assets/workflows/plan.md"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/planning-context.test.ts","docs/test/README.md","docs/test/manual-smoke/CROSS_AGENT_ADAPTERS.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"contracts":[{"id":"PLAN-MODE-CONTEXT-001","title":"Planning context shaping manages advisory impact and reference context","sections":["Planning Context Shaping"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/context-shaping.ts","packages/pi/extensions/plan-mode/controllers/context-orchestration.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/planning-context.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/IMPACT_RANKING_CONFIG.md"]},{"id":"PLAN-MODE-REVIEW-001","title":"Plan review confirms decision batches before separate execution approval","sections":["Plan Review Choice"],"implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/controllers/plan-artifact.ts"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/plan-mode-extension.test.ts"],"relatedDocs":["docs/spec/PLAN_MODE_TOOL_SETTINGS.md"]},{"id":"PLAN-MODE-RESUME-001","title":"Durable plans provide resume context, optional support files, and checklist state","sections":["Progress, Resume, and Checklists"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/plan-artifact.ts","packages/pi/extensions/plan-mode/utils.ts","packages/cli/assets/workflows/plan.md"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":[],"designDecisions":["docs/arch/DOCS_STRUCTURE.md"]},{"id":"PLAN-MODE-EXECUTION-001","title":"Execution starts only after review and settles after verification","sections":["Todo Extraction and Execution"],"implementedBy":["packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/controllers/execution-progress.ts","packages/pi/extensions/plan-mode/index.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/plan-mode/EXECUTION_VERIFICATION.md"]}],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md"]}
```
