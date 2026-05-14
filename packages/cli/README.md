# @dotdotgod/cli

Command-line tools for dotdotgod project memory.

## Commands

```bash
dotdotgod validate .
dotdotgod status .
dotdotgod index .
```

`validate` replaces the previous standalone docs validator package. Graph indexing currently extracts a deterministic first-pass graph from Markdown headings/links, package metadata/resources, TypeScript/JavaScript imports, exports, top-level declarations, Pi command registrations, inferred tests, and metric-event string literals. Leiden-style community extraction is planned next.
