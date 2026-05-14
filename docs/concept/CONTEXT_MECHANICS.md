# Context Mechanics

## How dotdotgod Works During a Task

A typical dotdotgod workflow is a loop that turns current work into future project memory:

1. **Load curated project memory when needed.** If project memory is missing or stale, Plan Mode requests the full curated project memory surface: canonical rules, README indexes, specs, architecture, tests, and active plans. This is a full curated load, not a planning-only slice, and archive bodies remain excluded by default.
2. **Read stable docs first.** The docs map tells the agent where to find product truth, engineering constraints, verification expectations, active plans, and historical archives.
3. **Plan in a durable file.** Current task intent is written to `docs/plan/<task-slug>/README.md` with scope, target files, risks, verification, and executable steps.
4. **Keep planning separate from mutation.** In Pi, Plan Mode allows exploration and plan-file edits while blocking source/config changes until execution mode.
5. **Compact planning context when needed.** If the planning context grows large, Plan Mode requests compaction with planning-specific instructions instead of generic summarization. If both load and compaction are needed, compaction is requested first and the curated project memory load follows after compaction completes.
6. **Execute explicit steps.** Execution starts from the written plan, and completed steps are marked with `[DONE:n]` markers.
7. **Verify with project-specific checks.** Verification commands and manual smoke tests live in project docs.
8. **Archive the outcome.** Completed plans move to `docs/archive/plan/<task-slug>/` so the result becomes reusable historical memory.

This workflow does not require every agent to remember every previous conversation. It gives agents stable places to find the current task, project rules, constraints, verification history, and completed decisions.

Plan Mode controls planning context in two directions: if context is missing or stale, it loads curated project memory; if context is too large or noisy, it compacts with planning-specific instructions. Only after context is shaped should the agent write or refine the plan.

## How Plan Mode Compaction Helps Agents

Plan Mode compaction is designed to preserve task-shaped context, not just make the conversation shorter.

When Plan Mode triggers compaction, it passes planning-specific instructions that preserve:

- user decisions and constraints
- active plan task slug, path, and status
- touched `docs/plan` and `docs/archive` files
- relevant `docs/spec`, `docs/test`, and `docs/arch` context
- implementation decisions
- verification results and command outcomes
- unresolved risks, questions, and next steps
- completed `[DONE:n]` markers when present

It asks compaction to omit low-value discussion, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail.

This helps because long planning sessions often contain both useful decisions and noisy residue. Generic compaction can flatten away the shape of the work. Planning-focused compaction keeps the current task state explicit, so the agent can continue from a smaller summary that still knows what plan is active, what has been decided, and what remains unresolved.

## How Structure and Naming Rules Act on Agents

The docs structure is part of the agent interface.

Predictable paths reduce search overhead. When an agent needs product behavior, it checks `docs/spec`. When it needs constraints or conventions, it checks `docs/arch`. When it needs verification, it checks `docs/test`. When it needs current task intent, it checks `docs/plan`.

`README.md` files act as local tables of contents. They turn directories into navigable maps so agents can choose relevant files instead of scanning every document.

Naming rules also matter:

- kebab-case directories make task and domain slugs stable, easy to type, and easy to reference in prompts and commands.
- UPPER_SNAKE_CASE markdown files distinguish durable docs from casual notes and make important docs visually searchable.
- `README.md` as the only mixed-case exception gives every folder a predictable entrypoint.
- separate `spec`, `arch`, `test`, `plan`, and `archive` layers reduce ambiguity about whether a fact is a requirement, an implementation constraint, a verification note, current intent, or historical context.

`docs/plan` and `docs/archive` are ignored by git by default. That lets agents keep useful local working memory and completed-task history without forcing every private plan, temporary report, or investigation into shared repository history.

## Why This Becomes More Useful as Projects Grow

As a project grows, unstructured context becomes harder for agents to use. More files, more decisions, more completed tasks, and more historical chat logs increase the chance that important constraints are buried under irrelevant detail.

The dotdotgod structure keeps growth manageable:

- stable rules stay in `AGENTS.md` instead of being repeated every session
- broad docs split into domain directories with README indexes
- active intent stays isolated in `docs/plan`
- completed work stays available in `docs/archive` but is not loaded indiscriminately
- agents can follow indexes and select relevant memory instead of reading everything
- Pi, Claude Code, and Codex share the same vocabulary and directory contract

This is why the structure becomes more valuable in larger projects: the amount of possible context grows, but the agent still has a predictable way to narrow it to the context needed for the current task.

## Actual Token Usage

Token usage is an empirical question, not a universal promise.

dotdotgod may add a small fixed overhead because loaders and workflow instructions tell agents how to read project memory. That overhead is intentional if it helps the agent avoid repeated explanations, stale context, and broad indiscriminate scanning.

The expected benefit is not always fewer total tokens in every turn. The more important goal is higher useful-context density: more of the context the agent sees should be relevant to current decisions, constraints, verification, and next steps.

In long or complex work, curated memory can reduce wasted context by replacing repeated user explanation and raw conversation history with stable docs, active plans, targeted archive lookup, and planning-focused compaction. In small tasks, the overhead may be more visible than the savings.

Actual token usage depends on:

- project docs size
- archive size
- task complexity
- model and context window
- agent behavior
- whether the task needs historical archive lookup
- whether Plan Mode compaction is triggered

Use [`MEASUREMENT_DESIGN.md`](MEASUREMENT_DESIGN.md) to measure token usage, useful-context density, compaction effects, and task outcomes before making numeric claims. For local debugging, run `pnpm run measure:context` or enable Pi with `--dd-context-debug` to record runtime context events under ignored archive reports.
