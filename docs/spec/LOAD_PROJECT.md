# Load Project Memory

## Purpose

The Load workflow gives an agent narrative project context from maintained repository files without modifying source, documentation, or project config.

## Commands

Pi provides explicit full-load commands:

- `/load`: compatibility full load
- `/dd:load`: namespaced full load

Explicit command delivery uses an internal structural marker that the global input handler strips before model processing. It marks the active branch loaded, preventing a second compact load for the same request.

Pi activates `project_memory_load` whenever the repository is initialized and the active branch is unloaded (`!loaded`), in ordinary mode and Plan Mode. The zero-config `advisory` mode offers one line of hidden guidance (`display: false`) without forcing a load. Use the tool when project context would help and skip it for self-contained work. `mode: "always"` retains the one-time compatibility instruction to load before substantive work; `manual` and request-local `/dd:no-load`, `dd:no-load`, or `/no-load` suppress automatic guidance, not tool availability. The extension leaves the original user input and images unchanged. Optional model triage can skip, recommend a focus and shared refs, or deliver read-only prefetch; see [Decision Config](DECISION_CONFIG.md).

The compact tool calls shared MCP `project_load`; concurrent loads are guarded. Tool or map failure leaves it active. A successful compact load, successful prefetch, or explicit full Load disables the tool for that branch. The `project-memory-auto-state` v3 entry is branch-local: restore and compaction keep reachable completion, not an abandoned sibling's. Legacy v2 restore also recognizes a reachable load entry. Plan Mode does not own load triage.

Claude Code and Codex provide generated Load commands or skills from `packages/cli/assets/workflows/load.md`. The workflow prefers the shared MCP `project_load` tool so a successful load can be tracked. It falls back to `dotdotgod map`, `dotdotgod query`, and README/local tree routing when the tool or CLI is unavailable.

Hermes uses native lifecycle hooks and the registered project-load skill/tool,
with canonical map/query routing, request-local dd:no-load and conservative
restore assessment. Its delivery and gateway root-selection contract is defined
in [HERMES_ADAPTER.md](HERMES_ADAPTER.md), not Pi TUI/branch API parity.

## CLI Discovery

Explicit full Load and internal automatic compact Load expose exactly this optional discovery hint:

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

Agents preserve existing user changes and avoid rereading baseline content already clear in the active branch. Pi uses reachable branch state to track completed loads; startup `contextFiles` are not load completion.

## Documentation Map

The shared CLI `map` command discovers Markdown below the configured documentation root and renders repository-relative paths as a prefix-compressed tree for every adapter. Pi invokes `map --json` through its source/package/global CLI resolver and retains a bounded local fallback for CLI-unavailable operation. Directory depth counts `docs/` as depth 1, `docs/spec/` as depth 2, and `docs/spec/plan-mode/` as depth 3 under the default root.

Shared MCP `project_load` returns `ok: false`, `mapUnavailable.code: "MAP_UNAVAILABLE"`, an empty `documentationTree`, and `query: null` when map execution fails. It does not substitute an unconfigured `docs` tree or claim a successful empty map. Agents continue with settings-aware host file inspection and README routing.

`load.documentationSummary.exclude` filters complete subtrees from this shared map. Its default values are:

- `docs/plan`
- `docs/archive`

Without arguments, Load requests `dotdotgod map <root> --depth 5 --json` and expands the tree through directory depth 5. At that boundary it lists every directly contained Markdown file and every immediate child directory, regardless of item count. Each child directory gets its own exact recursive directory and Markdown-file count for content hidden below the boundary; Load does not combine multiple children into one anonymous summary or recursively print their contents. It does not silently truncate by directory or item count.

Load lists paths but reads bodies selectively through maintained README indexes and current-task evidence.

## Focused Query

Free-form Load arguments are query text, not mode switches. When arguments are present, Load:

1. runs `dotdotgod query <root> --limit 30 --json -- "<arguments>"` when available
2. presents up to 30 typed documentation-file or code-symbol results, preserving symbol ranges and retrieval warnings
3. runs `dotdotgod map <root> --depth 3 --json` and renders its documentation tree with the same named boundary-child summaries
4. falls back to README routing and targeted reads when query is unavailable

Query searches full shared documentation and code outlines/comments, excluding plan/archive bodies and code implementation passages. Results include path, heading, score and text; symbols add source hash and declaration/body ranges. Verify freshness before targeted implementation reads. See [cli/QUERY.md](cli/QUERY.md).

Hybrid retrieval keeps keyword results when vectors are unavailable. Shared project-load
results keep query data and expose vectorUnavailable with confirmation-gated runtime
recovery for a missing optional local runtime; queryUnavailable remains for a failed
query as a whole. No automatic runtime/model installation or code-disclosure consent
is implied by Load.

