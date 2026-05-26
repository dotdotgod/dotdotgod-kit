# External Memory and TODOs

## Research Question

How should coding agents persist execution state, TODOs, decisions, and resume context outside the context window?

## Search Strategy

Reviewed official docs and engineering writeups on Claude Code memory, long-running agent harnesses, context engineering, persistent planning plugins, and durable agent state.

## Key Findings

- Context windows are not reliable execution memory for long-running tasks.
- Durable file-backed state reduces goal drift, repeated failed attempts, and premature completion claims.
- Plans should distinguish project rules, active execution state, scratch research, and archived history.
- A short current TODO near the top of the active plan helps agents reorient before decisions.
- Progress and failure logs are important because resumed agents often repeat dead ends unless those dead ends are explicit.

## Evidence

| Source | Claim | Relevance to dotdotgod | Confidence |
| --- | --- | --- | --- |
| [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Compaction alone was insufficient; agents guessed at half-implemented work or declared completion too early. | Supports explicit progress state and one-feature-at-a-time workflows. | High |
| [Claude Code memory](https://code.claude.com/docs/en/memory) | Memory files should be concise, scoped, and loaded on demand; memory is context, not enforcement. | Supports compact plan indexes and validation hooks. | High |
| [Google ADK long-running agents](https://developers.googleblog.com/build-long-running-ai-agents-that-pause-resume-and-never-lose-context-with-adk/) | Durable state machines, checkpoints, and event-driven resume are preferred over replaying raw conversation history. | Supports machine-readable plan state and resume protocols. | High |
| [Manus context engineering](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) | Filesystem state and `todo.md` recitation help avoid lost-in-the-middle behavior. | Supports task-local TODOs and external plan memory. | Medium-high |
| [Anthropic context management](https://www.anthropic.com/news/context-management) | Memory plus context editing improved internal agentic-search performance and reduced token use in long sessions. | Supports bounded memory and stale-context removal. | Medium-high |
| [Cursor Plan Mode](https://cursor.com/docs/agent/plan-mode) | Plans are reviewable/editable and can be saved for future reference. | Supports durable plan files. | High |
| [persistent-planning](https://github.com/TheGlitchKing/persistent-planning) | Community plugin stores `.planning/<task>/task_plan.md` and notes. | Shows demand for task-local planning state. | Medium |
| [jons-plan](https://github.com/jonmmease/jons-plan) | Community plugin uses workflow state, progress logs, dead-end tracking, hooks, and auto-resume prompts. | Offers design signals for resumable plan state. | Medium |

## Patterns to Adopt

1. Use `docs/plan/<task-slug>/README.md` as the canonical human-readable active plan.
2. Add optional sidecars such as `STATE.json`, `TASKS.json`, `PROGRESS.md`, `DECISIONS.md`, and `DEAD_ENDS.md` for complex work.
3. Keep a short `Current TODO` and `Resume Point` near the top of every active plan.
4. Require pre-compaction or handoff updates: completed items, in-progress item, files changed, commands run, failed approaches, and next action.
5. Mark task state explicitly: `todo`, `in_progress`, `blocked`, `done`, or `skipped`.
6. Archive completed plans under `docs/archive/plan/<task-slug>/`.

## Caveats

- Long memory files can pollute context; indexes should stay short and link to details.
- Markdown is readable but not strict. Machine-readable sidecars are useful if validation matters.
- Persistent memory is guidance unless enforced by hooks or validation commands.
- Stale plan state can be worse than no plan state; pruning and archive rules matter.

## Candidate Plan Mode Improvements

- Add a canonical active-plan template with Objective, Current State, TODO, Decisions, Files, Verification, and Resume Point.
- Add optional `STATE.json` and `TASKS.json` schemas for robust tracking.
- Add a resume checklist and compact/handoff checklist.
- Add plan validation that flags missing current TODO, next action, or verification criteria.
- Consider CLI helpers such as `dotdotgod plan status`, `plan resume`, `plan update`, and `plan archive`.

## Open Questions

- Which fields should remain Markdown-only and which should become machine-readable?
- Should dotdotgod validate active plans by default, or only when requested?
