# Trello Docs Sync Tests

## Scope

This document defines verification for Trello docs sync. Dry-run remains offline for local, manual, and PR review. Write mode is restricted to trusted GitHub Actions default-branch push and uses mocked Trello APIs. Tests must not require live Trello credentials, network calls, comments, description writes, or developer-machine git state.

## Primary Automated Coverage

Primary test files:

```text
packages/cli/test/trello-sync.test.mjs
packages/cli/test/trello-workflow.test.mjs
```

Use `packages/cli/test/e2e.test.mjs` for fixture-based workflow/config interaction. Use `packages/cli/test/core.test.mjs` only for config, routing, or help behavior outside focused tests.

## Fixture Matrix

Fixtures may be checked in under `packages/cli/test/fixtures/trello-docs/` or generated in temporary project roots. The test cases must cover the same scenarios.

| Case | Expected outcome |
| --- | --- |
| Trello URL with or without slug | Valid; extracts short link from `/c/<shortLink>/`; planned or written update can exit `0`. |
| Missing metadata | Fails with missing required `trelloUrl`; exits `1`. |
| Unsupported identifiers with URL | Valid with warning that `trelloShortLink` or `trelloCardId` is ignored. |
| Unsupported identifiers only | Fails as missing required `trelloUrl`; exits `1`. |
| Malformed URL | Empty, non-Trello, or wrong Trello path fails metadata validation; exits `1`. |
| Unknown frontmatter | Valid when `trelloUrl` is present; unrelated keys are ignored. |
| Outside sync path | Ignored unless included by `integrations.trello.syncPaths`. |
| Configured extra path | Included when config lists the path. |
| Linked-docs custom field data | `dotdotgod-view` data includes repository key, docs path, GitHub URL, title, summary excerpt, traceability summary, and no LLM/rich summary. |
| Traceability states | Covers `present`, `not_required`, `missing`, and `invalid` with existing traceability rules. |
| Dry-run still offline | `--dry-run` exits without creating or calling a Trello client. |
| Trusted CI write mode selected | Omitting `--dry-run` in a simulated default-branch push context uses mocked Trello client and renders write report. |
| Local write attempt | Omitting `--dry-run` outside trusted CI exits `2` before Trello calls. |
| Missing or empty Actions secrets | Exit `2`; no Trello calls; actionable credential guidance. |
| Local credential file | `.dotdotgod/trello-credentials.json` is ignored or disabled; write mode does not use it. |
| Config credentials ignored | Credential-like committed config keys are ignored and not printed. |
| No matching docs in trusted CI write mode | Exit `0`; warning; no Trello client calls; local/manual write attempts still exit `2`. |
| Duplicate Trello card | Two markdown files resolve to one short link; conflict; no API calls for that group; exit `1`. |
| Card lookup failures | 401, 403, 404, malformed response, network throw, or 429 become `api-failed`; unrelated cards continue. |
| Rate limits | 429 includes available rate-limit cause and `Retry-After`; no retry. |
| Existing attachment | Exact matching attachment `url` prevents duplicate creation. |
| Similar attachment URL | Different trailing slash, encoding, or normalized form is not a match. |
| Missing attachment | Create attachment once through the mocked client. |
| Attachment create failure | Custom field is `not-run`, final status `api-failed`, exit `1`. |
| Empty custom field | `dotdotgod-view` payload and first repository entry are written. |
| Existing valid current repo entry | Only the current repository entry is replaced; sibling repo entries are preserved. |
| Existing valid sibling repo entry | Current repository entry is appended; sibling entry is preserved. |
| Duplicate repository entries | Conflict; no custom field update; exit `1`. |
| Invalid custom field JSON or shape | Conflict; no custom field update; exit `1`. |
| Fully unchanged card | Existing attachment and custom field repository entry already match; card `unchanged`; exit `0` when no other errors exist. |
| Actionable error | Missing credentials, malformed markers, duplicate card, or API failure includes cause plus repair/retry instruction. |
| Secret redaction | Output never includes API key or token. |
| Deferred scope guards | No comment, description write, GitHub write API, PR comment, status update, public JSON output, webhook, OAuth, or backend calls. |

## Unit Test Groups

### Metadata Parser

Target: `packages/cli/src/trello/metadata.mjs`

Assert parsing only frontmatter `trelloUrl`, extracting `/c/<shortLink>/`, rejecting empty/non-Trello/malformed URLs, warning on unsupported Trello keys with a URL, failing on unsupported Trello keys without a URL, and ignoring unrelated frontmatter.

### Sync Path Matching and Scanner

Target: `packages/cli/src/trello/sync.mjs`

Assert default `docs/trello/**`, configured extras, exclusion outside sync paths, deterministic ordering, and no-match exit `0` warning behavior in dry-run and write mode.

