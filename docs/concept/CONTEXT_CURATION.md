# Context Curation

## Core Idea

dotdotgod is built around context curation: giving AI coding agents the project memory that matters, in a shape they can reliably use.

The primary goal is to reduce context noise and preserve decision quality. Token reduction can happen as a side effect. Agents work better when product intent, design rationale, constraints, current intent, and verification history are easy to find in durable project memory.

This makes dotdotgod useful for builders who want coding agents to help with implementation while keeping the source of truth for what should be built, why it should be built that way, and how it will be verified in durable project memory.

## Problem

AI coding agents often start work from a noisy mix of context:

- old conversation turns
- repeated command output
- scattered project rules
- stale or duplicated instructions
- half-finished plans
- product expectations hidden in issue text or chat
- architecture constraints hidden in source files
- unwritten verification standards
- verification results that disappear after the session ends

More context does not always help. If important project decisions are mixed with irrelevant history, agents may spend attention on the wrong details, re-ask solved questions, or infer rules that already exist somewhere else.

## Principle

Curated context means project memory is:

- **intentional:** each document has a clear job
- **local:** memory lives near the code it describes
- **durable:** plans and decisions survive session boundaries
- **structured:** agents know where to look for rules, specs, architecture, tests, active work, and archives
- **shared:** different agents can use the same project contract
- **reviewable:** product and engineering decisions have a place where people and agents can inspect them

This makes the useful context more available without dumping every possible detail into every turn. Coding agents can help draft and maintain the documents, but the project still keeps a stable source of truth outside the chat transcript.

## Memory Layers

### `AGENTS.md`

Canonical working rules for coding agents. This is where stable project instructions, commands, documentation conventions, and agent expectations belong.

Effect: fewer repeated explanations and less instruction drift.

### `CLAUDE.md` and `CODEX.md`

Thin agent-specific entrypoints that point back to `AGENTS.md` and keep one canonical source of truth.

Effect: different agents start from the same rules.

### `docs/spec/`

Product behavior, API contracts, and user-facing requirements.

Effect: agents can check what the project is supposed to do before changing how it works, and product intent stays reviewable across tasks.

### `docs/arch/`

Architecture decisions, module boundaries, code conventions, data flow, and integration constraints.

Effect: implementation choices are less speculative because constraints and design rationale are explicit.

### `docs/test/`

Test strategy, regression cases, coverage notes, and manual verification records.

Effect: agents can verify changes using project-specific standards.

### `docs/plan/`

Active task memory. Each task gets a focused directory such as `docs/plan/<task-slug>/README.md` with scope, target files, risks, verification, and executable steps.

Effect: current intent survives long sessions, compaction, and agent handoff.

### `docs/archive/`

Completed plans, reports, investigations, payload captures, and historical notes.

Effect: completed work becomes reusable project memory.

### Adapter packages

The Pi, Claude Code, and Codex adapters make the same memory structure usable across different agent runtimes.

Effect: project context is portable across tools.

### Optional graph index

The dotdotgod CLI can build a deterministic graph over curated project scopes. This borrows the useful lesson from Graphify-style systems: structural edges can help agents find side effects and navigation neighborhoods. dotdotgod still stays docs-first and curated-scope-first. The graph is an acceleration layer for load snapshots and impact queries, not a repo-wide memory dump or a token-saving identity.

Effect: agents can see bounded related files, docs, tests, commands, events, package resources, and communities without loading every source file or archive body.

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

Plan-first workflows separate exploration from mutation. In Pi, Plan Mode restricts source/config changes while the agent investigates and writes the plan. Execution starts from explicit steps.

### Cross-agent consistency

Claude Code, Codex, and Pi can all use the same docs scaffold and vocabulary. The agent may change, but the memory contract stays stable.

### Reusable history

Archived plans and reports explain what changed, why it changed, and how it was verified. Future tasks can reuse that history as curated context.

## How It Works in Practice

For the detailed task workflow, Plan Mode compaction behavior, docs naming rules, scale benefits, and token-usage framing, see [`CONTEXT_MECHANICS.md`](CONTEXT_MECHANICS.md).

## What dotdotgod Is Not

- It is not a replacement for clear product or architecture thinking.
- It is not primarily a token optimizer.
- It is not a vector database or automatic semantic memory system.
- It is not a Graphify clone or repo-wide indexing system by default.
- It does not make every piece of history relevant; it gives history a structure so agents can choose what to read.

## Workflow Example

1. Initialize the project scaffold with shared agent instructions and docs folders.
2. Load project memory before starting work.
3. Plan the task in `docs/plan/<task-slug>/README.md`.
4. Execute the explicit plan steps.
5. Verify the result with project-specific checks.
6. Move the completed task to `docs/archive/plan/<task-slug>/`.

The result is a loop: curated memory informs the task, the task produces a plan and verification record, and the completed work becomes future curated memory.
