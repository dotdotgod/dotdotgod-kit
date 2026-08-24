# Documentation Map Command

## Purpose

`dotdotgod map` provides one deterministic, read-only documentation map for Pi, Claude Code, Codex, and other agent adapters.

## Usage

```bash
dotdotgod map <root> [--depth <positive-integer>] [--json]
```

`<root>` defaults to `.` when omitted. The default depth is `5`; focused Load workflows use depth `3`.

## Discovery

The command resolves `documentation.root` and `load.documentationSummary.exclude` through the existing project config policy. It discovers Markdown files below the configured documentation root, applies exclusions before output, uses repository-relative POSIX paths, and sorts paths lexically.

Secret-like paths, excluded local-memory subtrees, hidden directories, dependency directories, build output, coverage output, Git metadata, and `.dotdotgod` derived state MUST NOT appear.

A missing configured documentation root is a successful empty map. Its `paths` is empty and its tree is:

```text
- <documentationRoot>/: missing
```

## Tree Rendering

The configured documentation root counts as depth `1`. At the requested boundary the command lists all directly contained Markdown files and every immediate child directory. Each child directory receives its own exact recursive directory and Markdown-file count; the command does not silently truncate items or combine children into an anonymous summary.

Human success output contains only the rendered tree on stdout.

## JSON Contract

Success returns exactly one JSON value on stdout:

```json
{
  "ok": true,
  "root": "/absolute/project/root",
  "documentationRoot": "docs",
  "depth": 3,
  "exclude": ["docs/plan", "docs/archive"],
  "paths": ["docs/README.md"],
  "tree": "docs/\n  - README.md"
}
```

Handled JSON failures return:

```json
{"ok":false,"error":{"code":"INVALID_DEPTH","message":"..."}}
```

## Errors

`--depth` accepts only a base-10 positive integer. Missing values, zero, negatives, fractions, and non-numeric values fail with `INVALID_DEPTH` and exit code `2`.

An unreadable or nonexistent project root fails with `ROOT_NOT_FOUND` and exit code `2`. Human failures write a concise diagnostic to stderr. JSON failures write exactly one JSON value to stdout.

## Side Effects

The command does not modify maintained files, build or refresh query/vector/graph indexes, or create `.dotdotgod` state.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/memory/documentation-map.mjs](../../../packages/cli/src/memory/documentation-map.mjs)
  - [packages/cli/src/commands/map.mjs](../../../packages/cli/src/commands/map.mjs)
  - [packages/cli/src/core.mjs](../../../packages/cli/src/core.mjs)
- Verified by:
  - [packages/cli/test/core.test.mjs](../../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../../packages/cli/test/e2e.test.mjs)
- Related docs:
  - [docs/spec/LOAD_PROJECT.md](../LOAD_PROJECT.md)
  - [docs/test/CLI_MAP.md](../../test/CLI_MAP.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../../arch/CROSS_AGENT_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/memory/documentation-map.mjs","packages/cli/src/commands/map.mjs","packages/cli/src/core.mjs"],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs"],"relatedDocs":["docs/spec/LOAD_PROJECT.md","docs/test/CLI_MAP.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}
```
