# Plan Mode Execution Verification

The verification loop is the default for an approved saved plan, including one with no todos. It distinguishes a settled assistant turn from finished work: completion needs progress **and** observed verification, not an assistant claim. There is no legacy opt-out.

## Saved Plan Contract

- Use `<docRoot>/plan/<task-slug>/README.md` even for small tasks with mandatory commands. Simple in-chat checklists without required commands stay outside the loop.
- List runnable checks under `## Verification` as backticked bullets or one command per line in shell/untagged fences. Use environment references, not literal secrets. Describe expected outcomes in prose; only commands count. The parser deduplicates up to 100 checks and accepts supported `&&` chains, not substitutions, pipes, or redirects.
- Under `## Re-plan If`, list concrete invalidating conditions. The agent explains an observed condition and emits `[REPLAN: <reason>]`, or uses `[BLOCKED: <reason>]` when user input is needed. The extension consumes signals, not plan prose; tags in code are ignored.

## Review and Approval

`loadReviewSnapshot` validates the README path and canonical containment. One read supplies the preview, queue, todos, and verification contract. Unreadable files, path escapes, and malformed contracts fail closed without falling back to assistant prose. TUI and RPC select titles show the check count when nonzero.

After the [decision queue](DECISION_WIZARD.md) clears, only Execute rechecks the canonical target and exact bytes. A missing or changed target, changed bytes, or stale generation discards approval. Candidate selection never replaces approved progress/debt; committed Execute of a different plan does. Re-approving the same plan carries debt. Persist the approval marker and executing checkpoint before enabling normal tools and queuing the handoff; write failure returns to planning.

## Observed Evidence

Branch-scoped v2 session JSONL stores `executionEvidence`: attempt/plan, contract hash/count, edit and pass revisions, bounded edited paths, carried debt, last check, and observed-turn flag. Commands, output, env values and signal prose are not stored. Compiled checks, generic failure identity and per-run state stay in RAM.

- **Edits:** Successful observed edit/write results advance the revision. Source/config, recognized extensionless files (e.g. `Makefile`), and runtime prompts/skills (e.g. `SKILL.md` and package Markdown) also create substantive debt. Plain docs, including `docs/spec/`, only stale explicit checks. Plan/archive, generated/cache directories, and invalid or external paths are excluded. External editors, shell writes, and user `!` commands are not observed.
- **Checks:** Required passes must match the current edit revision. A substantive pass at or after the latest source edit clears source debt; carried debt needs a substantive pass at the current revision. Recognized test, lint, typecheck, build, validate and verify runners can supply substantive evidence; docs validation does not test code.
- **Receipts:** Normalize native `bash` and structured dotdotgod MCP `execute` results; match argv, effective cwd and env assignments. Contradictory bash status or invalid MCP envelopes give no pass; one malformed MCP row does not invalidate valid rows. Timeouts, aborts, capture limits and unconfirmed receipts are not passes.
- **Ordering:** Consume each admitted result once, rejecting stale attempt/generation or edit revision. Parallel MCP batches apply passes first, with at most one strike per check per call. An overlapping V2 can keep independent pass credit without clearing V1's failure. A non-passing retry invalidates the required check's prior credit; non-check commands do not alter the last check.

## Settlement and Re-planning

The `agent_before_settle` gate evaluates in this order:

1. Outside `executing`, do nothing.
2. On host abort or error, pause if an execution turn was observed or its handoff dispatched; otherwise do nothing.
3. Without an observed execution turn, do nothing. Approval alone never completes or continues execution.
4. On `[REPLAN]`, return to planning.
5. On two consecutive failures of the same confirmed check, return to planning. Aborted or unconfirmed receipts are not failure strikes.
6. On `[BLOCKED]`, pause for user input.
7. If no todos, verification debt, missing current-revision checks, or unresolved non-passing last check remain, stage completion.
8. Defer to an existing host continuation or pending messages when the host can continue.
9. If the progress fingerprint is unchanged since the last automatic continuation, pause with `no_progress`.
10. If three automatic continuations have already been issued in this run, pause with `budget_exhausted`.
11. Otherwise append a hidden continuation prompt to the existing staged entries and request continuation.

