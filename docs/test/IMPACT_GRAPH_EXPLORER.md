# Standalone Traceability Graph Tests

## Automated

From `packages/cli`:

```bash
node --test test/traceability-web.test.mjs test/impact-references.test.mjs test/e2e.test.mjs
```

Coverage includes Node/browser policy equivalence, Markdown filtering, disabled
relations, representative edge selection, graph HTTP delivery, configured
weights, removed API routes, invalid configuration, and impact CLI regressions.
Core impact tests continue to cover structural reference integrity without the
removed web payload helper.

## Real Browser

Run `node packages/cli/bin/dotdotgod.mjs graph serve .` and open its printed URL.
Chrome DevTools MCP uses an isolated browser context, not the user's profile.
Check initial Canvas rendering, fit, semantic colors, relation legend buttons,
Markdown-only filtering, all-relations-disabled emptiness, restoration, search,
selection, hover labels, pan, node drag, zoom, and resize.

On 2026-10-29 Chrome MCP verified relation toggles, Markdown-only filtering,
search/list selection, hover coordinates, wheel zoom, and pan event handling.
Node drag/release handlers and button focus were exercised programmatically.
390×844 at DPR 2 had no horizontal overflow and correct Canvas backing size;
1440×900 desktop rendering was reviewed. No console errors/warnings appeared.
These checks do not substitute for native OS clipboard permission verification
or a physical touch-device run.

The graph replacement passed CLI tests (130) and context tests (150) after
fixing exporter auto-execution in bundled runtimes. Subsequent Pi failures were
traced to inherited `DOTDOTGOD_PROJECT_ROOT` overriding fixture roots, not lost
host session IDs. The Pi adapter now pins its session root; its full verify passes
with that environment present, including a foreign-root subprocess regression.

Screenshots exposed excessive initial zoom and dense labels. Initial fit and
selection/hover-only labels were added. Test both desktop and narrow layouts;
Canvas backing size must follow CSS size times device pixel ratio.

## File List Windowing And Reload

The file list has an independent scroll viewport and 36px rows with overscan.
Only the visible window is mounted. Arrow keys and Home/End move the focus
window; labels truncate visually while full paths remain in button titles.
Search/filter changes reset list scroll, and graph selection updates mounted
row state. `traceability-web.test.mjs` covers bounded windows, HTTP/network/data
failure distinctions, invalid-config reload failure, and recovery after repair.

Chrome checks mounted 24 of 214 real items, reached the final item, and focused
item 10,000 with End while mounting only 19 rows. Repeated real reloads succeeded.
An injected HTTP 500 displayed its details, preserved the previous graph, and
recovered on retry. The originally reported generic reload error did not
reproduce; no root cause is claimed. The client now displays bounded server
diagnostics and distinguishes unavailable servers from incompatible responses.

## Full Gate Commands

`graph-layout.test.mjs` covers topology identity despite D3 edge mutation,
bounded disconnected layout under repeated simulation, fitting very large
graphs below 0.1 scale, and zoom-out camera constraints. Chrome confirmed zero
coordinate drift across five unchanged reloads and removal of file/legend
strikethrough. Cluster attraction remains internal, with no input control.

```bash
pnpm run generate
pnpm run verify
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```

Generated adapter CLI runtimes must reflect removed server code. Sigma and
Graphology dependencies/vendor routes must not remain. Do not interpret a
successful API test as proof that clipboard permissions or every host browser
configuration works; clipboard denial falls back to displaying the path.
