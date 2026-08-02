# How dotdotgod Keeps a Documentation Table of Contents Current

dotdotgod does not create a documentation table of contents once and leave it behind. It combines initialization, README indexes, automated validation, traceability, impact analysis, and archiving with the normal development workflow. The navigation structure can therefore stay current as documents are added, moved, split, and completed.

**Language:** [한국어 원문](README.md)

**Published:** [DEV Community](https://dev.to/dotdotgod/how-dotdotgod-keeps-a-documentation-table-of-contents-current-l0i)

The previous article described project directories and filenames as a book-like table of contents for AI agents. That structure can still decay as a project grows: new documents disappear from README indexes, links keep pointing to old paths, and completed plans remain mixed with active work.

dotdotgod treats documentation structure as more than a recommendation. It puts a maintenance mechanism at every stage where a document is created, changed, or completed.

## Create the Initial Index, Then Expand It with the Project

dotdotgod creates a baseline documentation structure during project initialization.

```text
AGENTS.md
CLAUDE.md
CODEX.md
docs/
├── README.md
├── spec/
│   └── README.md
├── arch/
│   └── README.md
├── test/
│   └── README.md
├── plan/
│   └── README.md
└── archive/
    └── README.md
```

These are not empty directories. Each README explains the area's role and the rules for placing documents there. The project starts with the major parts of the book and their initial table of contents before individual chapters are written.

Different agents use the same structure. `AGENTS.md` provides shared working rules, while `CLAUDE.md` and `CODEX.md` are thin entry points into those rules. Documentation discovery starts at `docs/README.md`, so Pi, Claude Code, and Codex can share paths and terminology instead of creating separate documentation systems.

dotdotgod does not list every document in one enormous index. Each directory's `README.md` acts as the local table of contents for that area.

```text
docs/README.md
    ↓
docs/spec/README.md
    ↓
docs/spec/cli/README.md
    ↓
docs/spec/cli/QUERY.md
```

Each README records important documents, child directories, status, and a one-line purpose. Adding, renaming, splitting, or archiving a document also requires updating the nearest README in the same change. A README is therefore not just an introduction; it is an active routing table.

A small subject begins as one focused document.

```text
docs/spec/PAYMENT.md
```

When the domain grows, it can be promoted into a directory with its own README and supporting documents.

```text
docs/spec/payment/
├── README.md
├── LIST_API.md
├── SUMMARY_API.md
└── REFUND_POLICY.md
```

This keeps one index from becoming too long and prevents one large document from accumulating unrelated responsibilities. As documentation grows, the navigation hierarchy grows with it.

After extending the structure, a project can configure the memory role of each path. `dotdotgod config .` shows the resolved policy, and `dotdotgod config init .` writes the built-in defaults to `dotdotgod.config.json` for editing.

```json
{
  "memory": {
    "areas": [
      { "id": "decision", "label": "Decisions", "paths": ["docs/decision/**"], "scope": "shared", "freshness": "fresh", "role": "decision-record", "priority": 70, "includeBodiesByDefault": true }
    ]
  }
}
```

A project can register additional paths, change the paths and priorities of the default `spec`, `architecture`, and `test` areas, or remove areas it does not need. This configuration does not create or delete files. It classifies existing documents by memory role and scope. The [Memory Area Config specification](../../spec/MEMORY_AREA_CONFIG.md) defines the fields and priority rules.

## Validate Names and Structure Automatically

Documentation rules do not survive for long when they depend only on author discipline. The dotdotgod CLI checks whether project documentation follows the configured structure.

```bash
dotdotgod validate . \
  --include-local-memory \
  --check-index
```

Validation checks whether:

- required baseline documents and README indexes exist;
- Markdown links and structured traceability data are valid;
- document names, paths, and sizes follow project rules; and
- the index matches the current files.

Document size is also part of maintaining the table of contents. The default limit for one Markdown file is 200 lines and 10,000 characters. Exceeding either limit reports `FILE_TOO_LONG` or `FILE_TOO_LARGE`. Instead of extending one document indefinitely, split it by subject and update the nearest README index.

Projects can adjust size limits and excluded paths in `dotdotgod.config.json`.

```json
{
  "validation": {
    "markdown": {
      "maxLines": 200,
      "maxChars": 10000,
      "exclude": ["docs/archive/README.md"]
    }
  }
}
```

Exclusions should remain narrow and cover only files that are difficult to split, such as intentionally large indexes or generated documents. One-off validation can override the limits with `--max-lines` and `--max-chars`. Generated traceability-link sections and `json dotdotgod` blocks are excluded from size measurement so generated metadata does not distort the document's body size.

This resembles proofreading a book before publication: check its table of contents, cross-references, and missing pages. Automated validation finds missing or oversized entries before the navigation structure collapses.

## Connect Specs, Implementation, and Tests

Even a well-structured index loses trust when its documents drift away from the code. dotdotgod can record structured traceability on important behavior specifications, connecting them to implementation files, tests, related documents, and verification commands.

For example, after changing a CLI implementation, `graph impact` can identify the specs and tests that deserve review.

```bash
dotdotgod graph impact . --changed <path>
```

The graph and index do not replace the source documents. The follow-up article [How to Find the Documents That Belong in a Change Review](../how-graph-impact-finds-related-docs/README.md) explains how changed files lead to related documents and how those results are ranked.

## Separate Current Plans from Historical Records

As documentation ages, the distinction between current and historical information becomes more important. Active work lives at:

```text
docs/plan/<task-slug>/README.md
```

A plan records its goal, scope, target files, risks, implementation sequence, verification, and current status. When the work is complete, the plan moves to:

```text
docs/archive/plan/<task-slug>/
```

`docs/archive/README.md` remains the historical index for completed work. The history is preserved without mixing it into the current work queue.

Agents do not load every archive body by default. They inspect the historical index first and open a specific record only when a past decision is relevant. Archiving preserves history while removing completed work from the active table of contents.

## The Table of Contents Is Maintained by the Workflow

dotdotgod creates the baseline index through initialization and shared agent rules, then uses each README as a local index. As documentation grows, domains are promoted into directories. Validation and impact analysis check links and traceability, while the plan lifecycle separates current intent from historical records. Load can then use the maintained index as a project-memory map for selective reading.

A documentation system does not stay useful because its initial structure was tidy. Every operation that adds, changes, splits, or completes a document also needs a rule for updating the table of contents.

dotdotgod is not trying to maintain a pile of Markdown files. It maintains a **living project-memory system** that people and multiple AI agents can read, change, and verify in the same way.

## Further Reading

- [AI Agent Memory Starts with a Documentation Table of Contents](../document-directory-as-table-of-contents/ENGLISH.md)
- [How Load Keeps AI Context Fresh Without Reading Every Document](../how-load-keeps-ai-context-fresh/README.md)
- [How to Find the Documents That Belong in a Change Review](../how-graph-impact-finds-related-docs/README.md)
- [Load Project specification](../../spec/LOAD_PROJECT.md)
- [Markdown validation configuration](../../spec/VALIDATION_CONFIG.md)
- [Graph impact command specification](../../spec/cli/GRAPH_IMPACT.md)
- [Impact ranking architecture](../../arch/IMPACT_RANKING_CONFIG.md)
- [Documentation structure architecture](../../arch/DOCS_STRUCTURE.md)