On a failed Pi query, Load surfaces the CLI's `ok: false` string `error` from stdout JSON instead of hiding it behind an exit status. Process errors take precedence; malformed, oversized (over 64 KiB), or unsupported stdout falls back to stderr, then exit status. Each candidate diagnostic is capped at 1,000 characters plus a truncation marker; arbitrary stdout and structured error objects are not dumped. CLI candidate attempts and map-only fallback remain unchanged. `packages/pi/test/load-project-query.test.ts` covers these diagnostics and successful query consumption.

## Local Memory

Local memory is not part of the shared documentation map:

- list and read `docs/plan` only when current work makes an active plan relevant
- use the README directly under `docs/archive/` as the history map
- read an archive body only when necessary historical context is directly relevant

## Output

Explicit full Load reports:

- project narrative and purpose
- key working rules
- relevant documentation and verification routes
- relevant active plans or archive history when needed
- questions surfaced by loaded material

Pi's compact Load tool reports:

- compact project-memory status
- relevant documentation routes
- relevant active plan hints when needed
- bounded next reads

The compact tool result retains the complete Load content for model consumption. In the interactive Pi TUI, the collapsed result MUST occupy at most three lines including its remaining-line count and configured `app.tools.expand` hint. The same keybinding (`Ctrl+O` by default) MUST reveal or collapse the complete output.

Neither output form reports graph size, cache metrics, communities, or index statistics as project narrative. Compact rendering belongs to the tool and has no public slash command.

## Safety

Load and `map` do not modify source, docs, project config, or derived indexes. Query may create or incrementally refresh ignored `.dotdotgod/vectors/` files and may download the configured local embedding model into the user model cache on first use. Secret-like paths and excluded local-memory bodies must not be embedded. The Help hint is guidance only, so unavailable CLI or shell execution does not block Load.

## Traceability

<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/project-memory/index.ts](../../packages/pi/extensions/project-memory/index.ts)
  - [packages/pi/extensions/project-memory/context.ts](../../packages/pi/extensions/project-memory/context.ts)
  - [packages/pi/extensions/project-memory/lifecycle.ts](../../packages/pi/extensions/project-memory/lifecycle.ts)
  - [packages/pi/extensions/load-project/index.ts](../../packages/pi/extensions/load-project/index.ts)
  - [packages/pi/extensions/load-project/prompt.ts](../../packages/pi/extensions/load-project/prompt.ts)
  - [packages/pi/extensions/load-project/snapshot.ts](../../packages/pi/extensions/load-project/snapshot.ts)
  - [packages/cli/src/commands/map.mjs](../../packages/cli/src/commands/map.mjs)
  - [packages/cli/src/memory/documentation-map.mjs](../../packages/cli/src/memory/documentation-map.mjs)
  - [packages/cli/src/commands/query.mjs](../../packages/cli/src/commands/query.mjs)
  - [packages/cli/assets/workflows/load.md](../../packages/cli/assets/workflows/load.md)
  - [packages/cli/src/context/decision.mjs](../../packages/cli/src/context/decision.mjs)
  - [packages/cli/src/context/project.mjs](../../packages/cli/src/context/project.mjs)
- Verified by:
  - [packages/pi/test/project-memory-extension.test.ts](../../packages/pi/test/project-memory-extension.test.ts)
  - [packages/pi/test/load-project-utils.test.ts](../../packages/pi/test/load-project-utils.test.ts)
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [packages/cli/test/context/decision.test.mjs](../../packages/cli/test/context/decision.test.mjs)
- Related docs:
  - [docs/spec/CROSS_AGENT_SUPPORT.md](CROSS_AGENT_SUPPORT.md)
  - [docs/spec/cli/MAP.md](cli/MAP.md)
  - [docs/spec/cli/QUERY.md](cli/QUERY.md)
  - [docs/spec/DECISION_CONFIG.md](DECISION_CONFIG.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../arch/EXTENSION_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/project-memory/index.ts","packages/pi/extensions/project-memory/context.ts","packages/pi/extensions/project-memory/lifecycle.ts","packages/pi/extensions/load-project/index.ts","packages/pi/extensions/load-project/prompt.ts","packages/pi/extensions/load-project/snapshot.ts","packages/cli/src/commands/map.mjs","packages/cli/src/memory/documentation-map.mjs","packages/cli/src/commands/query.mjs","packages/cli/assets/workflows/load.md","packages/cli/src/context/decision.mjs","packages/cli/src/context/project.mjs"],"verifiedBy":["packages/pi/test/project-memory-extension.test.ts","packages/pi/test/load-project-utils.test.ts","packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","packages/cli/test/context/decision.test.mjs"],"relatedDocs":["docs/spec/CROSS_AGENT_SUPPORT.md","docs/spec/cli/MAP.md","docs/spec/cli/QUERY.md","docs/spec/DECISION_CONFIG.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md"]}
```
