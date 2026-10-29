# Obsidian Traceability Plugin

## Requirements

- The desktop-only plugin MUST bundle its runtime as `main.js` with root release
  metadata in `manifest.json` and `versions.json`. Release tags MUST match the
  manifest version without a `v` prefix; assets MUST include `main.js`,
  `manifest.json`, and `styles.css` when styling is bundled.
- Tagged releases MUST be built and tested by CI with artifact attestations for
  `main.js` and `styles.css`. Bundle content MUST be independent of build cwd.
  New Releases MUST attach only Obsidian-supported assets; optional manual ZIPs
  MAY be distributed separately as time-limited CI artifacts.
- `dotdotgod graph export <root> [--json]` MUST write
  `.dotdotgod/traceability.json` through temporary-file rename, using the same
  configuration and shared endpoints as the standalone graph. The payload MUST
  omit the absolute project root. Errors MUST NOT replace a prior export.
- The plugin MUST read a vault-relative JSON path, defaulting to
  `.dotdotgod/traceability.json`. Absolute paths, traversal, control characters,
  backslashes, and non-JSON paths MUST be rejected. External paths are unsupported.
- Graph version, relation identifiers, colors, finite nonnegative weights, and
  endpoint paths MUST be validated before native hooks are installed. Missing
  vault endpoints MUST be omitted.
- Missing data on first use MUST leave settings/reload available. Failed reloads
  MUST preserve the last graph. Concurrent reads MUST coalesce; pending reads
  MUST NOT bind after unload or a path change.
- The global graph MUST use shared document-only, disabled-relation,
  representative-edge, group-color, and compact-label policy. Relation toggles
  MUST persist, use `aria-pressed`, and avoid strikethrough. Group keys MUST remain
  informational. No edge labels or attraction slider are provided.
- Unrelated native nodes MUST remain. Native search/tag/color filters are not
  guaranteed to constrain injected endpoints; this MUST be disclosed. Local
  graphs and mobile are unsupported.
- Markdown clicks MUST use native actions. Non-Markdown clicks MUST reveal
  existing vault files through the OS, never execute them through associations.
- Unsupported renderer shapes MUST be rejected without notices on every poll.
  Unload MUST restore hooks and remove owned UI. Missing-data recovery MUST leave
  settings and supported renderers usable.
- The plugin MUST make no network/telemetry requests, require no account/payment,
  and never install/update dependencies. The README MUST disclose undocumented
  renderer APIs and Elastic-2.0 licensing. Community submission/approval MUST NOT
  be claimed before external confirmation.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/obsidian/src/main.cjs](../../packages/obsidian/src/main.cjs)
  - [packages/obsidian/src/renderer.cjs](../../packages/obsidian/src/renderer.cjs)
  - [packages/obsidian/src/settings.cjs](../../packages/obsidian/src/settings.cjs)
  - [packages/obsidian/src/validation.cjs](../../packages/obsidian/src/validation.cjs)
  - [packages/obsidian/scripts/build.mjs](../../packages/obsidian/scripts/build.mjs)
  - [packages/cli/src/commands/graph.mjs](../../packages/cli/src/commands/graph.mjs)
- Verified by:
  - [packages/obsidian/test/plugin.test.mjs](../../packages/obsidian/test/plugin.test.mjs)
  - [packages/cli/test/graph-export.test.mjs](../../packages/cli/test/graph-export.test.mjs)
  - [docs/test/OBSIDIAN_DEBUG.md](../test/OBSIDIAN_DEBUG.md)
- Related docs:
  - [packages/obsidian/README.md](../../packages/obsidian/README.md)
  - [docs/report/OBSIDIAN_COMMUNITY_SUBMISSION.md](../report/OBSIDIAN_COMMUNITY_SUBMISSION.md)
  - [docs/arch/IMPACT_GRAPH_EXPLORER.md](../arch/IMPACT_GRAPH_EXPLORER.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/obsidian/src/main.cjs","packages/obsidian/src/renderer.cjs","packages/obsidian/src/settings.cjs","packages/obsidian/src/validation.cjs","packages/obsidian/scripts/build.mjs","packages/cli/src/commands/graph.mjs"],"verifiedBy":["packages/obsidian/test/plugin.test.mjs","packages/cli/test/graph-export.test.mjs","docs/test/OBSIDIAN_DEBUG.md"],"relatedDocs":["packages/obsidian/README.md","docs/report/OBSIDIAN_COMMUNITY_SUBMISSION.md","docs/arch/IMPACT_GRAPH_EXPLORER.md"],"designDecisions":[]}
```
