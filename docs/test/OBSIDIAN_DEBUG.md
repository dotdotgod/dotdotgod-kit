# Obsidian Debug Environment

## Scope

The macOS development helper launches the installed Obsidian app with a separate
profile and fixture vault under ignored `.obsidian-dev/`. It does not install a
plugin or modify the user's normal vault configuration. Node 22+ is required.

## Commands

```bash
node scripts/obsidian-dev.mjs start
node scripts/obsidian-dev.mjs status
node scripts/obsidian-dev.mjs graph
node scripts/obsidian-dev.mjs screenshot
```

`start` provisions missing fixture files and launches Obsidian. Existing fixture
files are preserved; the isolated profile's vault registry is rewritten. Start
only one test instance at a time. Close its window normally when finished.
`status` inspects the live vault path, files, and global graph view count.
`graph` invokes the native global graph command. `screenshot` saves `graph.png`
under `.obsidian-dev/`.

The Chromium debugging endpoint uses a dynamically allocated localhost port.
It grants app-level access: use only with trusted local processes, and do not
expose or forward it. No CLI registration or additional dependency is required.

## Manual Acceptance

1. Confirm `status` reports `.obsidian-dev/vault`, not a personal vault.
2. Confirm both Markdown and TypeScript fixtures appear in the file inventory.
3. Open the native graph and capture a screenshot.
4. Later plugin checks must distinguish vault file discovery from actual graph
   node rendering; discovering a `.ts` file does not prove it is visible.
5. Validate injected nodes, relationship labels/colors/widths, refresh behavior,
   and unload cleanup in the real renderer before accepting graph integration.

If no Obsidian page target is available, keep or reopen the isolated test window
before retrying. An empty debugging target list does not prove graph support.

## Initial Observation

On macOS with installed Obsidian 1.14.5, the isolated app reported the expected
vault and all five fixture files. Closing the window leaves no page targets.
`start` reuses a live page or terminates only the exact isolated profile before
restarting; it waits for vault readiness and captures output in `app.log`.

## Native Graph Compatibility Probe

### Project Traceability Data

`node scripts/obsidian-probe-install.mjs` now exports the current checkout's
traceability graph into the isolated vault and installs the bundled release
plugin with vault-relative `graphPath`. Referenced fixture files are copied
without overwriting existing files. Export uses `readMemoryConfig` and `readFreshIndex`, preserving the CLI's
default/configured policy resolution and rejecting configuration errors.
Only configured traceability relations with existing, non-local file endpoints
are exported. Relation labels and weights come from the resolved configuration;
colors are assigned by configured key order. Multiple relations per directed
file pair use the highest weight, then relation-ID order, for native styling.

```bash
node scripts/obsidian-traceability-export.mjs .
node scripts/obsidian-traceability-check.mjs
```

Reload with the plugin's `Reload traceability` command after exporting again.
Refresh is explicit, not a watcher. Markdown clicks stay native; non-Markdown
clicks reveal the copied vault file in the OS browser. Native filters are not
guaranteed to constrain injected endpoints. Release use and compatibility limits
are documented in `../../packages/obsidian/README.md`.

The earlier fixed-fixture `obsidian-probe-check.mjs` assumes fixture relations
and must not be used as acceptance evidence for this project-data mode.

### Graph Panel Options

Plugin-owned UI uses Obsidian's public `getLanguage()` API: Korean (`ko`,
including regional variants) and English are supported; other locales fall
back to English. Panel headings, toggles, reload actions, legend accessibility
labels, and user-facing error notices are localized. Configured relation labels,
directory names, and file paths remain unchanged. Language changes take effect
on plugin/app reload; live locale switching is not claimed.
Run `node --test scripts/obsidian-i18n.test.cjs` for locale fallback checks.

Relationship legend entries are toggle buttons (`aria-pressed`). Disabled
relations are persisted in `disabledRelations`; their links and endpoints with
no remaining active traceability relation are omitted. Shared endpoints stay.
Native links between traceability endpoints are replaced by the active relation
set so disabled relations do not reappear as ordinary links. Unrelated native
nodes remain. Document group markers are informational, not filter buttons.

