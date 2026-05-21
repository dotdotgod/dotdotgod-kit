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
- Confirm scalar string path settings fail validation; all path settings must be arrays.
- Confirm invalid traceability config reports validation errors while runtime snapshot and graph commands fall back to defaults.
- Confirm `dotdotgod traceability links <root> --check` exits non-zero when generated Markdown link sections are missing or stale.
- Confirm `dotdotgod validate` reports `TRACEABILITY_LINKS_STALE` when generated Markdown link sections or compact traceability JSON drift from the canonical parsed data, matching the focused `traceability links --check` drift gate.
- Confirm `dotdotgod traceability links <root> --write` inserts a missing sentinel-bounded link section before the canonical `json dotdotgod` block and rewrites the JSON block as compact single-line JSON.
- Confirm write mode replaces only the sentinel-bounded region when a generated section already exists.
- Confirm duplicate, incomplete, or reversed traceability-link sentinels produce validation errors and are not auto-fixed.
- Confirm generated traceability-link regions and canonical `json dotdotgod` blocks are excluded from markdown line and character budget checks.

## Focused Contract Checks

When reviewing focused behavior contracts or micro-specs:

- confirm the final traceability block points to the closest implementation files
- confirm `verifiedBy` names automated tests or verification docs that actually exercise or inspect the behavior
- confirm `relatedDocs` includes architecture, config, or test docs needed by future agents
- confirm `verificationCommands` are runnable project-local commands
- confirm generated Markdown traceability links are synchronized from the JSON block rather than edited as canonical data
- do not treat validation success as proof of semantic test completeness
