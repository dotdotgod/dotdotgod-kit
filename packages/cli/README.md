# @dotdotgod/cli

Command-line tools for dotdotgod project memory.

## Commands

```bash
dotdotgod validate .
dotdotgod status .
dotdotgod index .
```

`validate` replaces the previous standalone docs validator package. Graph indexing currently extracts a deterministic first-pass graph from Markdown headings/links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, and metric-event string literals. The cache uses `.dotdotgod/manifest.json` plus compact graph shards under `.dotdotgod/graph/` so larger long-running projects do not require one giant JSON file. `graph query` returns a bounded impact report grouped into files, docs, tests, commands, events, package resources, and symbols. `graph communities` returns deterministic bounded domain communities for load snapshots; Leiden-style community detection can replace or augment this later if direct communities prove useful.
