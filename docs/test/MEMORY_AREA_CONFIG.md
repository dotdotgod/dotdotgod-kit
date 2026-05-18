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
- Confirm invalid config, including malformed fuzzy low-signal add/remove arrays, produces validation errors without crashing runtime commands.
- Confirm archive bodies remain excluded from default snapshots unless a config or future command explicitly includes them.
- Confirm `load-snapshot` includes `memoryConfig`, `memoryPolicy`, configured `memoryAreas`, reference-expansion low-signal policy, and bounded archive policy.