### Config and Credential Handling

Targets: `packages/cli/src/memory/config.mjs`, `packages/cli/src/trello/client.mjs`, `packages/cli/test/core.test.mjs`

Assert config validation for `integrations.trello.syncPaths`; credentials required only in trusted CI write mode; `.dotdotgod/trello-credentials.json` is not used; bad credentials exit `2`; committed config is never a credential source; missing credential errors include Actions secret guidance; and secrets are redacted.

### GitHub URL Resolver

Target: `packages/cli/src/trello/github-url.mjs`

Inject repository, branch, remote, and package metadata so results do not depend on local git state. Cover explicit data, HTTPS/SSH remote normalization, URL-encoded markdown paths, fallback warnings, and unresolved/ambiguous data failures.

### Trello Client Adapter

Target: `packages/cli/src/trello/client.mjs`

Use injected fetch/env. Cover auth request construction without leaking secrets, card lookup, attachment listing/creation, custom field lookup/creation/update, normalized 401/403/404/429/network/malformed-response errors, and no live network calls.

### Linked Docs Data and Custom Field Payload

Targets: `packages/cli/src/trello/summary.mjs`, `packages/cli/src/trello/custom-fields.mjs`

Cover deterministic linked-docs content with repository key, docs path, GitHub URL, markdown title, compact summary excerpt, traceability state/details, `dotdotgod-view` default field name, empty payload creation, append of missing current repo entry, current repo entry replacement, sibling entry preservation, invalid JSON conflicts, duplicate repository-key conflicts, and unsupported payload-shape conflicts.

### Dry-Run Planner and Write Orchestration

Targets: `packages/cli/src/trello/sync.mjs`, `packages/cli/src/trello/report.mjs`

Cover dry-run reuse, no Trello client in dry-run, local write attempts exiting `2`, trusted CI write with mocked clients, duplicate short-link conflict before API calls, blocked files making no Trello calls, valid files continuing when another fails, card-level API failures continuing unrelated cards, attachment/custom-field results, custom-field actions, no description writes, final totals, and all exit codes.

### Power-Up UI Helpers

Target: `packages/trello-power-up/test/index.test.mjs`

Cover `dotdotgod-view` payload parsing, invalid-payload reporting, safe HTML rendering, and custom field lookup from Trello Power-Up card/board data.

### Workflow Static Validation

Target: `packages/cli/test/trello-workflow.test.mjs`

Assert combined workflow safe triggers, no `pull_request_target`, read-only workflow permissions, Trello and Power-Up paths, non-canceling concurrency, write-step-only Trello secrets, manual/PR dry-run, Pages build, no PR deploy, and job-scoped Pages permissions.

### Report and CLI Help

Targets: `packages/cli/src/trello/report.mjs`, `packages/cli/src/core.mjs`, `packages/cli/src/cli/usage.mjs`

Assert write output differs from dry-run output; each card shows docs path, Trello URL, GitHub URL, repository key, attachment result, custom field result/action, final status, warnings, and actionable errors; ordering and totals are deterministic; secrets are redacted; no public JSON output is exposed; and help documents dry-run plus CI-only writes.

## Expected Exit Codes

| Scenario | Exit code |
| --- | ---: |
| Dry-run valid planned updates | `0` |
| Trusted CI write mode all cards written or unchanged | `0` |
| No matching docs in dry-run or trusted CI write mode | `0` |
| Unsupported Trello keys with valid `trelloUrl` only | `0` |
| Invalid metadata, unresolved GitHub URL, malformed traceability, or missing required traceability | `1` |
| Duplicate Trello card conflict | `1` |
| Custom field payload conflict | `1` |
| Trello API failure, rate limit, network failure, or malformed API response | `1` |
| Attachment create fails and custom field update is skipped | `1` |
| Missing or malformed Actions secrets in write mode | `2` |
| Local/manual write-mode attempt | `2` |
| Missing project root, unknown option, or unknown subcommand | `2` |

## Manual Verification

Dry-run fixture:

```bash
node packages/cli/bin/dotdotgod.mjs trello sync /path/to/fixture --dry-run
```

Trusted CI write fixture is exercised through mocked automated tests and the GitHub Actions workflow. Local manual verification should use dry-run only.

Expected write output identifies write mode, reports attachment/custom-field results, redacts credentials, creates no comments, and never updates descriptions.

## Verification Commands

Focused tests:

```bash
node --test packages/cli/test/trello-sync.test.mjs
node --test packages/cli/test/trello-workflow.test.mjs
```

Config/routing tests when touched:

```bash
pnpm --filter @dotdotgod/cli test
pnpm --filter @dotdotgod/trello-power-up test
```

Docs validation:

```bash
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
```
