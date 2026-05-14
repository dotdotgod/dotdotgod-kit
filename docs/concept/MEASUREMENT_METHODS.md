# Measurement Methods

## Static Token Estimate Method
A simple local script can estimate token surfaces before introducing model-specific tokenizers.

Suggested inputs:

1. baseline memory files
2. docs indexes
3. selected spec/arch/test files
4. active plan files
5. archive files, separately measured as optional context

Suggested output:

| Group | Files | Characters | Approx tokens | Notes |
| --- | ---: | ---: | ---: | --- |
| Baseline | n | n | n | `AGENTS.md`, root README, docs indexes |
| Selected docs | n | n | n | Task-relevant spec/arch/test |
| Active plans | n | n | n | Current task intent |
| Archive index | n | n | n | Available history map |
| Full archive | n | n | n | Not loaded by default |

Use approximate tokens only as directional evidence. Label them as estimates.

## Pi Runtime Observation Method
Use Pi's context usage reporting when available.

Observation points:

1. before `/dd:load`
2. after `/dd:load`
3. before enabling Plan Mode
4. after Plan Mode writes or updates a plan
5. immediately before Plan Mode compaction
6. after compaction and the next assistant response
7. before execution
8. after archive completion

If needed, add a temporary debug extension that records `ctx.getContextUsage()` at `turn_end`, Plan Mode entry, and compaction callbacks.

Record:

| Point | Tokens | Context window | Percent | Notes |
| --- | ---: | ---: | ---: | --- |
| Before load | | | | |
| After load | | | | |
| Before compaction | | | | |
| After compaction | | | | |
| Before execution | | | | |

## Scenario Benchmark Method
Run repeated scenarios with and without the dotdotgod workflow.

Suggested scenarios:

1. small documentation change
2. feature change touching source and docs
3. architecture-sensitive change requiring conventions
4. long planning session with multiple alternatives
5. follow-up task that should reuse an archived decision

For each scenario, record:

| Scenario | Workflow | Load tokens | Peak context | Compactions | User restatements | Verification | Notes |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- |

Workflow examples:

- ad-hoc chat only
- dotdotgod load + docs-first planning
- dotdotgod load + Plan Mode + archive lookup

Keep model, date, package version, and prompt wording fixed where possible.

## Archive Growth Experiment
Historical memory is useful but can become noisy if loaded indiscriminately.

Measure the same repository at increasing archive sizes:

- no archive
- archive index only
- 10 archived plans
- 50 archived plans
- all archived plans
- targeted archive selected by task

Compare:

- directory summary size
- prompt size
- approximate loaded tokens
- time spent locating relevant history
- whether the agent selected the correct archive

This validates the current design choice: archives are available through indexes and targeted lookup, but excluded from the default documentation directory summary.
