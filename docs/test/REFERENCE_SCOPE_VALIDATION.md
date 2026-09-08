# Reference Scope Validation Tests

## Automated Coverage

`packages/cli/test/reference-scope.test.mjs` exercises the focused reference extractor, scope resolver, and real CLI:

- Concrete inline-code file references fail; directory, glob, placeholder, command, and fenced examples do not.
- Actual links into local directories still fail.
- Inline links, images, reference-style links, angle destinations, titles, escaped delimiters, and balanced parentheses retain source line numbers.
- A code-formatted link label does not produce a duplicate diagnostic.
- Generated traceability regions, canonical JSON, comments, and external URLs do not enter the new pass.
- Shared/local source-target combinations, unclassified sources, custom area paths, precedence, exclusions, and directory boundaries follow resolved configuration.
- Missing targets, fragments, URL-encoded destinations, and explicit relative paths do not bypass scope checks.
- Both local-memory scan modes and `--no-link-check` retain shared-source scope errors.
- Local-source missing links and broken anchors still fail under existing rules.
- Existing traceability rejects local targets from local sources and nested contracts.

## Commands

Run from the CLI package directory:

```bash
node --test test/reference-scope.test.mjs test/core.test.mjs test/e2e.test.mjs
```

After source changes, review graph impact, regenerate adapter runtimes with `pnpm run generate`, and run `pnpm run verify`. Refresh the graph index before validating docs with `--check-index` when fingerprints changed.

## Review Checklist

Check shared-document migrations for retained meaning, not just passing validation. Archive map discovery and default body exclusion must remain unchanged. Do not turn concrete local evidence into misleading wildcard references merely to suppress errors.
