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

## Focused Contract Checks

When reviewing focused behavior contracts or micro-specs:

- confirm the final traceability block points to the closest implementation files
- confirm `verifiedBy` names automated tests or verification docs that actually exercise or inspect the behavior
- confirm `relatedDocs` includes architecture, config, or test docs needed by future agents
- confirm `verificationCommands` are runnable project-local commands
- do not treat validation success as proof of semantic test completeness
