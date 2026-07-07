# Memory Area Config Verification

## Commands

```bash
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs load-snapshot . --json
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory
```

## Smoke Checks

- Confirm projects without `dotdotgod.config.json` keep the default shared/local and fresh/stale memory policy.
- Confirm configured fixtures classify shared memory, local memory, fresh memory, stale memory, archive map, and archive body correctly.
- Confirm configured fixtures preserve optional memory-area `description` and `clarify` metadata in resolved config and load-snapshot output.
- Confirm invalid config, including malformed fuzzy low-signal add/remove arrays and invalid memory-area clarity metadata, produces validation errors without crashing runtime commands.
- Confirm archive bodies remain excluded from default snapshots unless a config or future command explicitly includes them.
- Confirm `load-snapshot` includes `memoryConfig`, `memoryPolicy`, configured `memoryAreas`, optional area clarity metadata, reference-expansion low-signal policy, and bounded archive policy.
- Confirm `load.pinnedPaths`/`load.pinnedBodies` validation rejects non-arrays, invalid patterns, absolute or traversal paths, and secret-like paths without crashing runtime commands.
- Confirm pinned files come from direct disk reads with pattern expansion, missing statuses, binary skips, secret skips, and bounded path/body/character counts with omitted and truncated metadata.
- Confirm compact load prompts show pinned paths only while full load prompts also embed bounded pinned body content.
