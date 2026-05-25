# Trello Phase 2 Planning Workflow

## Purpose

This report summarizes how Trello Docs Sync Phase 2 was planned, implemented, reviewed, and verified. It is process research for dotdotgod plan mode, not a behavior contract for Trello sync. Phase 2 local write mode was later superseded by Phase 3, where Trello writes are restricted to trusted GitHub Actions default-branch push.

Durable Trello behavior remains in:

- `docs/spec/TRELLO_DOCS_SYNC.md`
- `docs/arch/TRELLO_DOCS_SYNC.md`
- `docs/test/TRELLO_DOCS_SYNC.md`

## Executive Summary

Phase 2 extended Phase 1 dry-run into local write mode while preserving parent-led orchestration. The parent converted open questions into locked decisions, created role-specific handoffs, launched read-only planning subagents, synthesized durable docs, implemented with one writer path, and used reviewer fanout to catch gaps before final verification.

The workflow worked because three boundaries stayed explicit:

- **Product boundary:** Phase 2 writes only a GitHub URL attachment and a dotdotgod managed card-description section.
- **Execution boundary:** subagents planned and reviewed; source/test edits stayed in one writer path.
- **Verification boundary:** focused tests, package tests, docs validation, graph impact, and broad verify were recorded separately, including unrelated validation debt.

## Phase 2 Scope Locked

Phase 2 covers local CLI write mode:

```bash
dotdotgod trello sync <root>
dotdotgod trello sync <root> --dry-run
```

Locked behavior:

- `--dry-run` remains offline and must not construct or call the Trello client.
- Omitting `--dry-run` runs write mode.
- Credentials resolve from `TRELLO_API_KEY`/`TRELLO_TOKEN`, then `.dotdotgod/trello-credentials.json`.
- Trello writes are limited to card lookup, attachment list/create, and description update.
- Attachment matching is exact URL match only.
- Managed description markers are exact and stable.
- Duplicate markdown files pointing to one Trello card are conflicts.
- Attachment creation failure skips description update.
- 429 rate limits are reported without retry.
- Error messages include cause plus repair or retry guidance.

Deferred behavior stayed out of Phase 2: comments, custom fields, GitHub Actions, Power-Up, backend, OAuth, webhooks, Trello-to-markdown import, public JSON output, and LLM summaries.

## Session Stage Timeline

| Stage | Owner | Output | Control Point |
| --- | --- | --- | --- |
| 0. Decision lock | Parent | `DECISIONS.md`, `TEST_PLAN.md`, `TEST_MATRIX.md` | Resolve product ambiguity before implementation. |
| 1. Endpoint design | Parent | `ENDPOINT.md` and `ROLE_*.md` | Make subagent roles explicit and bounded. |
| 2. Durable docs planning | Spec, architecture, test subagents | Briefs for spec/arch/test updates | Align behavior, architecture, and verification. |
| 3. Area planning | Client, managed-section, sync/report subagents | Implementation handoff briefs | Split technical concerns without parallel writes. |
| 4. Synthesis | Parent | Updated Trello durable docs | Convert planning evidence into source-of-truth docs. |
| 5. Implementation | Parent writer path | Client, managed section, sync, report, help, tests | One writer controls coupled edits. |
| 6. Review fanout | Three reviewers | Behavior/scope, security, verification findings | Parallel read-only review after implementation. |
| 7. Fix and verify | Parent writer path | Accepted fixes and validation evidence | Address blockers, defer unrelated debt. |

## Agent Role Model

### Parent Orchestrator

The parent retained decision authority: translated user decisions into docs, ran graph impact, launched bounded subagents, synthesized outputs, owned implementation edits, accepted or deferred reviewer findings, and reported validation evidence.

### Planning Subagents

Phase 2 used two read-only planning waves.

The durable-doc wave aligned:

- behavior spec;
- architecture and data flow;
- verification matrix.

The implementation-detail wave planned:

- credentials, Trello endpoints, injected fetch, API errors, rate limits, and redaction;
- exact markers, deterministic rendering, replacement, and conflicts;
- mode selection, duplicate grouping, status aggregation, reports, and CLI help.

### Single Writer Path

Implementation stayed in one active worktree writer path across tightly coupled files:

- `packages/cli/src/trello/client.mjs`
- `packages/cli/src/trello/managed-section.mjs`
- `packages/cli/src/trello/sync.mjs`
- `packages/cli/src/trello/report.mjs`
- `packages/cli/src/cli/usage.mjs`
- `packages/cli/src/core.mjs`
- `packages/cli/bin/dotdotgod.mjs`
- `packages/cli/test/trello-sync.test.mjs`