`[DONE:n]` records progress, not proof. Pause stays in `executing`; reply to continue or use `/dd:plan <reason>` to revise. Escalation (`executing` → `planning`) preserves progress/debt while restricting tools and revoking execution authority before awaiting child revocation. Re-approval is required. `agent_settled` persists `off` before clearing state, only for the current attempt/generation with `aborted === false`. A missing boolean or failed checkpoint leaves execution active. No completion popup or automatic indexing.

## Status and Delivery

One `plan-mode` footer slot shows `⏸ plan` in planning/reviewing, and `📋 N/M` (or `📋 exec` without todos) in execution. Append `· Vp/k` for explicit checks, `· verify` for substantive debt, and `(a/3)` for auto-continuations, e.g. `📋 1/3 · V0/2 · verify (1/3)`. Pauses replace those suffixes with `· blocked` or `· paused`; the latter covers `no_progress`, `budget_exhausted`, `aborted`, and `error`. The footer never prints edit revisions and clears on completion.

TUI/RPC use UI notifications. The three non-UI channels all require `!hasUI && mode !== "print"` and do not trigger a turn:

1. Settle stop/re-plan notices stage in `agent_before_settle` and flush once in `agent_settled`. A late abort suppresses a stop notice, not an already committed re-plan.
2. Idle recovery emits after its restricted-planning checkpoint; ordinary `/tree` freshness warnings need no write.
3. The pending-decision notice is emitted at `agent_end` for a pending review.

Print mode sends none of these custom messages, preserving the final assistant message on stdout. The `context` hook always strips execution-status messages; planning instructions survive only in planning/reviewing. Execution prompts require the current `attemptId`; continuation prompts also require a positive current `activeRunId` matching their `runId`.

## Branch Restore

Restore reads only `sessionManager.getBranch()`; sibling entries and persisted tool selections grant no authority. Executing restore validates the attempt marker, evidence, plan path and contract together, replays scoped non-aborted todo progress, and clears pass freshness. A normal `/tree` switch into executing stays executing, warns that verification must be refreshed against disk, and writes no checkpoint. Legacy v2 execution without evidence recovers to restricted planning with the validated plan path, todo progress and unverified debt; invalid evidence also fails closed into planning. Recovery writes a checkpoint before notifying and requires Execute again.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/execution-evidence.ts](../../../packages/pi/extensions/plan-mode/execution-evidence.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-evidence.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-evidence.ts)
  - [packages/pi/extensions/plan-mode/controllers/execution-flow.ts](../../../packages/pi/extensions/plan-mode/controllers/execution-flow.ts)
  - [packages/pi/extensions/plan-mode/presentation.ts](../../../packages/pi/extensions/plan-mode/presentation.ts)
- Verified by:
  - [packages/pi/test/plan-mode-execution-verification.test.ts](../../../packages/pi/test/plan-mode-execution-verification.test.ts)
  - [packages/pi/test/plan-mode-execution-presentation.test.ts](../../../packages/pi/test/plan-mode-execution-presentation.test.ts)
  - [packages/pi/test/plan-mode-execution-handlers.test.ts](../../../packages/pi/test/plan-mode-execution-handlers.test.ts)
- Related docs:
  - [docs/spec/plan-mode/WORKFLOW.md](WORKFLOW.md)
  - [docs/spec/plan-mode/DEBUG_AND_ARCHIVE.md](DEBUG_AND_ARCHIVE.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
- Contracts:
  - `PLAN-MODE-VERIFICATION-001` — Plan execution settles only after observed verification or pauses for re-planning (sections: 5)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/execution-evidence.ts","packages/pi/extensions/plan-mode/controllers/execution-evidence.ts","packages/pi/extensions/plan-mode/controllers/execution-flow.ts","packages/pi/extensions/plan-mode/presentation.ts"],"verifiedBy":["packages/pi/test/plan-mode-execution-verification.test.ts","packages/pi/test/plan-mode-execution-presentation.test.ts","packages/pi/test/plan-mode-execution-handlers.test.ts"],"relatedDocs":["docs/spec/plan-mode/WORKFLOW.md","docs/spec/plan-mode/DEBUG_AND_ARCHIVE.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"],"contracts":[{"id":"PLAN-MODE-VERIFICATION-001","title":"Plan execution settles only after observed verification or pauses for re-planning","sections":["Review and Approval","Observed Evidence","Settlement and Re-planning","Status and Delivery","Branch Restore"]}]}
```
