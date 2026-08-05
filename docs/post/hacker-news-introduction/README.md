# Show HN: dotdotgod – Project memory that traces changed files back to what must be reviewed

Hi HN,

I built **dotdotgod**, an open-source project-memory kit for AI coding agents.

https://github.com/dotdotgod/dotdotgod-kit

Repository search, document embeddings, and code graphs are already common ways to help agents navigate a codebase. Dotdotgod started with the problem that comes next:

> After changing a file, which specs, architecture decisions, tests, verification commands, and neighboring source files should be reviewed?

I wanted to give a project a kind of **psychometry**. If psychometry means touching an object and reading the memories attached to it, `graph impact` means starting from a changed file and recovering the project memory connected to it.

```bash
npx @dotdotgod/cli graph impact . \
  --changed packages/cli/src/core.mjs \
  --compact
```

It returns a bounded list of related items to review:

```text
docs:
- docs/spec/REFERENCE_EXPANSION.md
- docs/test/REFERENCE_EXPANSION.md
- docs/spec/LOAD_PROJECT.md

tests:
- packages/cli/test/core.test.mjs
- packages/cli/test/e2e.test.mjs

files:
- packages/cli/src/core.mjs
- packages/pi/extensions/plan-mode/index.ts
```

Each item also includes reasons such as `implemented_by`, `verified_by`, `related_doc`, or semantic similarity.

Dotdotgod began with the idea that a project should first be easy for its human contributors to understand and manage. Human-readable documents remain the source of project memory, and the areas built from those documents are connected explicitly.

For example, a behavior spec can point to the source that implements it, the tests that verify it, related documents, and verification commands. This traceability creates a path from a document to the area of the project shaped by it. After the work is done, `graph impact` follows that path in reverse from the changed files.

```text
Before work:
goal or request → relevant project memory

After work:
changed files → related docs, tests, commands, and source
```

This reflects two ways we recall information. We remember what we need according to a future goal, and we also recall relevant knowledge in response to something that has already happened or that we have just encountered. Dotdotgod applies both directions to project work.

Vector search finds documents that are semantically close to a question. A graph represents relationships between documents and source code. Dotdotgod uses both, while focusing on the path from an actual change back to the review scope that change may require.

The graph is derived from explicit traceability, Markdown links, README navigation, package structure, and source and test metadata. Derived graph and vector caches stay local under `.dotdotgod/`; the maintained documents and source files remain the evidence people and agents inspect.

Dotdotgod also provides:

- a docs-first project-memory scaffold;
- bounded documentation loading with local semantic routing;
- durable plans and archives across sessions;
- validation for documentation structure, links, and traceability; and
- adapters for Pi, Claude Code, and Codex.

To try the CLI:

```bash
npx @dotdotgod/cli init .
npx @dotdotgod/cli validate .
npx @dotdotgod/cli graph impact . --changed <path> --compact
```
