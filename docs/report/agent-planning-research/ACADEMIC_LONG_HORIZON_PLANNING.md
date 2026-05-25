# Academic Long-Horizon Planning

## Research Question

What does academic and research literature say about improving LLM agent planning for long-horizon tasks, and which patterns should dotdotgod plan mode adopt?

## Search Strategy

Focused on hierarchical planning, plan/act separation, replanning, agent trees, task graphs, reflection, and long-horizon failure modes in LLM agents.

## Key Findings

- Long-horizon failures are structural: planning errors, catastrophic forgetting, accumulated history errors, memory limits, and missed constraints compound across many steps.
- Separating high-level planning from low-level execution improves long-horizon task performance.
- Hybrid approaches are stronger than one-shot plans: global milestones preserve direction while local replanning handles surprises.
- Tree/search-style planning helps when early decisions are pivotal or multiple solution paths are plausible.
- Verification and repair loops should be explicit plan artifacts rather than ad hoc chat behavior.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [The Long-Horizon Task Mirage?](https://arxiv.org/html/2604.11978v1) | Long-horizon failures shift toward planning errors, forgetting, history error accumulation, and memory limits. | Supports persistent plan state, bounded context, and explicit failure taxonomy. | Medium-high |
| [Plan-and-Act, ICML/PMLR 2025](https://proceedings.mlr.press/v267/erdogan25a.html) | Separating a planner from an executor improves long-horizon agent performance. | Supports strict plan/execution separation in plan mode. | High |
| [HiPlan](https://arxiv.org/html/2508.19076) | Global milestones plus local hints outperform purely global or purely step-wise approaches. | Supports milestone-level planning with local replanning. | Medium-high |
| [ReAct, ICLR 2023](https://openreview.net/forum?id=WE_vluYUL-X) | Interleaving reasoning and action helps agents update plans and handle exceptions. | Supports iterative plan → execute → evaluate → replan loops. | High |
| [Tree of Thoughts, NeurIPS 2023](https://openreview.net/forum?id=5Xc1ecxO1h) | Exploring multiple reasoning paths with evaluation/backtracking can outperform linear reasoning. | Supports alternative paths and backtracking for risky plan branches. | High for planning tasks; indirect for coding. |
| [Reflexion, NeurIPS 2023](https://proceedings.neurips.cc/paper_files/paper/2023/hash/1b44b878bb782e6954cd888628510e90-Abstract-Conference.html) | Verbal feedback stored in memory improves retry behavior. | Supports decision logs, failure logs, and resume notes. | High |
| [DeepPlanning](https://arxiv.org/html/2601.18137) | Frontier agents struggle with global constrained optimization and implicit constraints. | Supports constraint ledgers and plan validation gates. | Medium-high |

## Patterns to Adopt

1. Represent plans as a hierarchy: goal → milestone → task → atomic action → verification.
2. Keep global constraints pinned separately from local task context.
3. Add an assumption register and require assumptions to be verified or user-confirmed.
4. Add replanning triggers for failed checks, stale assumptions, hidden dependencies, and scope growth.
5. Store task completion evidence: changed files, checks run, outputs summarized, and reviewer notes.
6. Treat risky branches as decision points with alternatives and rollback paths.

## Caveats

- Several highly relevant sources are recent preprints; exact numeric claims should be treated as provisional.
- Web, shopping, and embodied-agent benchmarks transfer imperfectly to coding work, but their failure modes map well to large software tasks.
- Hierarchical planning adds overhead; dotdotgod should use lightweight plans for small tasks and stricter plans for long-horizon work.

## Candidate Plan Mode Improvements

- Add a structured plan schema with goals, constraints, assumptions, milestones, tasks, dependencies, verification, risks, rollback, and status.
- Add active-milestone context that keeps local detail small while preserving global constraints.
- Add automatic replan prompts when verification fails or scope expands.
- Add a completion evidence ledger for every completed task.

## Open Questions

- What threshold should escalate a simple checklist into a full hierarchical plan?
- Should dotdotgod enforce plan schema validation through CLI checks, prompts, or both?
