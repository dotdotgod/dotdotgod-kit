# Trello Phase 1 Planning Workflow

## Purpose

This report summarizes how the Trello Docs Sync Phase 1 work was planned, implemented, reviewed, and verified in one agent-led session. It is process research for dotdotgod plan mode, not a behavior contract for Trello sync.

Durable Trello behavior remains in:

- `docs/spec/TRELLO_DOCS_SYNC.md`
- `docs/arch/TRELLO_DOCS_SYNC.md`
- `docs/test/TRELLO_DOCS_SYNC.md`

## Executive Summary

The session used a planner-led workflow: the parent agent owned scope and decisions, role-specific subagents gathered bounded planning inputs, a parent synthesis step locked Phase 1 behavior, one writer implemented source and tests, and a reviewer fanout checked the result by concern.

The workflow worked because each stage had a different risk profile:

- Planning benefited from parallel specialist views.
- Implementation benefited from a single writer to avoid conflicting edits.
- Review benefited from parallel concern-based checks.
- Finalization required parent-level judgment to accept fixes and reject Phase 2 scope creep.

## Phase 1 Scope Narrowing

The original idea was Trello docs synchronization. Phase 1 was narrowed to a local dry-run command:

```bash
dotdotgod trello sync <root> --dry-run
```

Locked Phase 1 boundaries:

- Scan `docs/trello/**` by default.
- Allow extra scan paths through `integrations.trello.syncPaths`.
- Use only frontmatter `trelloUrl` for Trello card identity.
- Accept Trello card URLs shaped as `/c/<shortLink>/` or `/c/<shortLink>/<slug>`.
- Generate a report for planned GitHub URL attachment, generated card description content, sync status, and traceability state.
- Avoid Trello writes, Trello reads, GitHub API calls, backend services, Power-Up work, GitHub Actions, public `--json`, and markdown creation from Trello cards.

This boundary made the first implementation useful while keeping all irreversible or credentialed behavior out of scope.

## Session Stage Timeline

| Stage | Owner | Output | Control Point |
| --- | --- | --- | --- |
| 0. Parent prep | Parent | Phase 1 boundaries and graph impact target list | Confirm dry-run-only scope. |
| 1. Behavior planning | Spec writer subagent | Behavior draft for `docs/spec/TRELLO_DOCS_SYNC.md` | Cover metadata, URL shapes, reports, exits, and non-goals. |
| 2A. Architecture planning | Architect subagent | Module and data-flow plan | Keep local-only, no API clients. |
| 2B. Config planning | Config planner subagent | `integrations.trello.syncPaths` config brief | Match existing config validation conventions. |
| 3. Test planning | Test planner subagent | Fixture matrix and focused test plan | Cover parser, config, report, resolver, traceability, no writes. |
| 4. Parent synthesis | Parent | `STAGE_4_SYNTHESIS.md` and durable doc plan | Resolve conflicts before source work. |
| 5. Implementation | Single CLI worker | CLI dry-run implementation and tests | One writer for source/test changes. |
| 6. Review fanout | Three reviewer subagents | Behavior, architecture/config, and test/verification reviews | Parallel review after writes, not during writes. |
| 7. Finalization | Parent | Accepted fixes, verification, resume notes | Accept fixes; defer Phase 2 behavior. |

## Agent Role Model

### Parent Orchestrator

The parent agent acted as the decision and merge authority. It did not delegate final scope control. Its responsibilities were:

- preserve Phase 1 boundaries;
- choose which questions needed specialist input;
- synthesize conflicting recommendations;
- decide which reviewer findings became fixes;
- run or request verification; and
- update durable plan notes.

### Planning Subagents

Planning subagents were read-heavy and role-specific:

- **Spec writer** focused on user-visible CLI behavior, metadata rules, exit codes, report fields, and non-goals.
- **Architect** focused on module boundaries, data flow, and local-only integration constraints.
- **Config planner** focused on `dotdotgod.config.json` shape, sync path validation, and compatibility with existing config behavior.
- **Test planner** focused on fixtures, regression cases, and verification commands.

The value of the split was not independent decision-making. The value was parallel, bounded perspectives that the parent could compare before locking the implementation plan.

### Single Writer Worker

The implementation stage used one CLI worker. This avoided multiple agents editing shared source files at the same time. The worker produced:

