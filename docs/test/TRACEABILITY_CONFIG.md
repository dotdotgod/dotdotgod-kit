# Traceability Config Verification

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Smoke Checks

- Confirm the zero-config default still requires traceability for `docs/spec/**` markdown files except README files.
- Confirm custom `traceability.required` arrays can require multiple non-spec paths, such as `docs/product/**` and `docs/requirements/**`.
- Confirm custom traceability config replaces the default required list instead of merging with it.
- Confirm scalar string path settings fail validation; all path settings must be arrays.
- Confirm invalid traceability config reports validation errors while runtime snapshot and graph commands fall back to defaults.
