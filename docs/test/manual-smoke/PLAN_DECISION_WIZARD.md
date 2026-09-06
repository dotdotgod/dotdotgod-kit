# Plan Decision Wizard Smoke Tests

Behavior contract: [DECISION_WIZARD.md](../../spec/plan-mode/DECISION_WIZARD.md). Run in a Pi session with the local adapter installed and `/dd:plan` enabled.

## Sequential Answers and Separate Execution Approval

1. Write a plan README with at least two unresolved `Discussion Queue` items, including one without options. Confirm the decision wizard replaces the old console and displays questions in file order.
2. Focus options with Up/Down or Tab; Enter saves the answer and immediately advances, without submission. The last answer opens summary. Use Back/Left to revisit drafts and Next/Right to reuse them. Next before explicit selection must not advance. A recommendation must not pre-answer the question.
3. Select Other. Non-empty submission must immediately advance. Test Korean IME, multiline paste, empty-text rejection, and cancelling the native editor: blank/cancel must stay on the same question without changing a previous draft. A question without options must require custom text.
4. Reach the final summary, return to any question, and answer via an option or custom text to return directly to summary without Next. Confirm the full revised answer appears. No agent turn should occur between questions.
5. Choose Confirm answers. Exactly one batch follow-up must record answers and revise the durable plan. Only then may the separate unchanged execute/stay/refine/cancel screen appear. Newly added or still-unresolved questions must reopen the wizard instead.
6. Cancel/Esc during the wizard must discard drafts without changing plan answers or granting execution. Reopen and confirm drafts were not persisted.
7. A required `blocks-execute-review` item with Status: deferred must block even when checked. Historical answered/accepted-risk items and unflagged legacy deferrals remain compatible.

## Fallback and Failure Safety

1. Force the custom UI to throw and test RPC mode. Sequential select/editor dialogs must immediately advance on option/custom answers, cover every question, Back/Next, editable summary, and final batch confirmation; no first-item-only submission is allowed.
2. Force fallback with 50 questions, long context/options and multiline answers at 40×18, 60×22, and 80×24. Traverse Read more/Previous page and More actions/Previous actions; verify the full content is readable before Confirm answers appears. Resize between dialogs and verify review restarts; below 40×18, expect a resize notice and no submission.
3. In noninteractive mode, confirm pending decisions are surfaced and Plan Mode remains active without granting execution.
4. Change or delete the plan during question collection and during separate execution review. Returned answers or approval must be rejected.
5. Toggle Plan Mode, switch sessions, or navigate a branch while review is pending. Stale answers must not be sent and stale execute choices must not restore normal mutation tools.
6. Use duplicate question IDs and confirm review stops with a correction message rather than merging answers.

## Terminal Layout

1. Compare question and summary screens with saved-plan execution review: accent title, muted separators, and bracketed highlighted footer actions should share the same theme.
2. At 80×24 and a tall terminal, compare a one-line question with long Korean questions/options and multiline summary answers. Short panels must shrink to content plus framing without empty body padding; the footer must touch the terminal bottom. Long panels must stay bounded to terminal height. Advance from a long question to a short one and shorten a summary draft: the panel must shrink without stale painted rows above it.
3. Scroll via PgUp/PgDn. Only body content moves; Back/Next/Cancel or Confirm answers/Back/Cancel remain outside the scroll area. Tab/Up/Down must reach every option, summary edit link, and footer action without implicitly answering.
4. Resize to 40×12, 22×8, and back to 80×24. Check width bounds, wrapped footer actions, visible selected actions, and bottom alignment. Extremely short layouts reduce framing rather than clipping controls away.
5. Open Other and submit or cancel the native editor; the reopened wizard must retain drafts and bottom alignment. Verify separate execution review and fallback pagination remain unchanged.

## Evidence Boundary

Automated checks in `packages/pi/test/decision-wizard.test.ts` exercise draft transitions, controller dialogs, width bounds, and failure paths. `packages/pi/test/decision-wizard-pages.test.ts` additionally renders the installed native selector on every fallback page and navigates its real keyboard handlers. Passing those checks is not evidence that a real terminal's IME candidate window, clipboard paste, and resize behavior have been manually verified.
