# Documentation Map Verification

## Scope

Verify the shared, read-only `dotdotgod map` contract used by all project-memory Load adapters.

## Automated Coverage

CLI unit and end-to-end tests should cover:

- omitted root defaults to the current directory;
- default depth `5` and explicit focused depth `3`;
- deterministic lexical ordering and repository-relative POSIX paths;
- every direct boundary Markdown file and named immediate child summary;
- exact recursive directory and Markdown-file counts below the boundary;
- configured `documentation.root` and `load.documentationSummary.exclude`;
- hidden, dependency, generated-state, excluded local-memory, and secret-like path filtering;
- successful missing-documentation-root output;
- stable human and JSON output;
- `INVALID_DEPTH` for missing, zero, negative, fractional, and non-numeric depth values;
- `ROOT_NOT_FOUND` for nonexistent or unreadable roots;
- absence of `.dotdotgod` writes or query/graph index refreshes.

Pi tests should use the same depth-3, depth-5, alternate-root, and missing-root fixtures to verify command/fallback parity and unchanged automatic and explicit Load prompt output.

## Smoke Commands

```bash
node packages/cli/bin/dotdotgod.mjs map .
node packages/cli/bin/dotdotgod.mjs map . --depth 3
node packages/cli/bin/dotdotgod.mjs map . --depth 3 --json
```

Expected failures exit with code `2`:

```bash
node packages/cli/bin/dotdotgod.mjs map . --depth 0
node packages/cli/bin/dotdotgod.mjs map . --depth nope --json
node packages/cli/bin/dotdotgod.mjs map ./missing-project --json
```

For JSON failures, confirm stdout contains exactly one object with `ok: false`, an error code, and a concise message. Confirm human failures use stderr.

## Adapter Checks

- Pi invokes `map --json` through its source/package/global CLI resolver and retains a bounded CLI-unavailable fallback.
- Claude Code and Codex generated Load resources invoke `map`, use depth `3` for focused Load and depth `5` otherwise, and retain README/tree fallback when CLI execution is unavailable.
- `pnpm run verify:generated` reports no generated-resource drift.



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Verified by:
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/cli/test/e2e.test.mjs](../../packages/cli/test/e2e.test.mjs)
  - [packages/pi/test/load-project-utils.test.ts](../../packages/pi/test/load-project-utils.test.ts)
- Related docs:
  - [docs/spec/cli/MAP.md](../spec/cli/MAP.md)
  - [docs/spec/LOAD_PROJECT.md](../spec/LOAD_PROJECT.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"test","implementedBy":[],"verifiedBy":["packages/cli/test/core.test.mjs","packages/cli/test/e2e.test.mjs","packages/pi/test/load-project-utils.test.ts"],"relatedDocs":["docs/spec/cli/MAP.md","docs/spec/LOAD_PROJECT.md"],"designDecisions":[]}
```
