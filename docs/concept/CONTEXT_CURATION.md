# Context Curation

## Core Idea

dotdotgod is built around context curation: giving AI coding agents the project memory that matters, in a shape they can reliably use.

The goal is not primarily to save tokens. Token reduction can happen as a side effect, but the real goal is to reduce context noise. Agents work better when decisions, constraints, current intent, and verification history are easy to find instead of buried in raw chat history, repeated tool output, or stale instructions.

## Problem

AI coding agents often start work from a noisy mix of context:

- old conversation turns
- repeated command output
- scattered project rules
- stale or duplicated instructions
- half-finished plans
- product expectations hidden in issue text or chat
- architecture constraints hidden in source files
- verification results that disappear after the session ends

More context does not always help. If important project decisions are mixed with irrelevant history, agents may spend attention on the wrong details, re-ask solved questions, or infer rules that already exist somewhere else.

## Principle

Curated context means project memory is:

- **intentional:** each document has a clear job
- **local:** memory lives near the code it describes
- **durable:** plans and decisions survive session boundaries
- **structured:** agents know where to look for rules, specs, architecture, tests, active work, and archives
- **shared:** different agents can use the same project contract

This makes the useful context more available without dumping every possible detail into every turn.

## Memory Layers

### `AGENTS.md`

Canonical working rules for coding agents. This is where stable project instructions, commands, documentation conventions, and agent expectations belong.

Effect: fewer repeated explanations and less instruction drift.

### `CLAUDE.md` and `CODEX.md`

Thin agent-specific entrypoints that point back to `AGENTS.md` instead of becoming separate sources of truth.

Effect: different agents start from the same rules.

### `docs/spec/`

Product behavior, API contracts, and user-facing requirements.

Effect: agents can check what the project is supposed to do before changing how it works.

### `docs/arch/`

Architecture decisions, module boundaries, code conventions, data flow, and integration constraints.

Effect: implementation choices are less speculative because constraints are explicit.

### `docs/test/`

Test strategy, regression cases, coverage notes, and manual verification records.

Effect: agents can verify changes using project-specific expectations instead of generic guesses.

### `docs/plan/`

Active task memory. Each task gets a focused directory such as `docs/plan/<task-slug>/README.md` with scope, target files, risks, verification, and executable steps.

Effect: current intent survives long sessions, compaction, and agent handoff.

### `docs/archive/`

Completed plans, reports, investigations, payload captures, and historical notes.

Effect: completed work becomes reusable project memory instead of disappearing into chat logs.

### Adapter packages

The Pi, Claude Code, and Codex adapters make the same memory structure usable across different agent runtimes.

Effect: project context is portable across tools.

## Why the Expected Effects Happen

### Less context noise

Raw conversation history contains useful decisions and irrelevant residue. dotdotgod separates durable memory from transient discussion so agents can read the files that matter for the task.

### Better continuity

An active plan in `docs/plan/` records the current goal, scope, and next steps. If a session is compacted, resumed, or handed to another agent, the task still has a stable source of intent.

### Fewer repeated explanations

Stable rules live in `AGENTS.md` and indexed docs. The user does not need to restate naming conventions, verification commands, archive rules, or planning expectations every session.

### Less speculative work

Specs, architecture docs, and test docs give agents project-local truth before implementation. That reduces guessing about what behavior is intended or which constraints matter.

### Safer execution

Plan-first workflows separate exploration from mutation. In Pi, Plan Mode restricts source/config changes while the agent investigates and writes the plan. Execution starts from explicit steps rather than ad-hoc edits.

### Cross-agent consistency

Claude Code, Codex, and Pi can all use the same docs scaffold and vocabulary. The agent may change, but the memory contract stays stable.

### Reusable history

Archived plans and reports explain what changed, why it changed, and how it was verified. Future tasks can reuse that history as curated context.

## How It Works in Practice

For the detailed task workflow, Plan Mode compaction behavior, docs naming rules, scale benefits, and token-usage framing, see [`CONTEXT_MECHANICS.md`](CONTEXT_MECHANICS.md).

## What dotdotgod Is Not

- It is not a replacement for clear product or architecture docs.
- It is not primarily a token optimizer.
- It is not a vector database or automatic semantic memory system.
- It does not make every piece of history relevant; it gives history a structure so agents can choose what to read.

## Workflow Example

1. Initialize the project scaffold with shared agent instructions and docs folders.
2. Load project memory before starting work.
3. Plan the task in `docs/plan/<task-slug>/README.md`.
4. Execute the explicit plan steps.
5. Verify the result with project-specific checks.
6. Move the completed task to `docs/archive/plan/<task-slug>/`.

The result is a loop: curated memory informs the task, the task produces a plan and verification record, and the completed work becomes future curated memory.
