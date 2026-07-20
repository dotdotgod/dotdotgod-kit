# AI Agent Memory Starts with a Documentation Table of Contents

Good project memory for AI agents is not a larger pile of documents. It is a **hierarchical table of contents** that helps an agent reach the right document quickly and ignore irrelevant ones. Directories identify document roles and parent topics, filenames name individual entries, and each `README.md` routes the agent to the next level. When a subject grows, a single file can be promoted into a directory with its own README and supporting documents. Paths, filenames, README indexes, and headings can therefore work like a book, letting an agent find the relevant specs, architecture, tests, and plans without reading the entire project.

**Language:** [한국어 원문](README.md)

## More Documentation Does Not Mean Better Memory

When documents are mixed in one directory or stored under names such as `NOTES.md` and `FINAL.md`, an agent cannot tell which file contains the current spec, architecture, or test strategy without opening it. When the path exposes the role, as in `docs/spec/CLI_INTERFACE.md`, `docs/arch/CLI_ARCHITECTURE.md`, and `docs/test/CLI_INTERFACE.md`, the table of contents distinguishes the spec, architecture, and tests before any body is loaded.

Good project memory does not expose everything all the time. Paths and indexes help an agent find what the current task needs and exclude documents with different roles before reading them.

## Project Documentation Is a Book

We rarely read a book from the first page to the last when looking for one answer. We inspect the table of contents and move to the relevant part and chapter. Project documentation can follow the same model.

```text
docs/
├── README.md                         # Table of contents for the whole book
├── concept/                          # Part 1: Core concepts
│   ├── README.md                     # Part 1 index
│   └── CONTEXT_CURATION.md           # Chapter: Context curation
├── spec/                             # Part 2: Product behavior
│   ├── README.md                     # Part 2 index
│   ├── PROJECT_INITIALIZER.md        # Chapter 1: Project initialization
│   └── cli/                          # Chapter 2: CLI
│       ├── README.md                 # Chapter 2 index
│       └── CONFIG_COMMAND.md         # Chapter 2, section 1: config command
├── arch/                             # Part 3: Architecture and constraints
│   ├── README.md                     # Part 3 index
│   └── DOCS_STRUCTURE.md             # Chapter: Documentation structure
└── test/                             # Part 4: Tests
    ├── README.md                     # Part 4 index
    └── CLI_INTERFACE.md              # Chapter: CLI regression tests
```

Read this structure as a route through nested indexes. `spec/` is the top-level index for product specs, and `PROJECT_INITIALIZER.md` is one entry beneath it. When the CLI subject grows, `cli/` becomes a new child index and `cli/README.md` routes readers within it. `CONFIG_COMMAND.md` is one entry in that child index. In book terms, these correspond to Part 2, Part 2 Chapter 1, Part 2 Chapter 2, and Part 2 Chapter 2 Section 1.

| Full path | Role in the table of contents | Book notation |
|---|---|---|
| `docs/README.md` | Top-level index for the whole book | Full table of contents |
| `docs/spec/README.md` | Area index for product behavior | Part 2 index |
| `docs/spec/PROJECT_INITIALIZER.md` | Project initialization entry | Part 2, Chapter 1 |
| `docs/spec/cli/README.md` | Child index for CLI documents | Part 2, Chapter 2 index |
| `docs/spec/cli/CONFIG_COMMAND.md` | config command entry | Part 2, Chapter 2, Section 1 |
| `docs/arch/DOCS_STRUCTURE.md` | Architecture of the documentation system | A chapter in Part 3 |
| `docs/test/CLI_INTERFACE.md` | Test strategy for CLI behavior | A chapter in Part 4 |

A small subject starts as one indexed file. When it grows, it becomes a directory with a `README.md` and its own child entries. The filename names the entry, while the full path is its address from the top-level index.

## Directory Names Explain Document Roles

A directory does more than group documents by topic. It tells an agent how to interpret the information inside.

