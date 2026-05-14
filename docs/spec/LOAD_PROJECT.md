# Load Project

## Purpose

`load-project` is a Pi extension that starts a read-only project memory loading turn.

It helps the agent inspect the dotdotgod scaffold and summarize the current project context.

## Commands

- `/load`: load project memory for the current working directory.
- `/dd:load`: stable namespaced alias for the same behavior.

`/dd:load` exists because other extensions may also register `/load`. Pi resolves duplicate extension commands with suffixes, so the namespaced command provides a clearer dotdotgod entrypoint.

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
- list `docs/plan` first and read only relevant active plan files
- exclude `docs/archive` from the documentation directory summary
- use `docs/archive/README.md` or targeted archive paths only when the user request or current task makes completed plans/reports relevant
- distinguish completed plan archives under `docs/archive/plan/` from temporary reports under `docs/archive/report/` when archive lookup is needed

## Debug Measurement

When the Pi adapter is started with `--dd-context-debug`, `/load` and `/dd:load` record local JSONL measurement events before and after sending the load prompt.

The event includes prompt character/word/approx-token counts, context usage when available, git state, and the docs directories included in the default summary. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

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
- `dd_search` or related LLM-callable tools
- `/dd:index`, `/dd:search`, or `/dd:status` commands
