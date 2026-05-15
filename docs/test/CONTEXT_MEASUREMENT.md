# Context Measurement Verification

## Commands

```bash
pnpm run measure:context
pnpm run measure:context:json
node scripts/measure-context.mjs --markdown --output docs/archive/report/context-metrics/latest.md
```

## Smoke Checks

- Confirm the static measurement reports load prompt, CLI load snapshot sample size, baseline memory, default docs surface, archive index, full archive, archive body excluded estimates, and Plan Mode full-vs-compact prompt estimates.
- Confirm local output under `docs/archive/report/context-metrics/` remains ignored by git.
- In Pi, start with `--dd-context-debug --dd-context-debug-output docs/archive/report/context-metrics/session.jsonl`, run `/dd:load`, `/plan`, and a first planning request, then confirm JSONL events are written for load, Plan Mode initial context-shaping checks, full curated load requests/skips, deferred load-after-compaction events when applicable, and Plan Mode activity.