Document node fill retains its group color during hover; non-document nodes
retain their normal fill instead of native purple highlighting. Native hover
rings and neighbor dimming remain. Real-app checks covered semantic hover color
and hiding every traceability endpoint when all relation types are disabled.

The native right controls contain a collapsible `닷닷갓 추적관계` section:

- `문서만 표시`: enabled shows only `.md` nodes and relations between them;
  disabled includes all available graph file types, not every repository file.
- `색상 범례 표시`: show or hide the top relationship legend.
- `가중치로 선 두께 표시`: use configured weights; otherwise preserve native width.
- `추적관계 새로고침`: reload the exported JSON, not rebuild the project index.

The documents-only toggle defaults to disabled; the other toggles default to
enabled. Values persist in plugin `data.json`. Legacy `showFiles` values migrate
to the inverse `documentsOnly` value. Applying a setting
rebinds all open global graphs. Installation preserves existing option values.
Live checks confirmed non-Markdown removal, legend hiding, and one controls
section after reload; defaults were restored after verification.

```bash
node scripts/obsidian-probe-install.mjs
node scripts/obsidian-dev.mjs graph
node scripts/obsidian-probe-check.mjs
node scripts/obsidian-dev.mjs screenshot
```

On first use, enable community plugins in the isolated vault and load the probe:

```bash
node scripts/obsidian-dev.mjs eval '(async()=>{await app.plugins.setEnable(true);await app.plugins.loadManifests();await app.plugins.enablePlugin("dotdotgod-graph-probe");return true})()'
```

The old fixed-fixture probe observations below are historical, not acceptance
evidence for the packaged plugin. Current release code uses undocumented graph
methods, styles native links, and displays compact hover paths, not edge labels.

The real-app check passed node presence, color values, width ordering, three
data refreshes, programmatic pan/zoom, unload node restoration, label removal,
and re-enable. Screenshots confirm code nodes, continuous colored links, and
nearby labels. Pan/zoom checks validate renderer state, not automated visual
alignment assertions. Manual drag, graph close/reopen, missing files, and
cross-version compatibility remain unverified.

`eval` intentionally executes trusted JavaScript inside the isolated app; never
pass untrusted text.

## Packaged Plugin Regression Gate

The root `pnpm run build` reproduces `main.js` and `styles.css` in the repository
root for community build verification. These copies are ignored; the canonical
build output remains under `packages/obsidian/dist/`.

Plugin tests additionally compare bundle hashes from repository-root and package
working directories. `.github/workflows/obsidian-release.yml` runs workspace
verification, builds from the exact tag, attests supported assets, and verifies
their provenance. Only Obsidian-supported files are attached to new Releases;
the manual ZIP is retained as a separate Actions artifact for 90 days.

`pnpm --filter @dotdotgod/obsidian run verify` builds and tests path/schema
validation, corrupt-settings normalization, missing-export recovery, preserving
the prior graph on failure, missing files, concurrent reads, unload during IO,
unsupported renderers, and release metadata/bundle boundaries.
`packages/cli/test/graph-export.test.mjs` checks relative exports, CLI help,
successful file replacement, and retaining the prior export on config errors.

Real-app acceptance must additionally cover all relation toggles, documents-only,
legend/weight settings, repeated reload, disable/re-enable, graph close/reopen,
first-run missing export, settings save, non-Markdown reveal, and native-option
preservation. Cross-version, Windows/Linux, mobile, and full keyboard graph
navigation are not claimed. The supported version is initially 1.14.5 desktop.

Run `node scripts/obsidian-release-check.mjs` after installing the current bundle
in the isolated app. It verifies exported endpoints, all-relations filtering,
Markdown mode, legend/weight options, three reloads, missing-file recovery,
non-Markdown reveal routing (OS call intercepted), settings save, native option
preservation, unload hook/node/UI restoration, re-enable, and graph close/reopen.
This is opt-in app automation, not part of headless workspace verification.