- `packages/cli/src/trello/sync.mjs`
- `packages/cli/src/trello/metadata.mjs`
- `packages/cli/src/trello/github-url.mjs`
- `packages/cli/src/trello/summary.mjs`
- `packages/cli/src/trello/report.mjs`
- routing, usage, and config updates
- `packages/cli/test/trello-sync.test.mjs`

### Reviewer Fanout

Reviewers were split by concern:

- behavior and scope;
- architecture and config; and
- tests and verification.

This made the review parallel without creating write conflicts. The parent then accepted fixes that strengthened Phase 1 and rejected feedback that belonged to Phase 2 or later.

## Artifact Map

| Artifact | Role in Workflow |
| --- | --- |
| `docs/plan/trello-docs-sync/phase-1/DECISIONS.md` | Locked decisions and deferred behavior. |
| `docs/plan/trello-docs-sync/phase-1/GAPS.md` | Open questions to close before implementation. |
| `docs/plan/trello-docs-sync/phase-1/ENDPOINT.md` | Stage and subagent orchestration plan. |
| `docs/plan/trello-docs-sync/phase-1/STAGE_4_SYNTHESIS.md` | Parent conflict resolution and implementation handoff. |
| `docs/plan/trello-docs-sync/phase-1/REVIEW_FIXES.md` | Accepted review findings and verification notes. |
| `docs/spec/TRELLO_DOCS_SYNC.md` | Durable behavior contract. |
| `docs/arch/TRELLO_DOCS_SYNC.md` | Durable architecture rationale. |
| `docs/test/TRELLO_DOCS_SYNC.md` | Durable verification strategy. |

## Review Fix Loop

The reviewer fanout found issues that improved Phase 1 without changing its scope. Accepted fixes included:

- rejecting Trello URLs with extra path segments;
- rendering top-level dry-run report errors;
- rejecting raw absolute sync paths before normalization;
- forwarding injected options through `runTrelloSync` for deterministic CLI-route tests; and
- expanding tests for resolver warnings, invalid config fallback, report errors, traceability states, and CLI routing.

Deferred feedback stayed outside Phase 1:

- Trello write mode;
- Trello read validation;
- custom fields;
- Power-Up or backend work;
- GitHub Actions; and
- public JSON output.

## Verification Evidence

Verification was layered instead of relying on one broad check:

```bash
node --test packages/cli/test/trello-sync.test.mjs
pnpm --filter @dotdotgod/cli test
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
pnpm run verify
```

The session also used graph impact checks around source and docs changes. One package test run initially showed a transient e2e stderr newline failure through the context-mode runner, but the same package command passed on rerun after reviewer fixes. The workspace verify command later passed.

## Reusable Planning Patterns

This session supports these plan-mode patterns:

1. Define phase boundaries before assigning subagents.
2. Use read-heavy role subagents for spec, architecture, config, and test planning.
3. Require parent synthesis before source edits.
4. Use one writer for implementation unless worktrees or merge gates are available.
5. Run reviewer fanout after implementation, split by concern.
6. Let the parent decide accepted fixes and deferred scope.
7. Preserve durable artifacts in `docs/plan/` and route behavior contracts to spec/arch/test docs.
8. Close with focused tests, package tests, docs validation, graph impact, and workspace verification when appropriate.

## Friction and Improvements

The session also exposed process improvements:

- The final report location should be chosen earlier to avoid moving from a Trello-specific report directory to the agent-planning research lane.
- Plan Mode and execution-mode boundaries should be explicit before writing outside `docs/plan/`.
- Transient test failures should be recorded with rerun context, not treated as durable failures without confirmation.
- Subagent outputs should be summarized into durable evidence quickly because transient artifacts are less stable than project docs.
- Future complex plans could use a small stage checklist that records owner, output, acceptance gate, and verification evidence as the work proceeds.

## Follow-Up Recommendations

- Add this case study to future plan-mode evaluations as an example of planner-led multi-agent decomposition.
- Consider a reusable `docs/plan/<task>/ENDPOINT.md` template for role-specific subagent orchestration.
- Add a review-fanout checklist that separates accepted Phase N fixes from Phase N+1 proposals.
- Keep using workspace-level verification only after graph impact and focused checks have already narrowed the risk surface.
