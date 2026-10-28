# dotdotgod Traceability

Explore exported project traceability in Obsidian's native global graph, with
relationship colors, weighted lines, relation filters, document-group colors,
and compact hover paths. English and Korean controls follow the app language.

## Requirements

- Desktop Obsidian 1.14.5 or later; tested on 1.14.5 only.
- Enable the core Graph view plugin.
- Use the project folder as the vault, or copy the exported graph **and its
  referenced files**, preserving relative paths, into a vault.
- Export requires Node.js 22+ and the dotdotgod CLI. The installed plugin itself
  needs neither a Node.js installation nor a running CLI/server.

## Install

The plugin is not yet approved for the community directory. Download
`dotdotgod-traceability-0.7.0.zip` from the
[0.7.0 release](https://github.com/dotdotgod/dotdotgod-kit/releases/tag/0.7.0).
Extract its `dotdotgod-traceability` folder into
`<vault>/.obsidian/plugins/`, reload Obsidian, and enable **dotdotgod
Traceability** in Community plugins. The folder must contain `main.js`,
`manifest.json`, and `styles.css`. Never replace your vault's `.obsidian` folder.

## Use

In the project/vault directory, run:

```bash
npx @dotdotgod/cli@0.7.0 graph export .
```

This resolves default/project configuration, refreshes the index, and writes
`.dotdotgod/traceability.json`. Only configured relations between existing shared
files are exported; local plan/archive memory is omitted. Paths are relative and
the payload omits the absolute project root.

Open the global **Graph view**. The plugin's collapsible section provides:

- **Documents only**: keep Markdown endpoints only.
- **Show color legend**: show relation toggles and document-group keys.
- **Weight-based line width**: draw configured relative weights.
- **Reload traceability**: reread the export, not rerun the CLI.

Click relation legend buttons to filter. Non-Markdown node clicks reveal the
file in the OS file browser rather than executing it. Markdown clicks use the
native graph action. Changes do not rewrite notes or source files.

After project changes, rerun export, then invoke **Reload traceability** from
the command palette or graph section. In plugin settings, **Graph data file**
accepts a JSON path inside the vault; **Reload** saves and applies it.
The default path needs no configuration. A missing export shows a notice but
leaves settings available. Failed reloads keep the last successful graph.

## Compatibility And Privacy

**This plugin uses undocumented native graph renderer APIs.** Obsidian updates
may break it. Unsupported renderer shapes are rejected with a notice; disable
the plugin to restore the native graph. Unload removes owned controls, handlers,
and styling. Test upgrades in a backed-up vault. Community acceptance is not
guaranteed.

Native search/tag/color filters are **not guaranteed to apply to injected
traceability endpoints**. Unrelated native nodes remain. This changes global
graphs, not local graphs. No edge labels or force-layout controls are added.
Graph selection remains native and pointer-driven; keyboard node navigation
and mobile support are not provided.

The plugin makes **no network requests**, uses no telemetry, needs no account or
payment, and does not install/update dependencies. It reads the selected JSON
and resolves files through the vault API. Non-Markdown reveal passes a vault
file path to the OS; it does not read external file contents or execute files.
Settings are saved in vault-local plugin `data.json`. The separate `npx` install
may contact npm; graph export itself is local.

## Development And License

Source: `src/`; shared graph policy/colors: `../cli/src/graph-view/`.
From the repository root, run `pnpm install` and
`pnpm --filter @dotdotgod/obsidian run verify`. Output is ignored under
`packages/obsidian/dist/`. See the
[submission checklist](../../docs/report/OBSIDIAN_COMMUNITY_SUBMISSION.md).

Licensed under [Elastic License 2.0](../../LICENSE), not MIT. This is original
project code; it incorporates no Extended Graph source. Report issues with the
Obsidian version and reproduction steps at
<https://github.com/dotdotgod/dotdotgod-kit/issues>.
