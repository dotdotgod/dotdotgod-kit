# Memory Area Config Verification

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs query . "memory area configuration" --limit 5 --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Smoke Checks

- Confirm projects without `dotdotgod.config.json` keep the default shared/local and fresh/stale memory policy, including the final `docs/**` catch-all.
- Confirm ignored files under configured local exact/`/**` roots are discovered directly while disabled archive bodies and broad suffix-only local patterns are not walked.
- Confirm configured fixtures classify shared memory, local memory, fresh memory, stale memory, archive map, and archive body correctly.
- Confirm configured fixtures preserve optional memory-area `description` and `clarify` metadata in resolved config output.
- Confirm invalid config, including malformed fuzzy low-signal add/remove arrays and invalid memory-area clarity metadata, produces validation errors without crashing runtime commands.
- Confirm archive bodies remain excluded from the default graph index, Load tree, and vector corpus under their respective default policies.
- Confirm Load and query apply documentation exclusions while `config` preserves memory-area and reference-expansion metadata.
- Confirm `load.documentationSummary.exclude` defaults to `docs/plan` and `docs/archive`, remains independent from local-memory areas, accepts an explicit empty list, and rejects invalid objects, non-arrays, absolute paths, traversal paths, and unsupported patterns.
- Confirm Pi recursively discovers sorted shared Markdown; no-argument loads render depth 5, focused loads render depth 3 with unique-file query results, and both omit plan/archive bodies by default.
- Confirm Plan Mode automatic compact loads use empty focus, skip semantic query, and apply the same root documentation-exclusion array and fallback defaults as explicit Pi loads.
- Confirm `planMode.writablePaths` preserves plan/archive defaults, supports configured docs subtrees and an empty list, and rejects source, secret, traversal, unsupported-glob, non-Markdown, unsafe-shell, and configured-root deletion attempts.
- Confirm arbitrary legacy `load.pinnedPaths`/`load.pinnedBodies` values are non-blocking, normalize to empty arrays, and do not alter full or compact Load output.
