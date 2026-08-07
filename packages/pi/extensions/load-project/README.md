# Load Project Extension

Pi extension that starts a project-memory loading turn for the current working directory.

See `docs/spec/LOAD_PROJECT.md` for behavior and `docs/arch/EXTENSION_ARCHITECTURE.md` for extension boundaries.

## Commands

- `/load` — compatibility full-load command with duplicate-command conflict handling.
- `/dd:load` — stable namespaced full-load command.

Both commands produce full reporting. Free-form arguments are query text and never change the mode. Compact rendering remains an internal detail of the separate global automatic project-memory loader; there is no public compact slash command. Explicit and automatic loads expose `Help: dotdotgod --help` as optional discovery guidance without reporting CLI installation status or requiring Help execution.

## Documentation Map And Query

Without arguments, Load discovers shared Markdown below `docs/` and renders a prefix-compressed tree through directory depth 5. It does not run semantic query.

With arguments, Load:

1. runs `dotdotgod query <root> "<arguments>" --limit 30 --json` when available;
2. includes the best-ranked chunk from each of at most 30 distinct Markdown files;
3. renders the documentation tree through directory depth 3;
4. falls back to README routing and targeted reads if query or shell execution is unavailable.

At a depth boundary, the map reports exact recursive omitted-directory and Markdown-file counts. `load.documentationSummary.exclude` controls both map and query corpus exclusions; defaults exclude `docs/plan/**` and `docs/archive/**` bodies. Load still treats `docs/plan/README.md` and `docs/archive/README.md` as local routing maps when available.

Focused query can refresh ignored repository cache files under `.dotdotgod/vectors/` and the runtime's user-level model cache. It does not modify source, documentation, or project config.

## Baseline Routing

The loader checks and routes through these maintained entrypoints when available:

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

The agent follows local README indexes, reads spec/test/architecture bodies selectively, inspects relevant active plans, and uses the archive README as a history map without scanning archive bodies by default.

## Notes

- `/load` may conflict with another extension, so `/dd:load` is always registered as the stable alias.
- `load.pinnedPaths` and `load.pinnedBodies` remain config compatibility fields but do not affect Load output.
- Explicit full loads and internal automatic compact loads share discovery and query behavior; only report detail differs.
