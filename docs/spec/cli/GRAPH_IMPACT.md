# CLI Graph Impact

## Purpose

`dotdotgod graph impact` gives agents a bounded, structured review list for changed files before broad verification, commits, pushes, publishing, or final handoff.

## Requirements

- `dotdotgod graph impact <root>` MUST require at least one `--changed <path>` and MUST accept repeated `--changed` options.
- Repeated changed paths MUST be deduplicated by first occurrence while preserving input order, and more than 20 unique changed paths MUST fail with `TOO_MANY_CHANGED` before index refresh.
- Multi-file impact MUST use an equal-weight multi-seed Personalized PageRank. Changed files remain explicit seed context in `changed` and `changedFiles`, but MUST NOT appear in `related`, per-seed related lists, or grouped related results.
- Non-seed scores MUST use fixed weighted PPR connection `80` plus memory policy `20`, with candidate-independent internal PPR reference `0.4` exposed in ranking diagnostics.
- Direct, curated, verification/test, semantic-only, and node-type evidence MUST NOT receive separate score or ordering bonuses; relation weights influence rank only through PPR and direct reasons remain explanation-only.
- When semantic candidates are enabled, the command MUST prepare a request-local multilingual vector overlay from bounded changed-file profiles and the existing documentation-query cache.
- Vector edges MUST use built-in relation weight multiplied by cosine similarity, MUST NOT persist changed-file text or vectors, and MUST participate in candidate discovery and PPR without mutating the indexed graph.
- Model, cache, filesystem, offline, or inference failure MUST degrade to structural-only impact with semantic status `unavailable`; it MUST NOT fail the command solely because vectors are unavailable or fall back to lexical semantic edges.
- The score breakdown MUST expose `connection.ppr`, raw probability/reference, `memory.priority`, memory policy adjustments, and optional strongest direct relation evidence.
- Structured results MUST preserve legacy `changed` as the first changed path, expose all normalized paths as `changedFiles`, keep `related` as the bounded combined non-seed ranking, and include at most five non-seed related nodes per changed file in `perSeed`.
- Shared related nodes MAY repeat across `perSeed` lists, while the combined `related` ranking MUST deduplicate nodes.
- The command MAY include one output mode: `--compact`, `--json`, or `--yml`/`--yaml`.
- `--yml`/`--yaml` MUST return compact structured agent-facing output with changed files, per-seed top-five results, grouped docs, tests, files, scores, reasons, omitted counts, status metadata, and recommended actions.
- `dotdotgod graph serve <root> --changed <path>` MUST start a local-only impact explorer, accept repeated changed paths plus optional `--host` and `--port`, render changed files as dedicated root nodes, and keep those roots out of ranked related-result lists.
- The explorer MUST use D3 force simulation for layout and Sigma/WebGL for rendering, provide synchronized keyboard-accessible ranked-list selection, relation filtering, score/reason inspection, re-rooting, and a usable list fallback when WebGL is unavailable.
- The explorer graph payload MUST include only shared structural nodes reachable from retained changed-file roots. Reachability and minimum-hop depth MUST treat every allowed structural edge as undirected, while retained edges MUST preserve original direction, type, weight, and confidence.
- Explorer graph membership MUST include indexed headings, `contains_heading`, ordinary links, routes, package metadata, dependencies, resources, memory-area relationships, contracts, and configured traceability. Nodes resolved to local-memory areas, including their heading nodes, edges incident to excluded nodes, and request-local semantic edges MUST be excluded.
- The explorer MUST NOT expose graph-depth CLI options, query parameters, or controls. Changed files MUST be emphasized as context while graph distance remains independent from impact strength.
- Root-connected views MUST lay out changed-file roots first and progress outward by deterministic minimum structural hop. Heading nodes MUST remain visually subordinate to file and contract nodes, and no synthetic edges may be introduced.
- The explorer MUST offer persisted `Instant`, `By hop layer`, and `One by one` node-reveal modes. One-by-one mode MUST follow deterministic breadth-first order, automatically compress its interval to a bounded total delay, expose a skip action while running, and originate entering nodes near their nearest root. Re-rooting and relation-filter changes MUST preserve spatial continuity for surviving nodes through bounded, interruptible morph transitions. `prefers-reduced-motion` MUST resolve every mode to immediate final placement without hiding state changes.
- Explorer diagnostics MUST report retained roots, connected nodes, maximum hop depth, and shared nodes omitted because they are disconnected from every retained root. Omitted nodes MUST NOT appear in search or explorer ranked evidence.
- The explorer ranked evidence list MUST remain bounded and MUST be intersected with shared structural graph-member IDs, while standalone `graph impact` ranking and output remain unchanged.
- Unsupported graph subcommands such as `graph query` MUST print an unknown graph command error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed`, human output MUST print a usage error to stderr and exit `2` without creating or refreshing `.dotdotgod/`.
- When `graph impact` is missing `--changed --json`, JSON output MUST include `ok: false`, `command: "graph impact"`, `error.code: "MISSING_CHANGED"`, and a usage string, then exit `2`.
- The same missing argument with `--yml` MUST return structured `ok: false` YML.
- Incompatible graph impact output modes such as `--compact --json` or `--compact --yml` MUST exit `2` with `OUTPUT_MODE_CONFLICT`.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
  - [packages/cli/src/commands/graph.mjs](../../../packages/cli/src/commands/graph.mjs)
  - [packages/cli/src/impact/report.mjs](../../../packages/cli/src/impact/report.mjs)
  - [packages/cli/src/impact/scoring.mjs](../../../packages/cli/src/impact/scoring.mjs)
  - [packages/cli/src/impact/format.mjs](../../../packages/cli/src/impact/format.mjs)
  - [packages/cli/src/impact/vector-overlay.mjs](../../../packages/cli/src/impact/vector-overlay.mjs)
  - [packages/cli/src/impact/vector-profile.mjs](../../../packages/cli/src/impact/vector-profile.mjs)
  - [packages/cli/src/graph-view/payload.mjs](../../../packages/cli/src/graph-view/payload.mjs)
  - [packages/cli/src/graph-view/server.mjs](../../../packages/cli/src/graph-view/server.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
  - [docs/test/CLI_INTERFACE.md](../../test/CLI_INTERFACE.md)
  - [docs/test/IMPACT_RANKING_CONFIG.md](../../test/IMPACT_RANKING_CONFIG.md)
- Related docs:
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
  - [docs/test/README.md](../../test/README.md)
  - [packages/cli/README.md](../../../packages/cli/README.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/commands/graph.mjs","packages/cli/src/impact/report.mjs","packages/cli/src/impact/scoring.mjs","packages/cli/src/impact/format.mjs","packages/cli/src/impact/vector-overlay.mjs","packages/cli/src/impact/vector-profile.mjs","packages/cli/src/graph-view/payload.mjs","packages/cli/src/graph-view/server.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","docs/test/CLI_INTERFACE.md","docs/test/IMPACT_RANKING_CONFIG.md"],"relatedDocs":["docs/spec/IMPACT_RANKING_CONFIG.md","docs/test/README.md","packages/cli/README.md"],"designDecisions":[]}
```
