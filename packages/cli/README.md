# @dotdotgod/cli

Command-line tools for dotdotgod project memory.

## Commands

```bash
dotdotgod validate .
dotdotgod status .
dotdotgod index .
```

`validate` replaces the previous standalone docs validator package. Graph indexing is intentionally minimal in this milestone: it establishes cache metadata and stale-index policy before AST and Leiden-style community extraction are added.
