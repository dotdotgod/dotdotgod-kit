# How Load Keeps AI Context Focused

A coding agent does not need every project document in its first prompt. It needs a maintained map, a small set of relevant routes, and clear rules for what to read next.

Dotdotgod Load provides that first pass without turning graph statistics or repository history into prompt noise.

## Two Load Shapes

A Load without arguments builds a prefix-compressed tree of shared Markdown below `docs/`:

```text
/load
```

The map expands through directory depth 5. When a subtree is deeper, Load reports exact recursive directory and Markdown-file counts instead of truncating by an arbitrary item limit.

A focused Load treats its free-form arguments as query text:

```text
/load command routing
```

It runs the equivalent of:

```bash
dotdotgod query . "command routing" --limit 30 --json
```

The focused response includes a depth-3 documentation map and the best-ranked chunk from each of at most 30 distinct Markdown files.

## Local Multilingual Routing

`dotdotgod query` uses `Xenova/multilingual-e5-small` locally. Query text uses the E5 `query: ` prefix, indexed passages use `passage: `, and normalized 384-dimensional vectors are scanned exactly.

The repository-local derived cache is ignored by Git:

```text
.dotdotgod/vectors/
├── manifest.json
├── chunks.jsonl
└── embeddings.f32
```

Unchanged chunk fingerprints reuse vectors. Changed and new passages are embedded, deleted passages disappear on rewrite, and corrupt or incompatible cache data is rebuilt. Model assets live in the runtime's user-level cache.

This query layer is routing data, not project truth. The maintained Markdown file remains authoritative and the agent reads relevant bodies selectively after routing.

## Separate Current Work From Local History

`load.documentationSummary.exclude` controls the documentation map and vector corpus. The default excludes `docs/plan/**` and `docs/archive/**` bodies so active local work and stale history do not dominate shared-document retrieval.

Load still uses:

- `docs/plan/README.md` to locate relevant active work;
- `docs/archive/README.md` as the history map;
- targeted archive reads only when the current request needs historical context.

The deterministic relationship graph has a separate memory-area inclusion policy. Graph indexing and vector-query inclusion have aligned defaults, but changing one policy does not silently change the other.

## Read-Only Boundary

Load does not modify source, maintained documentation, or project config. A focused query may refresh ignored `.dotdotgod/vectors/` files and download model assets into the user-level cache.

If query is unavailable, Load continues with the documentation tree, README indexes, and targeted reads. A model or cache failure must not erase the basic documentation map.

## Why This Keeps Context Fresh

The workflow stays bounded because it:

1. starts from maintained project and docs entrypoints;
2. shows directory structure rather than broad document bodies;
3. expands less deeply when focused query already supplies routes;
4. returns at most one result per Markdown file;
5. excludes local-memory bodies by default;
6. asks the agent to read only the documents needed for the current request.

The result is a current, explainable route through project knowledge instead of a large generated snapshot that competes with the actual task.
