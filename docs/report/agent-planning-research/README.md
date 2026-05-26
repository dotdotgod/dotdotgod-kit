# Agent Planning Research

## Purpose

This report set summarizes research evidence for improving dotdotgod plan mode. It focuses on long-horizon coding-agent failures, hierarchical task decomposition, persistent external memory, multi-agent planning, planning visibility, and verification-driven execution.

The reports are evidence snapshots and interpretation. They are not behavior contracts. Durable requirements should move to `docs/spec/`, verification strategy to `docs/test/`, and implementation rationale to `docs/arch/` before source changes.

## Executive Summary

The strongest cross-source pattern is that large coding tasks need a durable, inspectable, hierarchical plan that stays separate from implementation until approval. The plan should decompose work into atomic, verifiable tasks, persist progress outside the context window, support replanning when reality diverges, and record verification evidence before completion.

Recommended direction for dotdotgod plan mode:

1. Treat `docs/plan/<task-slug>/README.md` as the canonical human-readable active plan artifact.
2. Add a plan template with goal, scope, non-goals, constraints, assumptions, milestones, atomic tasks, dependencies, verification, risks, approval state, progress log, and resume point.
3. Make complex plans hierarchical: goal → milestone → task → atomic action → verification.
4. Require each atomic task to state acceptance criteria and verification evidence or an explicit verification gap.
5. Keep plan mode read-only for source files and allow only plan artifact edits until approval for non-trivial work.
6. Add replanning triggers for failed verification, hidden dependencies, scope growth, stale assumptions, and unexpected touched files.
7. Use read-only subagents for research, codebase exploration, test planning, and review; use worktrees or sequential merge gates for parallel writes.
8. Preserve progress, decisions, dead ends, and resume state outside the context window.
9. Consider machine-readable sidecars for complex plans once Markdown conventions stabilize.

## Research Lanes

| File | Focus | Summary |
| --- | --- | --- |
| `ACADEMIC_LONG_HORIZON_PLANNING.md` | Academic and research evidence on long-horizon planning. | Supports hierarchical planning, plan/act separation, local replanning, constraint ledgers, and completion evidence. |
| `CODING_AGENT_PRODUCT_PRACTICES.md` | Current coding-agent product workflows. | Shows convergence around read-first planning, editable plan artifacts, explicit approval, living plans, and verification-first workflows. |
| `EXTERNAL_MEMORY_AND_TODOS.md` | Persistent memory, TODOs, and resume state. | Supports file-backed active plans, current TODOs, progress logs, dead-end tracking, and compact/handoff protocols. |
| `MULTI_AGENT_DECOMPOSITION.md` | Subagents and role-based decomposition. | Supports planner-led, read-heavy subagent workstreams with structured summaries and safe merge gates for writes. |
| `PLANNING_VISIBILITY_UX.md` | Reviewable plans, dependency graphs, approval UX, and progress visualization. | Supports durable plans, non-binary review actions, ready/blocked tables, Mermaid/DOT/JSON exports, and plan diffs. |
| `EVALUATION_AND_VERIFICATION.md` | Plan quality, atomic tasks, regression prevention, and verification metrics. | Supports plan scorecards, atomic task validation, verification debt, regression accounting, and scope drift checks. |
| `TRELLO_PHASE_1_PLANNING_WORKFLOW.md` | Case study of the Trello Docs Sync Phase 1 session workflow. | Shows parent-led scope control, role-specific planning subagents, single-writer implementation, reviewer fanout, and verification-first closure. |
| `TRELLO_PHASE_2_PLANNING_WORKFLOW.md` | Case study of the Trello Docs Sync Phase 2 session workflow. | Shows decision locking, role handoffs, durable-doc synthesis, credentialed write-mode implementation later superseded by Phase 3 CI-only writes, reviewer fix loop, and unrelated-validation-debt reporting. |

## Cross-Cutting Findings

### Plan artifacts should be durable and reviewable

Chat-only plans are fragile. Product practices and long-running agent harnesses both point toward saved plan artifacts with progress, decision logs, and validation notes.

### Planning and execution should be separated

The evidence strongly supports a read/research/plan phase before implementation. For non-trivial work, execution should require approval or a clear mode transition.

### Atomic tasks need explicit verification

