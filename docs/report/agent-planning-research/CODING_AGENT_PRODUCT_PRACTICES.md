# Coding Agent Product Practices

## Research Question

How do current coding-agent products structure plan mode, approval, verification, and long-running implementation work?

## Search Strategy

Reviewed official or high-authority documentation for Claude Code, OpenAI Codex, Cursor, Devin, Windsurf, and Aider-style planning workflows.

## Key Findings

- Modern coding-agent plan modes converge on gated workflows: explore/read first, produce a plan, then explicitly transition into implementation.
- Strong products make plans editable and persistent instead of keeping them only in chat.
- Verification is part of the plan, not an afterthought.
- Long-running plans work best as living documents with progress, discoveries, decision logs, validation, and recovery notes.
- Products differ on strictness: some enforce read-only planning, while others allow tools but still require plan review before implementation.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [Claude Code common workflows](https://code.claude.com/docs/en/common-workflows) | Plan before editing and use subagents/worktrees for complex work. | Supports plan-first and isolated execution guidance. | High |
| [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode) | Plan mode researches and proposes changes without source edits, then asks how to proceed. | Supports read-only planning and explicit approval. | High |
| [OpenAI Codex ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans) | ExecPlans are living, self-contained design documents for multi-hour work. | Provides a strong template for durable plan docs. | High |
| [OpenAI PLANS.md example](https://github.com/openai/openai-agents-js/blob/main/PLANS.md) | Plans include progress, discoveries, decisions, exact commands, validation, and artifacts. | Supports dotdotgod plan templates and resume state. | High |
| [Cursor Plan Mode](https://cursor.com/help/ai-features/plan-mode) | Cursor creates editable/reviewable plans before writing code. | Supports editable plan artifacts and approval UX. | High |
| [Cursor feature development guidance](https://cursor.com/learn/creating-features) | Agents perform better when they can run tests, type checks, linters, and browser/MCP feedback. | Supports verification-first planning. | High |
| [Devin interactive planning](https://docs.devin.ai/work-with-devin/interactive-planning) | Devin supports approval-based interactive planning and code-citation review. | Supports approval and traceability before implementation. | High |
| [Windsurf Cascade modes](https://docs.windsurf.com/windsurf/cascade/modes) | Plan, Code, and Ask modes separate planning and implementation behaviors. | Supports mode clarity. | High |
| [Windsurf hooks](https://docs.windsurf.com/windsurf/cascade/hooks) | Hooks can block actions, run checks, audit transcripts, and enforce policies. | Suggests future hard validation around plan execution. | High |
| [Aider modes](https://aider.chat/docs/usage/modes.html) | Ask and architect modes separate discussion/proposal from edits. | Supports lightweight plan-first behavior for CLI agents. | Medium-high |

## Patterns to Adopt

1. Generate a persistent plan artifact before implementation.
2. Require explicit approval for non-trivial or multi-file changes.
3. Keep plan mode read-only for source files; allow plan document edits only.
4. Add validation and acceptance criteria before approval.
5. Maintain progress, discoveries, decisions, and outcomes during execution.
6. Recommend revert/refine/retry when implementation diverges from the plan.
7. Support plan-size tiers: lightweight checklist for small tasks and ExecPlan-style docs for larger work.

## Caveats

- Product documentation is practical evidence, not controlled benchmark data.
- Tools vary in autonomy defaults; dotdotgod must choose its safety/autonomy balance explicitly.
- Public docs rarely quantify plan-mode success rates.

## Candidate Plan Mode Improvements

- Add plan states: `draft`, `approved`, `in_progress`, `blocked`, `done`, `archived`.
- Add explicit approval options: revise, approve one chunk, approve all, reject, or keep researching.
- Add required sections for validation, risks, recovery, and resume instructions.
- Add root command suggestions from dotdotgod memory when generating verification plans.

## Open Questions

- Should dotdotgod plan mode block implementation until approval, or only recommend approval?
- Should plan approval be stored in Markdown, machine-readable sidecar metadata, or both?
