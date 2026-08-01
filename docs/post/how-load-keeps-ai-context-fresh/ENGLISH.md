# How dotdotgod Load Turns a Documentation Table of Contents into a Reading Route

Docs-first project memory keeps its source material in documents that people can review. An agent still needs to select the part relevant to the current task. **The dotdotgod Load workflow creates a short reading route through the maintained documentation table of contents for the current request.**

**Language:** [한국어 원문](README.md)

**Published:** [DEV Community](https://dev.to/dotdotgod/how-dotdotgod-load-turns-a-documentation-table-of-contents-into-a-reading-route-3bi7)

The previous article separated maintained documents from derived retrieval data. This article follows the sequence Load uses to narrow the reading scope when an agent starts a session or refreshes its context.

## Check the Project Entry Points

Load begins with the primary entry points for project memory.

```text
AGENTS.md
the current agent entry point
README.md
docs/README.md
```

`AGENTS.md` provides working rules shared across agents. The repository README explains the project's purpose and usage, while `docs/README.md` is the top-level index for specs, architecture, tests, and local-memory areas.

Load also identifies the repository root and existing user changes. When the session already contains clear baseline information, it reuses that context and preserves the user's worktree changes.

These entry points provide stable starting points for the next stage of retrieval.

## Start from the Table of Contents

Running Load without arguments displays shared Markdown paths below `docs/` as a prefix-compressed tree.

```text
/load
```

The documentation map counts `docs/` as depth 1 and expands through directory depth 5. A deeper subtree is summarized with exact recursive directory and Markdown-file counts.

```text
docs/
├── spec/
│   ├── README.md
│   └── cli/
│       ├── README.md
│       └── QUERY.md
├── arch/
│   └── README.md
└── test/
    └── README.md
```

The directory structure lets an agent choose a retrieval area, and README indexes guide it to the next document. Paths expose document roles early enough to distinguish relevant areas before opening their bodies.

## Narrow the Reading Route with a Question

Free-form Load arguments become one natural-language query.

```text
/load command routing
```

When local query is available, Load runs the equivalent of:

```bash
dotdotgod query . "command routing" --limit 30 --json
```

Focused Load reduces the documentation map to depth 3 and presents at most 30 semantically related Markdown files. When several passages from one file match, the highest-ranked passage represents that file.

```text
natural-language question
  → semantically related document paths
  → path role and README context
  → relevant sections from maintained sources
```

Query results provide routes to source documents likely to matter for the question. A follow-up article explains how the embedding model, passage splitting, and vector cache produce those routes.

## Open Current Work and History When Needed

The shared documentation map and default query corpus exclude these subtrees:

```text
docs/plan/
docs/archive/
```

This default scope prioritizes current shared documentation. When an active plan matters, Load inspects the entries under `docs/plan/` and reads the relevant plan. When a past decision matters, it uses `docs/archive/README.md` as the history map and follows it to the relevant archive body. Current work and historical records enter the context through separate reading routes.

## Keep the Documentation Route Available When Search Fails

Load exposes this optional CLI discovery hint:

```text
Help: dotdotgod --help
```

The hint is available independently of CLI execution status. In environments without the CLI or shell access, the agent can continue navigating through README indexes and the documentation map.

If model download, inference, or cache access fails during a focused query, Load returns to the base documentation table of contents. Source files, maintained documents, and project configuration remain intact. Query may refresh the ignored `.dotdotgod/vectors/` cache and download the local embedding model into the user-level cache on first use.

## Good Context Comes from a Short Reading Route

Load narrows the reading scope in five steps.

1. Check the maintained project and documentation entry points.
2. Show the retrieval scope through a depth-bounded documentation map.
3. Use semantic retrieval to narrow candidate documents when a question is present.
4. Select only the plans and history relevant to the current task.
5. Read the necessary sections from the maintained sources.

The same source documents can produce a different reading route for each session and question.

> Current project context stays useful when the route from trusted sources to the documents worth reading now remains short.

## Further Reading

- [AI Agent Memory Starts with a Documentation Table of Contents](../document-directory-as-table-of-contents/ENGLISH.md)
- [How dotdotgod Keeps a Documentation Table of Contents Current](../how-dotdotgod-maintains-document-toc/ENGLISH.md)
- [The Role of Vector Search in Docs-First Project Memory](../docs-first-project-memory/ENGLISH.md)
- [How dotdotgod Query Finds Relevant Documents from a Natural-Language Question (Korean draft)](../how-query-finds-related-docs/README.md)
- [Load Project specification](../../spec/LOAD_PROJECT.md)
