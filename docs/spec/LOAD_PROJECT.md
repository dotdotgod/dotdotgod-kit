# Load Project

## Purpose

`load-project` is a Pi extension that starts a read-only project memory loading turn.

It helps the agent inspect the project-memory-kit scaffold and summarize the current project context.

## Commands

- `/load`: load project memory for the current working directory.
- `/pmk:load`: stable namespaced alias for the same behavior.

`/pmk:load` exists because other extensions may also register `/load`. Pi resolves duplicate extension commands with suffixes, so the namespaced command provides a clearer project-memory-kit entrypoint.

## Read-Only Behavior

The command does not modify files.

It collects a lightweight snapshot of expected memory files and docs directories, then sends a read-only loader prompt to the agent.

The agent is instructed to use read-only tools such as:

- `read`
- `ls`
- `grep`
- `find`

## Baseline Files

The loader checks for these baseline files:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `README.md`
- `docs/README.md`
- `docs/spec/README.md`
- `docs/test/README.md`
- `docs/arch/README.md`
- `docs/plan/README.md`
- `docs/archive/README.md`

## Documentation Loading Rules

The loader prompt asks the agent to:

- start with `AGENTS.md`, `README.md`, and `docs/README.md` when available
- summarize product, architecture, code conventions, infrastructure/runtime dependencies, and verification context
- follow `README.md` indexes, including domain directories such as `docs/<area>/<domain>/README.md`
- follow expanded convention directories such as `docs/arch/conventions/README.md`
- list `docs/plan` and `docs/archive` first and read only relevant files
- distinguish completed plan archives under `docs/archive/plan/` from temporary reports under `docs/archive/report/`
- avoid reading every archive indiscriminately

## Response Shape

The agent should summarize:

- project summary
- key working rules
- available commands and verification methods
- documentation map
- active plans
- relevant archive notes
- open TODO/TBD items or questions to clarify

## Future Extension Points

The command is intentionally a runtime extension entrypoint. It can later grow from prompt-only loading into:

- project memory indexing
- vector search
- graph search
- `pmk_search` or related LLM-callable tools
- `/pmk:index`, `/pmk:search`, or `/pmk:status` commands
