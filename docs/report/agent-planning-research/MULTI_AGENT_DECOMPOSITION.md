# Multi-Agent Decomposition

## Research Question

When should plan mode decompose work across specialized agents, and what coordination safeguards are needed?

## Search Strategy

Reviewed Claude Code, Codex, OpenHands, and academic multi-agent coding systems such as ChatDev, MetaGPT, AgileCoder, plus research on multi-agent prompt/workflow optimization.

## Key Findings

- Subagents are most useful for context isolation, noisy exploration, independent research, test planning, and review.
- The main planner should remain the coordination authority; subagents should return structured summaries, not unbounded transcripts.
- Parallel writes require isolation through worktrees, branches, or strict file ownership; otherwise sequential integration is safer.
- Progress tracking with owners, dependencies, blockers, and evidence is the central coordination primitive.
- Role-based multi-agent systems need tuning and review because one agent's hallucination can cascade into others.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [Claude Code subagents](https://code.claude.com/docs/en/sub-agents.md) | Subagents have separate context windows, custom prompts, and tool access for focused tasks. | Supports context-isolated research/review lanes. | High |
| [Claude Code agents](https://code.claude.com/docs/en/agents.md) | Different parallel patterns fit different needs: subagents, agent view, teams, and worktrees. | Supports choosing decomposition mode by risk and task type. | High |
| [Claude Code worktrees](https://code.claude.com/docs/en/worktrees) | Worktrees isolate parallel code changes. | Supports safe parallel implementation boundaries. | High |
| [OpenAI Codex subagents](https://developers.openai.com/codex/subagents) | Subagents help with parallel exploration and reduce main-thread context pollution. | Supports read-heavy subagents during planning. | High |
| [OpenAI Codex multi-agents](https://developers.openai.com/codex/concepts/multi-agents/) | Multi-agent workflows can prevent context rot but need coordination. | Supports structured summaries and merge gates. | High |
| [OpenHands task tool set](https://docs.openhands.dev/sdk/guides/task-tool-set) | Parent agents can delegate complex tasks to subagents and receive consolidated results. | Supports planner-led delegation. | High |
| [OpenHands agent delegation](https://docs.openhands.dev/sdk/guides/agent-delegation) | Subagents run independently with their own context. | Supports isolated research lanes. | High |
| [ChatDev](https://aclanthology.org/2024.acl-long.810.pdf) | Software workflows can be modeled as multiple specialized roles. | Supports role separation as a design reference. | Medium |
| [MetaGPT](https://arxiv.org/pdf/2308.00352) | SOP-style multi-agent workflows reduce inconsistency and cascading hallucination. | Supports explicit role contracts and standard outputs. | Medium |
| [AgileCoder](https://arxiv.org/html/2406.11912) | Agile roles and backlog/sprint decomposition improve multi-agent software workflows. | Supports progress boards and task ownership. | Medium |
| [Optimizing LLM-based multi-agent systems](https://arxiv.org/abs/2405.09849) | Role-based systems can underperform without feedback and workflow refinement. | Supports review and tuning rather than blind delegation. | Medium |

## Patterns to Adopt

1. Add a planner-led decomposition phase with workstreams, owner roles, dependencies, risks, expected artifacts, permissions, and completion criteria.
2. Use a bounded default role set: planner, researcher, codebase explorer, tester, reviewer, and implementer.
3. Make subagents read-only by default during planning.
4. Require subagent summaries with task, inspected sources, findings, evidence, confidence, assumptions, open questions, and recommended next action.
5. Use worktrees or sequential merge gates for parallel writes.
6. Track workstream status, blockers, dependencies, latest evidence, and done criteria in the plan.

## Caveats

- Multi-agent coordination overhead can outweigh benefits for small tasks.
- Parallel code edits can create conflicts or inconsistent designs.
- Subagent summaries can omit critical details; source lists and confidence fields are mandatory.
- Academic multi-agent coding benchmarks are useful references but not direct proof for real repositories.

## Candidate Plan Mode Improvements

- Add optional subagent dispatch templates for research, codebase exploration, test planning, and review.
- Add a standard subagent summary schema.
- Add parallel-write safety rules.
- Add progress-board fields to plan templates.
- Add review/test gates before implementation handoff.

## Open Questions

- Which subagent roles should be built into dotdotgod prompts versus documented as optional workflow patterns?
- Should plan mode automatically propose subagent decomposition based on task size/risk?
