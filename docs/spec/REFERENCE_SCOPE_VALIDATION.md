# Reference Scope Validation

## Contract

Within the validator's scanned Markdown surface, ordinary references from a configured shared memory area to a local memory area fail with `SHARED_LOCAL_MEMORY_REFERENCE`.

- Shared-to-shared, local-to-shared, and local-to-local ordinary references remain allowed.
- Unclassified source or target paths do not receive this scope error.
- Use the resolved memory-area configuration, including custom documentation roots, ordered matching, and exclusions. Do not hard-code local directory names.
- Classify missing targets too: a shared document must not depend on a file that exists only on another author's checkout.
- `--include-local-memory` controls scanned sources, not target classification. `--no-link-check` disables existing link/anchor checks but not scope checks. Markdown size exclusions do not exempt scope checks.
- The diagnostic includes the original line, reference kind, normalized target, both area IDs, and repair guidance.

## Reference Forms

Check inline Markdown links, image destinations, and used full, collapsed, or shortcut reference links. Resolve destinations relative to the source document, remove query/fragment for classification, and decode URL-encoded paths. Balanced destination parentheses and angle-wrapped destinations are supported.

Check standalone inline-code paths. Explicit `./` and `../` paths are source-relative; other paths are repository-relative. Bare filenames with an extension also qualify. Arbitrary command snippets and prose inside code spans are not parsed as paths.

Policy A permits inline-code layout examples:

- Paths ending with `/`, configured subtree roots, and existing directories.
- Glob patterns and paths containing placeholder delimiters, such as `<task>`.
- These exemptions do not apply to actual Markdown links into local memory.
- A concrete file path in explanatory prose is still a reference. File existence is not required, and missing extensionless paths containing a slash remain checked.

For example, a directory instruction using `docs/plan/` or a template using `docs/plan/<task>/README.md` is permitted. A link into that local area or an inline-code reference to a particular task file is not.

## Boundaries

Fenced code examples, HTML comments, external URLs, raw HTML links, and plain unquoted prose are outside this new pass. No new missing-file or anchor checks are added for inline-code paths. Filesystem normalization is lexical; this is documentation dependency validation, not symlink security enforcement.

Canonical traceability JSON and sentinel-delimited generated traceability links are excluded from the new pass. All existing traceability rules remain unchanged, including its prohibition on local targets from any source scope and in nested contracts. A heading named Traceability alone does not exempt ordinary prose.

Existing ordinary link and anchor validation remains independent. Graph extraction and indexing policy are unchanged. The archive map remains included in default retrieval; that does not make it a shared reference target.

## Repair

Replace concrete local dependencies with maintained shared evidence or remove the dependency. For layout descriptions, describe the directory and the README's role rather than requiring readers to open a particular local file. Do not reclassify local memory or hide errors with broad exemptions.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/validate/references.mjs](../../packages/cli/src/validate/references.mjs)
  - [packages/cli/src/validate/run.mjs](../../packages/cli/src/validate/run.mjs)
- Verified by:
  - [packages/cli/test/reference-scope.test.mjs](../../packages/cli/test/reference-scope.test.mjs)
  - [docs/test/REFERENCE_SCOPE_VALIDATION.md](../test/REFERENCE_SCOPE_VALIDATION.md)
- Related docs:
  - [docs/spec/MEMORY_AREA_CONFIG.md](MEMORY_AREA_CONFIG.md)
  - [docs/spec/TRACEABILITY_CONFIG.md](TRACEABILITY_CONFIG.md)
- Design decisions:
  - [docs/arch/validation/RULE_BOUNDARIES.md](../arch/validation/RULE_BOUNDARIES.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/validate/references.mjs","packages/cli/src/validate/run.mjs"],"verifiedBy":["packages/cli/test/reference-scope.test.mjs","docs/test/REFERENCE_SCOPE_VALIDATION.md"],"relatedDocs":["docs/spec/MEMORY_AREA_CONFIG.md","docs/spec/TRACEABILITY_CONFIG.md"],"designDecisions":["docs/arch/validation/RULE_BOUNDARIES.md"]}
```
