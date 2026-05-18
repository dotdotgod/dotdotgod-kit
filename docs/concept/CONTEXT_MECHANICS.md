# Context Mechanics

## How dotdotgod Works During a Task

A typical dotdotgod workflow is a loop that turns current work into future project memory:

```text
Initialize docs scaffold
        ↓
Load bounded project memory
        ↓
Resolve refs / inspect graph impact
        ↓
Plan in docs/plan
        ↓
Execute + verify
        ↓
Archive completed plan
        ↓
Future tasks reuse archived memory
```

1. **Initialize the memory surface.** `dotdotgod init` or an adapter initializer creates `AGENTS.md`, thin agent entrypoints, docs indexes, and the `docs/spec`, `docs/arch`, `docs/test`, `docs/plan`, and `docs/archive` areas. Those files are the source of truth; the graph cache is derived from them.
2. **Load curated project memory when needed.** `/dd:load`, `dd:load`, or `dotdotgod load-snapshot` gives the agent bounded metadata: cache freshness, memory areas, graph size, communities, and archive policy. The agent then reads only relevant rules, indexes, specs, architecture docs, tests, or active plans.
3. **Resolve references and inspect impact.** `dotdotgod expand` resolves explicit `[[...]]` references, `expand --fuzzy` can resolve high-signal natural prompts, and `graph impact --changed <path>` surfaces related specs, tests, architecture, and source before broad scanning.
4. **Plan in a durable file.** Current task intent is written to `docs/plan/<task-slug>/README.md` with scope, target files, risks, verification, and executable steps.
5. **Keep planning separate from mutation.** In Pi, Plan Mode allows exploration and plan-file edits while blocking source/config changes until execution mode.
6. **Compact planning context when needed.** If planning context grows large after the user has requested planning work, Plan Mode requests compaction with planning-specific instructions. If both load and compaction are needed, compaction happens first and curated project memory follows.
7. **Execute explicit steps and verify.** Execution starts from the written plan, completed steps are marked with `[DONE:n]`, and verification follows project docs.
8. **Archive the outcome.** Completed plans move to `docs/archive/plan/<task-slug>/`, leaving `docs/archive/README.md` as the history map for future targeted lookup.

This workflow does not require every agent to remember every previous conversation. It gives agents stable places to find current intent, project rules, constraints, verification history, and completed decisions. Plan Mode shapes context in two directions after the user sends a planning request: load missing curated memory or compact noisy planning history before the agent writes or refines the plan.

## How Plan Mode Compaction Helps Agents

Plan Mode compaction is designed to preserve task-shaped context while shortening the conversation.

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

`README.md` files act as local tables of contents. They turn directories into navigable maps so agents can choose relevant files.

Naming rules also matter:

- kebab-case directories make task and domain slugs stable, easy to type, and easy to reference in prompts and commands.
- UPPER_SNAKE_CASE markdown files distinguish durable docs from casual notes and make important docs visually searchable.
- `README.md` as the only mixed-case exception gives every folder a predictable entrypoint.
- separate `spec`, `arch`, `test`, `plan`, and `archive` layers reduce ambiguity about whether a fact is a requirement, an implementation constraint, a verification note, current intent, or historical context.

`docs/plan` and `docs/archive` are ignored by git by default. That lets agents keep useful local working memory and completed-task history without forcing every private plan, temporary report, or investigation into shared repository history.

## How Documentation Is Managed

The docs tree is treated as a maintained project interface, not a loose notes folder:

- `docs/spec` is product truth and stable shared/fresh memory by default. It is also the default traceability-enforced spec path, so configured behavior specs end with `json dotdotgod` blocks that connect them to source, tests, related docs, and verification commands.
- `docs/arch` is rationale: decisions, constraints, code conventions, data flow, and integration boundaries.
- `docs/test` is verification knowledge: regression cases, smoke checks, command expectations, and manual notes.
- `docs/plan` is active local intent: one kebab-case task directory with a focused `README.md` and executable steps.
- `docs/archive` is historical local memory: completed plans and reports, with `docs/archive/README.md` kept as the visible map and archive bodies excluded by default.
- Each `README.md` is a routing table. When docs are added, moved, split, or archived, update the nearest README index in the same change so agents can find the new location.

## Why This Becomes More Useful as Projects Grow

As a project grows, unstructured context becomes harder for agents to use. More files, more decisions, more completed tasks, and more historical chat logs increase the chance that important constraints are buried under irrelevant detail.

The dotdotgod structure keeps growth manageable:

- stable rules stay in `AGENTS.md`
- broad docs split into domain directories with README indexes
- active intent stays isolated in `docs/plan`
- completed work stays available in `docs/archive` but is not loaded indiscriminately
- agents can follow indexes and select relevant memory
- optional CLI graph snapshots can surface bounded impact neighborhoods and domain communities for larger, multi-year projects
- Pi, Claude Code, and Codex share the same vocabulary and directory contract

This is why the structure becomes more valuable in larger projects: the amount of possible context grows, but the agent still has a predictable way to narrow it to the context needed for the current task.

## Actual Token Usage

Token usage is an empirical question, not a universal promise.

dotdotgod may add a small fixed overhead because loaders and workflow instructions tell agents how to read project memory. That overhead is intentional if it helps the agent avoid repeated explanations, stale context, and broad indiscriminate scanning.

The expected benefit is not always fewer total tokens in every turn. The more important goal is higher useful-context density: more of the context the agent sees should be relevant to current decisions, constraints, verification, and next steps.

In long or complex work, curated memory can reduce wasted context by replacing repeated user explanation and raw conversation history with stable docs, active plans, targeted archive lookup, planning-focused compaction, and bounded graph summaries. In small tasks, the overhead may be more visible than the savings.

Actual token usage depends on:

- project docs size
- archive size
- task complexity
- model and context window
- agent behavior
- whether the task needs historical archive lookup
- whether Plan Mode compaction is triggered

Use [`MEASUREMENT_DESIGN.md`](MEASUREMENT_DESIGN.md) to measure token usage, useful-context density, compaction effects, and task outcomes before making numeric claims. For local debugging, run `pnpm run measure:context` or enable Pi with `--dd-context-debug` to record runtime context events under ignored archive reports.
