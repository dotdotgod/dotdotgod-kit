# Plan Mode Debug And Archive

## Debug Measurement

With `--dd-context-debug`, Plan Mode records local JSONL events for entry, first-request context shaping, planning turn end, compaction request/result, and execution start.

Events include context usage when available, git state, compaction reason, current-work focus, queued/flushed load state, CLI context availability, entry counts, and todo counts. Debug output defaults under `docs/archive/report/context-metrics/` unless `--dd-context-debug-output` is provided.

Debug measurement is opt-in investigation output. It should be enabled for context-size reviews, lazy-refresh investigations, Load-map boundedness checks, or graph-quality follow-up work, not as a normal requirement for every Plan Mode session. When a measurement review is complete, keep the outcome under `docs/archive/report/context-metrics/` or create a focused follow-up plan only if fixes are needed.

## Archive Policy

After implementation and verification, completed task directories should move from:

```text
docs/plan/<task-slug>/
```

to:

```text
docs/archive/plan/<task-slug>/
```

Use `docs/archive/README.md` as the first routing map before reading archive bodies. Archive bodies are not part of routine context loading; read them only when the current task needs related completed decisions, reports, payloads, or investigation notes.

Completed or superseded plans belong under `docs/archive/plan/<task-slug>/`. Temporary investigations, measurements, and reports belong under `docs/archive/report/<report-slug>/`.

## Traceability

This domain owns the detailed Plan Mode behavior contract. Keep traceability blocks on non-README spec files and keep the compatibility route file so stable Plan Mode links remain valid.



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/pi/extensions/plan-mode/index.ts](../../../packages/pi/extensions/plan-mode/index.ts)
  - [packages/pi/extensions/plan-mode/utils.ts](../../../packages/pi/extensions/plan-mode/utils.ts)
- Verified by:
  - [packages/pi/test/plan-mode-utils.test.ts](../../../packages/pi/test/plan-mode-utils.test.ts)
  - [docs/test/README.md](../../test/README.md)
- Related docs:
  - [docs/spec/plan-mode/README.md](README.md)
  - [docs/spec/PLAN_MODE_TOOL_SETTINGS.md](../PLAN_MODE_TOOL_SETTINGS.md)
  - [docs/spec/IMPACT_RANKING_CONFIG.md](../IMPACT_RANKING_CONFIG.md)
- Design decisions:
  - [docs/arch/EXTENSION_ARCHITECTURE.md](../../arch/EXTENSION_ARCHITECTURE.md)
  - [docs/arch/CODE_CONVENTIONS.md](../../arch/CODE_CONVENTIONS.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/pi/extensions/plan-mode/index.ts","packages/pi/extensions/plan-mode/utils.ts"],"verifiedBy":["packages/pi/test/plan-mode-utils.test.ts","docs/test/README.md"],"relatedDocs":["docs/spec/plan-mode/README.md","docs/spec/PLAN_MODE_TOOL_SETTINGS.md","docs/spec/IMPACT_RANKING_CONFIG.md"],"designDecisions":["docs/arch/EXTENSION_ARCHITECTURE.md","docs/arch/CODE_CONVENTIONS.md"]}
```
