# Evaluation and Verification

## Research Question

How should dotdotgod evaluate plan quality, atomic task quality, verification coverage, and regression risk?

## Search Strategy

Reviewed recent coding-agent evaluation work, plan/task quality heuristics, software engineering review practices, automated testing guidance, and constraint-checking benchmarks.

## Key Findings

- Binary task completion is insufficient; plans should be judged by maintainability, lifecycle friction, verification coverage, and regression control.
- End-to-end lifecycle benchmarks expose failures hidden by isolated implementation tasks.
- Good plan tasks should be small, independent, specific, measurable, and testable.
- Verification should combine static review, dynamic execution, and explicit regression accounting.
- Plans should name both success checks and known verification gaps before implementation begins.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [SWE-CI](https://arxiv.org/html/2603.03823) | Snapshot benchmarks hide maintainability differences; zero-regression rates remain low. | Supports regression accounting and post-change evidence. | Medium-high |
| [SWE-Cycle](https://arxiv.org/html/2605.13139) | Full lifecycle evaluation shows compound implementation and test-generation failures. | Supports evaluating planning, implementation, and verification together. | Medium-high |
| [Spec Kit Agents](https://arxiv.org/abs/2604.05278) | Repository probing and validation hooks improve quality across specify/plan/tasks/implement stages. | Supports context-grounding checkpoints and staged validation. | Medium-high |
| [Google Small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html) | Small, self-contained changes are easier to review, less bug-prone, and easier to roll back. | Supports atomic task constraints. | High |
| [INVEST and SMART tasks](https://xp123.com/articles/invest-in-good-stories-and-smart-tasks/) | Good work items are independent, small, testable, specific, measurable, achievable, relevant, and time-boxed. | Supports task quality rubric. | High |
| [Software Engineering at Google: Testing Overview](https://abseil.io/resources/swe-book/html/ch11.html) | Automated tests enable confident change and serve as executable documentation, but coverage alone is insufficient. | Supports verification-first planning and behavior-based checks. | High |
| [DeepPlanning](https://arxiv.org/html/2601.18137) | Frontier agents struggle with proactive information acquisition, local constraints, and global consistency. | Supports explicit constraint checks and global consistency validation. | Medium-high |

## Patterns to Adopt

1. Add a plan acceptance rubric covering goal alignment, atomicity, verification, regression guards, grounding, dependencies, and scope drift risk.
2. Define an atomic task schema: ID, objective, scope, files/areas, dependencies, done criteria, verification command, regression checks, and rollback notes.
3. Require verification-first planning: every task has a success proof or an explicit verification gap.
4. Use static and dynamic gates: plan linting plus executable validation commands after changes.
5. Track regression metrics: failing tests before/after, changed files outside planned scope, skipped checks, and verification debt.
6. Compare plan promises to actual changed files/tests before completion.

## Caveats

- Recent benchmarks are often preprints; treat numbers as provisional.
- LLM-as-judge should not replace execution evidence and human-calibrated rubrics.
- Over-strict validation can reject valid alternative approaches; over-lenient checks can reward superficial changes.
- Atomicity should not fragment work so much that integration health is lost.

## Candidate Plan Mode Improvements

- Add a plan quality scorecard: atomicity, grounding, verification coverage, regression risk, dependency clarity.
- Add task validation that flags vague, broad, multi-objective, or unverifiable tasks.
- Require done criteria and verification commands before approval.
- Add verification debt reporting.
- Add scope drift detection that compares changed files/actions with planned tasks.
- Build internal fixtures to benchmark plan acceptance rate, implementation success, regressions, rework count, and verification coverage.

## Open Questions

- Should plan validation be advisory or blocking?
- What minimum verification evidence is acceptable for documentation-only tasks?
