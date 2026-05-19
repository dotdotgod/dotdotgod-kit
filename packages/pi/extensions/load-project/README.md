# Load Project Extension

Pi extension that starts a read-only project memory loading turn for the current working directory.

See the workspace behavior contract in `docs/spec/LOAD_PROJECT.md` and the extension boundary notes in `docs/arch/EXTENSION_ARCHITECTURE.md`.

## Commands

- `/load` — load current project memory in full mode.
- `/dd:load` — stable namespaced alias for command-conflict avoidance.
- `/load compact` or `/dd:load compact` — request compact/delta-oriented memory for prompt-injected refreshes or already-loaded sessions.

## Behavior

The command checks for the expected dotdotgod scaffold, then sends a read-only loader prompt to the agent. Explicit manual loads default to full mode. Compact mode emphasizes deltas, routing hints, and next reads for prompt-injected refreshes or already-loaded sessions.

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
- summarize project purpose, working rules, commands, docs map, architecture/code conventions, active plans, relevant archives, and TODO/TBD items in default full mode
- summarize compact project-memory status, relevant docs map entries, active plan hints, and next recommended reads when compact mode is requested

## Notes

- The command itself does not modify files.
- `/load` may conflict with other extensions, so `/dd:load` is always registered as the stable dotdotgod alias.
- Future indexing/search behavior should extend this runtime entrypoint.
