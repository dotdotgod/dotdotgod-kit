# Load Project Extension

Pi extension that starts a read-only project memory loading turn for the current working directory.

See the workspace behavior contract in `docs/spec/LOAD_PROJECT.md` and the extension boundary notes in `docs/arch/EXTENSION_ARCHITECTURE.md`.

## Commands

- `/load` — load current project memory.
- `/dd:load` — stable namespaced alias for command-conflict avoidance.

## Behavior

The command checks for the expected dotdotgod scaffold, then sends a read-only loader prompt to the agent.

Baseline files and directories include:

- `AGENTS.md`
- `CLAUDE.md`
- `CODEX.md`
- `README.md`
- `docs/README.md`
- `docs/spec/`
- `docs/test/`
- `docs/arch/`
- `docs/plan/`
- `docs/archive/`

The agent is instructed to:

- start with `AGENTS.md`, `README.md`, and `docs/README.md` when available
- follow local `README.md` indexes
- follow domain directories such as `docs/<area>/<domain>/README.md`
- follow expanded convention directories such as `docs/arch/conventions/README.md`
- list `docs/plan` first, then selectively read relevant active plan files
- use `docs/archive/README.md` as the archive history map and avoid scanning archive bodies by default
- distinguish completed plan archives under `docs/archive/plan/` from temporary reports under `docs/archive/report/` when targeted archive lookup is needed
- summarize project purpose, working rules, commands, docs map, architecture/code conventions, active plans, relevant archives, and TODO/TBD items

## Notes

- The command itself does not modify files.
- `/load` may conflict with other extensions, so `/dd:load` is always registered as the stable dotdotgod alias.
- Future indexing/search behavior should extend this runtime entrypoint.
