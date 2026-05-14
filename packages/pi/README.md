# @dotdotgod/pi

Pi adapter for dotdotgod's context curation workflow. It gives Pi a practical project-memory loop: load curated repository context, plan safely into durable docs before source changes, execute from explicit steps, and archive outcomes as future context.

## Why Install It?

- Start work with `/dd:load` instead of manually re-reading project rules and scattered docs.
- Prefer the bounded CLI `load-snapshot` map when available, then read only the docs needed for the task.
- Use `/plan` to refine current intent in `docs/plan/` before mutating source/config files.
- Track execution with explicit `[DONE:n]` markers instead of relying on transient chat memory.
- Keep completed work organized under `docs/archive/plan/` so it becomes reusable project memory.
- Share the same curated `AGENTS.md`, docs, and plan/archive conventions with Claude Code and Codex adapters.

## Install

```bash
pi install npm:@dotdotgod/pi
```

Published install/uninstall smoke has been verified for `0.1.4`:

```bash
pi install npm:@dotdotgod/pi
pi uninstall npm:@dotdotgod/pi
```

For local development:

```bash
pi install /Users/dotdot/Workspace/dotdotgod/packages/pi
```

## Included

- `project-initializer` skill: creates `AGENTS.md`, thin `CLAUDE.md`/`CODEX.md`, docs folders, and local memory ignores.
- `plan-mode` extension: read-first planning mode with restricted tools, docs/plan writes, execution tracking, tiered hidden prompts, and `/todos`.
- `load-project` extension: read-only project context loading through `/load` and `/dd:load`, using `dotdotgod load-snapshot` when available with a lightweight fallback.

## Commands

```text
/plan      Toggle safe planning mode.
/todos     Show tracked plan progress during execution.
/load      Load project memory for the current repository.
/dd:load   Stable namespaced alias for project memory loading.
```

## Compared with Graphify-Style Memory

The Pi adapter does not ask the agent to read a full graph report on every task. `/dd:load` uses a compact snapshot-first prompt, keeps archive bodies out of the default context, and relies on targeted reads when more detail is needed. Plan Mode focuses on preserving task intent and verification state rather than compressing the whole repository.

See the workspace root README for the cross-agent package map.