Tasks like “refactor auth” are too broad. Good tasks are scoped, testable, and independently reviewable. Each task should have done criteria and verification evidence.

### Replanning should be expected

Plans should change when new information appears. Replanning is not failure; it is the control loop that prevents goal drift, hidden dependency explosions, and brittle up-front plans.

### External memory is required for long tasks

Context windows are not reliable execution memory. Current TODOs, progress logs, decisions, dead ends, and resume points should live in files.

### Subagents are useful when bounded

Subagents reduce context pollution for research and review, but their outputs need structured summaries and confidence fields. Parallel writes need isolation. The Trello Phase 1 case study shows a safe split: parallel planning, single-writer implementation, and parallel review fanout.

### Visibility improves user correction

Users need to see task order, dependencies, blockers, verification gaps, and approval state early enough to correct the plan before edits happen.

## Evidence Matrix

| Finding | Supporting Reports | Applies to dotdotgod? | Priority | Candidate Improvement |
| --- | --- | --- | --- | --- |
| Separate planning from implementation. | Academic, Product Practices, Planning UX | Yes | High | Make plan mode read/research/plan only for non-trivial tasks until approval. |
| Use hierarchical decomposition. | Academic, Evaluation | Yes | High | Add goal → milestone → task → atomic action → verification structure. |
| Persist execution state outside context. | External Memory, Product Practices | Yes | High | Strengthen `docs/plan/<task>/README.md` template with current TODO, progress, decisions, and resume point. |
| Require verification per task or milestone. | Product Practices, Evaluation, Academic | Yes | High | Add atomic task schema with done criteria and verification evidence. |
| Support replanning loops. | Academic, External Memory, Product Practices | Yes | High | Add explicit replanning triggers and decision log updates. |
| Add plan visibility and approval metadata. | Planning UX, Product Practices | Yes | Medium-high | Add approval block, ready/blocked table, and optional dependency graph. |
| Use bounded subagent workstreams. | Multi-Agent, Product Practices | Yes | Medium-high | Add researcher/tester/reviewer summary templates and read-only defaults. |
| Detect scope drift and verification debt. | Evaluation, External Memory | Yes | Medium | Compare changed files/checks to planned tasks and report skipped checks. |
| Add machine-readable sidecars. | External Memory, Planning UX, Evaluation | Maybe | Medium | Consider `PLAN.json` or `TASKS.json` after Markdown conventions stabilize. |
| Add graph visualization. | Planning UX | Maybe | Medium-low | Start with Mermaid or DOT exports for complex plans only. |

## Recommended Plan Mode Improvements

### Immediate documentation and prompt improvements

- Add a stricter plan template for complex work.
- Define atomic task quality criteria.
- Add a required verification section to every task or milestone.
- Add `Current TODO`, `Progress Log`, `Decision Log`, and `Resume Point` conventions.
- Add replanning triggers and explicit approval states.

### Near-term workflow/tooling improvements

- Add plan validation that flags missing verification, broad tasks, absent resume points, and unresolved assumptions.
- Add subagent summary templates for research, codebase exploration, testing, and review.
- Add optional ready/blocked tables and dependency graphs for complex plans.
- Add scope drift checks comparing planned files/areas with actual changes.

### Longer-term product ideas

- Add `dotdotgod plan status`, `plan resume`, `plan update`, and `plan archive` helpers.
- Add machine-readable plan sidecars for status and dependency validation.
- Add plan diffing between proposed, approved, and executed states.
- Benchmark plan mode with internal fixtures that measure plan quality, rework, regressions, and verification coverage.

## Proposed Follow-Up Docs

If these findings become implementation work, route them as follows:

- `docs/spec/`: behavior contract for plan mode states, approval semantics, task schema, and validation behavior.
- `docs/arch/`: plan-mode architecture, document/sidecar model, subagent boundaries, and graph/export design.
- `docs/test/`: plan validation fixtures, replanning cases, scope-drift cases, and manual workflow checks.
- `docs/plan/`: active implementation plan for plan-mode changes.

## Verification Notes

This report set should be validated with the docs/project-memory command after creation or edits:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

If indexes drift, refresh the project index and validate again:

```bash
node packages/cli/bin/dotdotgod.mjs index . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```
