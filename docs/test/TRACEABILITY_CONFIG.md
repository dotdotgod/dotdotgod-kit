# Traceability Config Verification

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Smoke Checks

- Confirm the zero-config default still requires traceability for `docs/spec/**` markdown files except README files.
- Confirm custom `traceability.required` arrays can require multiple non-spec paths, such as `docs/product/**` and `docs/requirements/**`.
- Confirm custom traceability config uses replacement semantics for the default required list.
- Confirm missing `traceability.keys` resolves to the ordered defaults `implementedBy`, `verifiedBy`, `relatedDocs`, and `designDecisions`; explicit custom/empty arrays use complete-list semantics.
- Confirm `designDecisions` renders after `relatedDocs`, validates shared durable existing paths at top level and in contracts, and creates `design_decision` graph edges with weight `3`.
- Confirm custom path and command keys render configured labels, validate target-specific arrays at top level and in contracts, and create configured graph relations/weights; an explicitly configured `verificationCommands` command key remains supported.
- Confirm duplicate/reserved keys, duplicate/reserved relations, invalid targets, non-snake-case relations, and weights outside `0..20` fail validation; weight zero keeps rendering but disables traversal.
- Confirm fields omitted from the configured complete list are rejected in top-level and contract blocks.
- Confirm scalar string path settings fail validation; all path settings must be arrays.
- Confirm invalid traceability config reports validation errors while read-only inspection can fall back to defaults.
- Confirm `traceability links --write` fails closed without changing Markdown when custom config is invalid.
- Confirm `dotdotgod traceability links <root> --check` exits non-zero when generated Markdown link sections are missing or stale.
- Confirm `dotdotgod validate` reports `TRACEABILITY_LINKS_STALE` when generated Markdown link sections or compact traceability JSON drift from the canonical parsed data, matching the focused `traceability links --check` drift gate.
- Confirm `dotdotgod traceability links <root> --write` inserts a missing sentinel-bounded link section before the canonical `json dotdotgod` block and rewrites the JSON block as compact single-line JSON.
- Confirm write mode replaces only the sentinel-bounded region when a generated section already exists.
- Confirm duplicate, incomplete, or reversed traceability-link sentinels produce validation errors and are not auto-fixed.
- Confirm generated traceability-link regions and canonical `json dotdotgod` blocks are excluded from markdown line and character budget checks.
- Confirm traceability path fields reject default and custom local-memory targets, including `docs/plan/**`, `docs/archive/**`, and custom `memory.areas[]` entries with `scope: "local"`.
- Confirm optional JSON-only `contracts[]` accepts valid minimal contracts and `contracts: []` without requiring existing specs to add contracts.
- Confirm malformed contract metadata fails validation for non-array `contracts`, non-object entries, missing or empty `id`/`title`, duplicate IDs within one file, unknown contract fields, invalid `sections`, invalid paths, local-memory targets, missing targets, and invalid commands.
- Confirm generated traceability links include concise contract ID/title/count summaries, detect stale contract summaries, and omit contract details for `contracts: []`.
- Confirm graph extraction creates stable file-scoped `contract:<spec-path>#<contract-id>` nodes, stable content-derived command IDs, and configured relation/weight metadata while preserving top-level file traceability edges.
- Confirm graph impact JSON/YML includes contract identity and compact output remains bounded.

## Focused Contract Checks

When reviewing focused behavior contracts or micro-specs:

- confirm the final traceability block points to the closest implementation files
- confirm `verifiedBy` names automated tests or verification docs that actually exercise or inspect the behavior
- confirm `relatedDocs` includes shared config, test, or adjacent behavior docs needed by future agents, not active plans or archive memory
- confirm `designDecisions` identifies maintained architecture or design decisions that constrain the behavior and does not duplicate `relatedDocs` targets
- keep runnable commands in the linked verification documents or project command guidance
- confirm generated Markdown traceability links are synchronized from the JSON block rather than edited as canonical data
- when using `contracts[]`, confirm contract IDs are stable and unique within the file, contract titles are human-readable, and `sections` are navigation hints rather than strict anchors
- do not add markdown comment anchors, symbol references, or line references for initial contract traceability
- do not treat validation success as proof of semantic test completeness
