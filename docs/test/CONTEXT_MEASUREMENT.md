# Context Measurement Verification

## Commands

```bash
pnpm run measure:context
pnpm run measure:context:json
node scripts/measure-context.mjs --markdown
node scripts/measure-context.mjs --markdown --output docs/archive/report/context-metrics/LATEST.md
node scripts/measure-context.mjs --markdown --impact-changed packages/pi/extensions/plan-mode/index.ts
```

## Related Files

- Measurement script: [scripts/measure-context.mjs](../../scripts/measure-context.mjs)
- Follow-up plan: [docs/plan/context-metrics-follow-up/README.md](../plan/context-metrics-follow-up/README.md)
- Context metrics reports: [docs/archive/report/context-metrics/README.md](../archive/report/context-metrics/README.md)
- Load-project behavior: [docs/spec/LOAD_PROJECT.md](../spec/LOAD_PROJECT.md)

## Smoke Checks

- Confirm the static measurement reports default full load prompt size, compact load prompt size when requested, CLI load snapshot sample size, bounded fallback directory listing behavior, raw and compact graph impact sample size, impact ranking method, scored item count, semantic item count, baseline memory, default docs surface, archive index, full archive, archive body excluded estimates, and Plan Mode full-vs-compact prompt estimates.
- Confirm default output writes `MEASURE_<timestamp>.md` or `MEASURE_<timestamp>.json` under `docs/archive/report/context-metrics/` when `--output` is omitted.
- Confirm local output under `docs/archive/report/context-metrics/` remains ignored by git.
- In Pi, start with `--dd-context-debug --dd-context-debug-output docs/archive/report/context-metrics/session.jsonl`, run `/dd:load`, `/dd:load compact`, `/plan`, and a first planning request, then confirm JSONL events are written for default full load, explicit compact load, Plan Mode initial context-shaping checks, curated compact load requests/skips, deferred load-after-compaction events when applicable, and Plan Mode activity.
- Confirm Plan Mode first-turn instructions include bounded exploration wording and subsequent turns use the compact reminder rather than repeating the full prompt.
