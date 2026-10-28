# Standalone Traceability Graph Architecture

## Runtime

`graph serve <root> [--host HOST] [--port PORT]` serves project traceability
without Obsidian. It rejects `--changed`; changed-file analysis remains available
through `graph impact`. The host must be loopback; port zero allocates a port.

`graph-view/traceability.mjs` resolves project configuration with defaults and
refreshes the structural index. It exports only configured traceability edges
with existing shared file endpoints. Local memory, self-links, headings as
independent nodes, and semantic overlay edges are excluded.

`GET /api/graph` rebuilds that payload, including styled file nodes and configured
relation types. The browser does not receive the absolute project root. Old
impact/reroot API routes and the root-connected structural payload are removed.

## Shared Policy

`graph-view/policy.cjs` runs unchanged in Node, the browser, and the bundled
Obsidian desktop plugin. It owns document-only filtering, disabled relation
filtering, active endpoints, and representative edges. Each directed file pair
uses the highest configured weight; relation ID resolves ties. Complete original
relations remain in the data payload.

`node-style.cjs` owns document-root grouping, stable colors, and compact hover
labels. Source paths and click identities are never rewritten by display rules.
Obsidian can additionally retain unrelated native vault nodes; the standalone
view contains only active traceability endpoints.

## Rendering

D3 computes force positions; Canvas renders circular nodes, colored directed
edges, and optional weighted widths. No Obsidian runtime, Sigma, or Graphology is
required. Relationship names live in toggleable legend controls, not on edges.
Initial layout is fitted to the plotting area; labels appear for selection and
hover instead of covering dense graphs. Hover preserves semantic node colors.

Disconnected components use bounded-distance repulsion plus fixed X/Y center
attraction. Unchanged topology refreshes update styles without restarting the
simulation or resetting the camera. No attraction slider is exposed. Fitting
uses the space outside the legend and options rail, including narrow layouts;
zoom-out limits adapt to graph bounds rather than enforcing the old 0.1 floor.
When a graph fits, zooming out constrains its bounds to the visible plotting area.
Disabled relation buttons use opacity only; no controls use strikethrough.

The right rail contains document-only, legend, weight, and reload controls plus
a searchable keyboard-accessible file list. Selection exposes the original path
for copying. Filter state is stored in browser local storage. Graph/list
selection refers to the same active file set.

## Boundaries

The server reads project data and may refresh ignored index caches; it does not
edit source documents. The browser cannot open arbitrary local files and offers
path copying instead. Refresh needs no separate export command. Obsidian's
plugin reads `.dotdotgod/traceability.json` created by `graph export`, or another
vault-relative JSON path from its settings. Its bundled source, validation,
renderer hooks, styles, tests, and release builder live in `packages/obsidian/`.
Root `manifest.json` and `versions.json` support monorepo release discovery.
The undocumented renderer boundary and native-filter limitation are explicit;
see `../spec/OBSIDIAN_PLUGIN.md` for its behavior and safety contract.

Impact ranking, reference validation, PPR, and CLI output contracts remain
independent of this renderer replacement. See `../test/IMPACT_GRAPH_EXPLORER.md`
for automated and real-browser verification evidence and limitations.
