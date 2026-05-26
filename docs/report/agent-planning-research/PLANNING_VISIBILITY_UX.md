# Planning Visibility UX

## Research Question

How should plan mode make plans visible, reviewable, editable, and dependency-aware before execution?

## Search Strategy

Reviewed agent product documentation and workflow orchestration tools focused on plan review, approval, DAGs, dependency graphs, task status, and progress visualization.

## Key Findings

- Planning should be separated from execution and visible before source changes.
- Durable plan artifacts are easier to review, share, diff, and resume than chat-only plans.
- Users need more than yes/no approval: revise, approve selected chunks, reject, push back, or keep planning.
- Dependency-aware views explain task order, blockers, parallelism, and critical paths.
- Full graph UIs may be overkill for dotdotgod, but Mermaid/DOT/JSON exports and progress tables fit a docs-first project.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [Cursor Plan Mode](https://cursor.com/docs/agent/plan-mode) | Cursor researches, asks clarifying questions, creates an editable plan, and lets users build when ready. | Supports editable plans and approval before implementation. | High |
| [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes) | Claude plan mode explores/proposes before edits and exits through approval options. | Supports read-only plan mode. | High |
| [Claude Ultraplan](https://code.claude.com/docs/en/ultraplan) | Browser-based review supports comments, revisions, and execution choices. | Supports richer review affordances as future inspiration. | High |
| [Mux Plan Mode](https://mux.coder.com/agents/plan-mode) | Plan mode restricts edits to the plan file and supports rendered/raw views, external edits, and diffs. | Supports plan-file-only writing and plan diffing. | High |
| [MassGen task planning](https://docs.massgen.ai/en/stable/user_guide/task_planning.html) | Saved structured plans include task IDs, status, dependencies, chunks, and verification metadata. | Supports structured plan schema and chunked execution. | High |
| [Kodexa planning mode](https://developer.kodexa.ai/studio/project/planning-mode) | DAG workflow editor uses typed nodes, dependencies, status colors, and deadlock detection. | Supports dependency graphs and blocked-state modeling. | High |
| [Dagu approval](https://docs.dagu.sh/writing-workflows/approval) | Approval gates allow approve, push back/retry with feedback, or reject. | Supports non-binary review loops. | High |
| [Moon task graph](https://moonrepo-moon.mintlify.app/commands/task-graph) | Task graphs expose dependencies, critical path, estimates, and parallelism. | Supports graph export ideas. | High |
| [GSD visualizer](https://github.com/gsd-build/gsd-2/blob/HEAD/docs/user-docs/visualizer.md) | Visualizer combines progress tree, timeline, dependency graph, metrics, activity, and exports. | Supports future progress visualization. | Medium-high |
| [xpander planning mode](https://docs.xpander.ai/user-guide/build/planning-mode) | Checklist planning supports real-time updates, monitoring, and retry nudges. | Supports progress checklist UX. | Medium-high |

## Patterns to Adopt

1. Plan mode may write only plan artifacts until approval.
2. Store plans under `docs/plan/<task-slug>/` with structured review metadata.
3. Add review actions: approve, request revision, edit directly, reject, or approve selected chunks.
4. Add task IDs, dependencies, status, owner/lane, touched areas, risks, verification method, and acceptance criteria.
5. Show ready/blocked task tables and a milestone progress tree.
6. Export dependency graphs as Mermaid, DOT, or JSON for review.
7. Capture review feedback and agent responses in plan history.
8. Track deviations from proposed plan during execution.

## Caveats

- Interactive graph UIs may be too heavy for a docs-first workflow.
- Dependency modeling should be optional for simple tasks.
- Approval gates need enforcement through workflow, validation, or tooling; prompts alone are not deterministic.
- Stale status fields can reduce trust unless verification evidence is required.

## Candidate Plan Mode Improvements

- Add an approval block with `proposed`, `approved`, `revision_requested`, `executing`, and `complete` states.
- Add ready/blocked tables to complex plans.
- Add a Mermaid dependency graph section or generated artifact.
- Add plan diff/report command ideas for proposed vs approved vs executed plans.
- Add validation rules for complex plans lacking dependencies, verification methods, or approval state.

## Open Questions

- Should graph export be manually authored in Markdown first or generated from a sidecar schema?
- What complexity threshold should require dependency modeling?
