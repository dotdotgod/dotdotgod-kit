# Load Project Memory

## Purpose

The Load workflow gives an agent narrative project context from maintained repository files without modifying source, documentation, or project config.

## Commands

Pi provides:

- `/load`: compatibility full load
- `/dd:load`: namespaced full load
- `/dd:load:compact`: compact refresh

Claude Code and Codex provide generated Load commands or skills from `packages/shared/workflows/load.md`.

## CLI Discovery

Full and compact Load expose exactly this optional discovery hint:

```text
Help: dotdotgod --help
```

Load does not report CLI installation status, probe installation solely for this hint, or require Help execution. If the CLI or shell execution is unavailable, documentation-map and README routing continue normally.

## Baseline Memory

Load detects the repository root, dirty worktree state, and baseline memory files:

- `AGENTS.md`
- the current agent entrypoint
- `README.md`
- `docs/README.md`

Agents preserve existing user changes and avoid rereading baseline content already clear in the session.

## Documentation Map

Load discovers Markdown files below `docs/` and renders repository-relative paths as a prefix-compressed tree. Directory depth counts `docs/` as depth 1, `docs/spec/` as depth 2, and `docs/spec/plan-mode/` as depth 3.

`load.documentationSummary.exclude` filters complete subtrees from this shared map. Its default values are:

- `docs/plan`
- `docs/archive`

Without arguments, Load expands the tree through directory depth 5. At that boundary it replaces deeper descendants with exact recursive directory and Markdown-file counts. It does not silently truncate by directory or item count.

Load lists paths but reads bodies selectively through maintained README indexes and current-task evidence.

## Focused Query

Free-form Load arguments are query text, not mode switches. When arguments are present, Load:

1. runs `dotdotgod query <root> "<arguments>" --limit 30 --json` when available
2. presents the best-ranked chunk from each of at most 30 distinct Markdown files
3. renders the documentation map through directory depth 3
4. falls back to README routing and targeted reads when query is unavailable

The query command searches shared documentation and excludes plan/archive bodies by default. Each result includes a path, heading, score, and bounded excerpt.

## Local Memory

Local memory is not part of the shared documentation map:

- list and read `docs/plan` only when current work makes an active plan relevant
- use `docs/archive/README.md` as the history map
- read an archive body only when necessary historical context is directly relevant

## Output

Full Load reports:

- project narrative and purpose
- key working rules
- relevant documentation and verification routes
- relevant active plans or archive history when needed
- questions surfaced by loaded material

Compact Load reports:

- compact project-memory status
- relevant documentation routes
- relevant active plan hints when needed
- bounded next reads

Neither mode reports graph size, cache metrics, communities, or index statistics as project narrative.

## Safety

Load and query do not modify source, docs, or project config. Query may create or incrementally refresh ignored `.dotdotgod/vectors/` files and may download the configured local embedding model into the user model cache on first use. Secret-like paths and excluded local-memory bodies must not be embedded. The Help hint is guidance only, so unavailable CLI or shell execution does not block Load.

## Traceability

<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/load-project/index.ts](../../packages/pi/extensions/load-project/index.ts)
  - [packages/pi/extensions/load-project/prompt.ts](../../packages/pi/extensions/load-project/prompt.ts)
  - [packages/pi/extensions/load-project/snapshot.ts](../../packages/pi/extensions/load-project/snapshot.ts)
  - [packages/cli/src/commands/query.mjs](../../packages/cli/src/commands/query.mjs)
  - [packages/shared/workflows/load.md](../../packages/shared/workflows/load.md)
- Verified by:
  - [packages/pi/test/load-project-utils.test.ts](../../packages/pi/test/load-project-utils.test.ts)
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/cli/QUERY.md](cli/QUERY.md)
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)
- Verification commands:
  - `pnpm --filter @dotdotgod/pi test`
  - `pnpm --filter @dotdotgod/cli test`
  - `node packages/cli/bin/dotdotgod.mjs query . "Load project memory" --limit 5 --json`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/load-project/index.ts","packages/pi/extensions/load-project/prompt.ts","packages/pi/extensions/load-project/snapshot.ts","packages/cli/src/commands/query.mjs","packages/shared/workflows/load.md"],"verifiedBy":["packages/pi/test/load-project-utils.test.ts","packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/cli/QUERY.md","docs/arch/EXTENSION_ARCHITECTURE.md"],"verificationCommands":["pnpm --filter @dotdotgod/pi test","pnpm --filter @dotdotgod/cli test","node packages/cli/bin/dotdotgod.mjs query . \"Load project memory\" --limit 5 --json"]}
```
