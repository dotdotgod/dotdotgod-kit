# Memory Area Config Verification

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs load-snapshot . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Smoke Checks

- Confirm projects without `dotdotgod.config.json` keep the default shared/local and fresh/stale memory policy, including the final `docs/**` catch-all.
- Confirm ignored files under configured local exact/`/**` roots are discovered directly while disabled archive bodies and broad suffix-only local patterns are not walked.
- Confirm configured fixtures classify shared memory, local memory, fresh memory, stale memory, archive map, and archive body correctly.
- Confirm configured fixtures preserve optional memory-area `description` and `clarify` metadata in resolved config and load-snapshot output.
- Confirm invalid config, including malformed fuzzy low-signal add/remove arrays and invalid memory-area clarity metadata, produces validation errors without crashing runtime commands.
- Confirm archive bodies remain excluded from default snapshots unless a config or future command explicitly includes them.
- Confirm `load-snapshot` includes `memoryConfig`, `memoryPolicy`, configured `memoryAreas`, optional area clarity metadata, reference-expansion low-signal policy, and bounded archive policy.
- Confirm `load.documentationSummary.exclude` defaults to `docs/plan` and `docs/archive`, remains independent from local-memory areas, accepts an explicit empty list, and rejects invalid objects, non-arrays, absolute paths, traversal paths, and unsupported patterns.
- Confirm Pi dynamically discovers sorted, bounded direct `docs/` child directories; full and compact prompts omit plan/archive summaries by default and include them when the configured exclusion list is empty.
- Confirm Plan Mode automatic compact loads use the resolved CLI documentation-summary policy.
- Confirm `planMode.writablePaths` preserves plan/archive defaults, supports configured docs subtrees and an empty list, and rejects source, secret, traversal, unsupported-glob, non-Markdown, unsafe-shell, and configured-root deletion attempts.
- Confirm `load.pinnedPaths`/`load.pinnedBodies` validation rejects non-arrays, invalid patterns, absolute or traversal paths, and secret-like paths without crashing runtime commands.
- Confirm pinned files come from direct disk reads with pattern expansion, missing statuses, binary skips, secret skips, and bounded path/body/character counts with omitted and truncated metadata.
- Confirm compact load prompts show pinned paths only while full load prompts also embed bounded pinned body content.