### Reviewer Fanout

Reviewers found Phase 2 gaps that were easy to miss in a single implementation pass: duplicate conflicts only in write mode, no-match masking config errors, credential redaction at the client boundary, missing injected-fetch client tests, and missing write-orchestration conflict tests.

## Artifact Map

| Artifact | Role in Workflow |
| --- | --- |
| `docs/plan/trello-docs-sync/phase-2/DECISIONS.md` | Locked behavior, endpoint, credential, marker, status, and error-message decisions. |
| `docs/plan/trello-docs-sync/phase-2/ENDPOINT.md` | Parent orchestration plan for Phase 2 subagents. |
| `docs/plan/trello-docs-sync/phase-2/ROLE_*.md` | Role-specific subagent handoffs. |
| `docs/plan/trello-docs-sync/phase-2/TEST_MATRIX.md` | Condition-by-condition fixture and mock matrix. |
| `docs/spec/TRELLO_DOCS_SYNC.md` | Durable behavior contract after synthesis. |
| `docs/arch/TRELLO_DOCS_SYNC.md` | Durable architecture rationale after synthesis. |
| `docs/test/TRELLO_DOCS_SYNC.md` | Durable verification strategy after synthesis. |
| `packages/cli/src/trello/client.mjs` | Trello REST adapter and credential resolution. |
| `packages/cli/src/trello/managed-section.mjs` | Managed description render/replace/conflict helper. |
| `packages/cli/test/trello-sync.test.mjs` | Focused Phase 1 and Phase 2 automated coverage. |

## Review Fix Loop

Accepted fixes included:

- duplicate-card conflict detection during planning;
- no-match exit `0` only when there are no planning/config errors;
- API key/token redaction from Trello client diagnostics;
- direct `createTrelloClient` injected-fetch tests;
- rate-limit normalization and `Retry-After` guidance tests;
- malformed response and network error normalization tests;
- dry-run offline behavior with a provided Trello client;
- mixed valid/blocked write execution; and
- managed-section conflicts through write orchestration.

Deferred or unrelated items included Phase 3 automation, comments, custom fields, Power-Up, backend, OAuth, webhooks, and existing local-memory size debt in `docs/plan/cli-core-module-split/README.md`.

## Verification Evidence

Focused and package checks passed:

```bash
node --test packages/cli/test/trello-sync.test.mjs
# 36 tests, 5 suites, 36 pass, 0 fail

pnpm --filter @dotdotgod/cli test
# 82 tests, 9 suites, 82 pass, 0 fail

node packages/cli/bin/dotdotgod.mjs validate . --check-index
# passed for durable docs
```

The include-local-memory validation command currently surfaces unrelated existing debt:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
# fails because docs/plan/cli-core-module-split/README.md exceeds markdown size budget
```

Workspace verification reaches the same unrelated validation failure after package tests pass.

Graph impact was run for the Phase 2 docs, source, test, CLI, and bin entrypoint changes. The highest-impact related files were the Trello spec, architecture, test docs, focused Trello tests, core CLI tests, Trello source modules, and CLI usage routing.

## Reusable Planning Patterns

This session reinforces these plan-mode patterns:

1. Convert ambiguity into a decision document before source edits.
2. Make subagent role handoffs concrete enough for fresh-context children.
3. Use parallel subagents for planning and review, not active source writes.
4. Synthesize durable spec/arch/test docs before implementation.
5. Keep implementation behind one writer path when files are coupled.
6. Split reviewer fanout by behavior/scope, architecture/security, and tests/verification.
7. Treat reviewer blockers as a fix loop, not optional commentary.
8. Record validation limitations when failures are unrelated to the active task.

## Friction and Improvements

- The plan command's single execution marker did not represent the full multi-stage work; future plans should align executable checklist items with real stage gates.
- Transient subagent outputs should be summarized into durable reports quickly.
- Local-memory validation can be blocked by unrelated active-plan size debt; final reports should distinguish durable-doc validation from include-local-memory validation.
- Credentialed integrations benefit from mandatory reviewer fanout because security and coverage gaps are easy to miss after focused implementation.

## Follow-Up Recommendations

- Keep Phase 3 GitHub Actions planning separate from Phase 2 local write mode.
- Reuse the Phase 2 `ENDPOINT.md` and `ROLE_*.md` pattern for complex implementation plans.
- Track unrelated active-plan validation debt separately so task reports can name it without conflating it with implementation failure.
- Consider a plan-mode report template that records scope lock, subagent lanes, accepted fixes, deferred scope, validation evidence, and unrelated validation blockers.