- `concept/` explains mental models and core concepts.
- `spec/` defines the product's current specs.
- `arch/` explains architectural rationale, structure, and technical constraints.
- `test/` records regression tests and manual test procedures.
- `report/` preserves evidence from research and measurement.
- `plan/` records the intent of active work.
- `archive/` preserves completed work and historical context.

Consider this path:

```text
docs/spec/cli/CONFIG_COMMAND.md
```

> This document describes the CLI config command in the current product specs.

Paths change the meaning even when documents cover the same subject.

```text
docs/arch/CLI_ARCHITECTURE.md
docs/test/CLI_INTERFACE.md
docs/archive/plan/cli-refactor/README.md
```

The first explains architecture, the second explains testing, and the third records historical work. Their paths reveal role and freshness even when their bodies use similar terms.

## A Filename Is a Chapter Title

The following filenames distinguish files but do not explain their contents.

```text
DOCUMENT_1.md
NOTES_NEW.md
FINAL_V2.md
MISC.md
```

These names expose scope before the files are opened:

```text
PROJECT_INITIALIZER.md
CLI_INTERFACE.md
LOAD_SNAPSHOT.md
VALIDATION_ARCHITECTURE.md
```

A good filename works like a chapter title that is meaningful in the table of contents. Dotdotgod uses kebab-case for directories and UPPER_SNAKE_CASE for durable Markdown documents. `README.md` is the predictable entry point for every directory.

`CONFIG_COMMAND.md` is more useful than `API_1.md` because it names behavior and domain instead of writing order. Stable, specific names let people and agents use the same vocabulary when finding and referencing documents.

## README Is the Local Table of Contents

Each directory's `README.md` is a local index rather than a generic introduction.

```markdown
# Product specifications

- `CLI_INTERFACE.md`: user-facing CLI specs
- `PROJECT_INITIALIZER.md`: project initialization behavior
- `cli/`: detailed specs for individual CLI commands
- `plan-mode/`: plan mode and staged execution specs
```

An agent can read this README and choose the next document without opening every file in the directory. This is why adding, moving, or renaming a document should update the nearest README in the same change.

## Increase the Depth of the Index as Documentation Grows

Do not begin with a complex hierarchy. If a subject has one document, start with one file.

```text
docs/spec/PAYMENT.md
```

When the domain grows into multiple documents, promote it to a directory.

```text
docs/spec/payment/
├── README.md
├── LIST_API.md
├── SUMMARY_API.md
└── REFUND_POLICY.md
```

`payment/README.md` becomes the intermediate index between the spec area and its individual documents. An agent narrows the search in four steps:

1. Select a documentation area in `docs/README.md`.
2. Select a product domain in `docs/spec/README.md`.
3. Find the relevant behavior in `docs/spec/payment/README.md`.
4. Read only the necessary section of the selected document.

The amount of possible context grows with the project, but an index keeps the context required for the current task small.

## A Good Index Also Says What Not to Read

When changing the current behavior of a CLI command, inspect `docs/spec/cli/` first. Read `docs/arch/` when implementation constraints matter, `docs/test/` when regression coverage matters, and `docs/archive/` only when a historical decision is relevant.

The documentation structure answers two questions:

1. What should the agent read now?
2. What can the agent ignore for this task?

Good project memory is not a system that injects every document into every prompt. It provides a route to relevant information and a boundary that excludes irrelevant information.

## Designing Project Memory Means Designing Addresses

It is natural to begin project-memory design by asking what to store. First ask whether the information has a useful address.

- Can a path and filename reveal a document's role and contents?
- Does every directory contain an index to the next relevant document, while separating current and historical information?
- Can the table of contents expand as documentation grows without making the agent read everything?

Directories divide the book into parts, filenames name chapters, README indexes route readers, and headings narrow a document into sections.

> Designing documentation for AI is not cosmetic file organization. It is designing a table of contents that lets an agent reach the chapter required by the current question without reading the whole project.

**Next:** [How the dotdotgod kit maintains the documentation table of contents](../how-dotdotgod-maintains-document-toc/README.md) explains how the structure is initialized, validated, and kept current.
