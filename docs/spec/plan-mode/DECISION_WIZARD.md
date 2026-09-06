# Plan Decision Wizard

## Questions and Drafts

The active plan README remains the source of truth. Its `Discussion Queue` uses rows such as `- [ ] Q1 scope blocks-execute-review: <question>` with indented `Why`, `Affects`, `Options` (nested labeled choices), `Recommended`, `Verification impact`, and `Status` fields. Recommendations name option labels structurally, not through option prose. IDs must be unique; duplicates stop review until corrected.

Checked items and answered or accepted-risk records remain compatible as resolved decisions. Deferred items carrying `blocks-execute-review` remain unresolved even when checked; unflagged legacy deferrals remain resolved. Unresolved items appear in file order.

The wizard replaces the old Discussion Queue Console. It shows one question at a time with rationale, options, and Other / custom answer. Choosing an option or submitting non-empty custom text saves a local draft and immediately advances to the next question, or the summary after the last answer. Answering a question opened from summary returns directly to summary. Back preserves drafts; Next can reuse an existing draft after Back and requires an answer. None of these actions sends an agent turn. Focus and recommendations are not answers. Questions without options require custom input, not synthetic acceptance.

Custom text uses Pi's native multiline editor for paste and IME support. Empty text cannot answer a question. Cancelling the editor returns to the current question without changing its answer. Question and summary screens use the saved-plan review theme: accent title, muted separators, and bracketed footer actions. A content-sized, bottom-anchored overlay uses only wrapped body and framing rows, capped at terminal height. Short content has no artificial body padding; controls stay at the terminal bottom for short or long content and after resize or return from the native editor. Options and summary edit links scroll independently of footer actions. Narrow layouts wrap the action bar; extremely short layouts reduce framing and show the current footer action while keyboard navigation remains available. PgUp/PgDn scroll only the body.

## Batch Confirmation

After the last question, an editable answer summary offers Confirm answers. The user can return to any question and revise it before submission. Confirmation sends one structured batch in one explicit follow-up asking the agent to record answers as answered and revise affected plan steps and verification. It does not approve execution.

Cancel discards the unsubmitted batch and returns to planning. Drafts are not persisted across sessions. Deferral, research, and plan revision are requested in planning rather than questionnaire shortcuts.

The next review re-reads durable markdown. New or still-unresolved questions reopen the wizard; only a cleared queue proceeds to the unchanged separate execute/stay/refine/cancel UI described in [WORKFLOW.md](WORKFLOW.md).

## Fallback and Stale Results

Explicit execution requests use the same decision-first ordering. When custom UI is unavailable, sequential select/editor dialogs use the same immediate answer advancement and retain Back/Next, summary editing, and explicit batch confirmation; no first-item-only fallback remains. Without interactive UI, Plan Mode surfaces pending decisions and stays in planning.

Fallback selectors paginate full question/context/option text and answer summaries before offering actions. Read more/Previous page traverses content; Continue unlocks bounded action pages with More actions/Previous actions and Read again. Confirm answers is available only after all summary content pages have been presented. Resizing restarts content review before accepting a choice. Native selector framing requires at least 40 columns and 18 rows; smaller terminals return to planning with a resize notice. RPC without terminal dimensions uses an 80×24 budget.

Missing or unreadable plans and UI errors do not clear the gate. Changes to plan content, active plan, mode generation, session shutdown, or branch navigation invalidate pending answers. Changes during the separate execution review also discard approval.

## Verification

The bounded [fallback pager](../../../packages/pi/extensions/plan-mode/controllers/decision-wizard-pages.ts) is checked with the installed native selector in [pagination regression tests](../../../packages/pi/test/decision-wizard-pages.test.ts). Automated state, component, controller, and status compatibility checks are complemented by [manual wizard smoke tests](../../test/manual-smoke/PLAN_DECISION_WIZARD.md).



## Traceability

<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/components/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/components/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/controllers/decision-wizard.ts](../../../packages/pi/extensions/plan-mode/controllers/decision-wizard.ts)
  - [packages/pi/extensions/plan-mode/controllers/review-gates.ts](../../../packages/pi/extensions/plan-mode/controllers/review-gates.ts)
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/plans.ts](../../../packages/pi/extensions/plan-mode/plans.ts)
  - [packages/pi/extensions/plan-mode/prompts.ts](../../../packages/pi/extensions/plan-mode/prompts.ts)
- Verified by:
  - [packages/pi/test/decision-wizard.test.ts](../../../packages/pi/test/decision-wizard.test.ts)
  - [packages/pi/test/decision-wizard-extension.test.ts](../../../packages/pi/test/decision-wizard-extension.test.ts)
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [packages/pi/test/plan-mode-extension.test.ts](../../../packages/pi/test/plan-mode-extension.test.ts)
  - [docs/test/manual-smoke/PLAN_DECISION_WIZARD.md](../../test/manual-smoke/PLAN_DECISION_WIZARD.md)
- Related docs:
  - [docs/spec/plan-mode/WORKFLOW.md](WORKFLOW.md)
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
- Contracts:
  - `PLAN-MODE-DECISIONS-001` — Sequential plan decisions require explicit batch confirmation before execution review (sections: 3, implementedBy: 7, verifiedBy: 5, relatedDocs: 1, designDecisions: 1)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"],"implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/plans.ts","packages/pi/extensions/plan-mode/prompts.ts"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/decision-wizard-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/plan-mode-extension.test.ts","docs/test/manual-smoke/PLAN_DECISION_WIZARD.md"],"relatedDocs":["docs/spec/plan-mode/WORKFLOW.md","docs/arch/EXTENSION_ARCHITECTURE.md"],"contracts":[{"id":"PLAN-MODE-DECISIONS-001","title":"Sequential plan decisions require explicit batch confirmation before execution review","sections":["Questions and Drafts","Batch Confirmation","Fallback and Stale Results"],"implementedBy":["packages/pi/extensions/plan-mode/decision-wizard.ts","packages/pi/extensions/plan-mode/components/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/decision-wizard.ts","packages/pi/extensions/plan-mode/controllers/review-gates.ts","packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/plans.ts","packages/pi/extensions/plan-mode/prompts.ts"],"verifiedBy":["packages/pi/test/decision-wizard.test.ts","packages/pi/test/decision-wizard-extension.test.ts","packages/pi/test/plan-mode-utils.test.ts","packages/pi/test/plan-mode-extension.test.ts","docs/test/manual-smoke/PLAN_DECISION_WIZARD.md"],"relatedDocs":["docs/spec/plan-mode/WORKFLOW.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}]}
```
