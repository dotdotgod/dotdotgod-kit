# Trello Docs Sync

## Purpose

Trello docs sync links Trello task cards to repository markdown files under configured docs paths. Repository markdown is the source of truth. The CLI supports an offline dry-run for local, manual, and pull request review. Trello write mode is restricted to the trusted GitHub Actions default-branch push workflow.

## Command

```bash
dotdotgod trello sync <root> --dry-run
dotdotgod trello sync <root>
```

`--dry-run` plans updates and MUST NOT construct or call a Trello client. Omitting `--dry-run` is allowed only in the trusted GitHub Actions default-branch push workflow. Local/manual operator write mode is disabled.

## User Workflow

1. Create a Trello card.
2. Copy the card URL from Trello.
3. Create a markdown file under `docs/trello/**` or an additional configured sync path.
4. Add `trelloUrl` to the file frontmatter.
5. Run `dotdotgod trello sync <root> --dry-run` locally or in a pull request to review planned updates.
6. Configure GitHub Actions secrets `TRELLO_API_KEY` and `TRELLO_TOKEN`.
7. Merge the change so the default branch receives a push; the single GitHub Actions workflow runs `dotdotgod trello sync <root>` to add or verify the GitHub attachment, create/replace that repository's `dotdotgod-view` entry, and deploy the static Power-Up Pages artifact under `/trello/index.html`.

## Markdown Metadata

The command accepts only frontmatter metadata with a `trelloUrl` key:

```markdown
---
trelloUrl: "https://trello.com/c/AbCdEf12/"
---

# Task title
```

Valid Trello card URL shapes are:

- `https://trello.com/c/<shortLink>/`
- `https://trello.com/c/<shortLink>/<slug>`

The command extracts `<shortLink>` from the URL for reporting and Trello API use.

`trelloShortLink` and `trelloCardId` are not accepted metadata. If a file contains those keys with a valid `trelloUrl`, the command reports a warning and ignores them. If those keys are present without `trelloUrl`, the file fails as missing required metadata. Unknown non-Trello frontmatter keys are ignored.

Empty `trelloUrl`, non-Trello URLs, and Trello URLs without `/c/<shortLink>/` are invalid metadata.

## Sync Paths

The command always scans `docs/trello/**`.

Projects MAY add extra scan paths with root config:

```json
{
  "integrations": {
    "trello": {
      "syncPaths": ["docs/issue/**"]
    }
  }
}
```

`integrations.trello.syncPaths` MUST be an array of repository-relative path patterns that use the existing dotdotgod path-pattern vocabulary: exact paths, subtree patterns ending in `/**`, or suffix patterns starting with `**/`. Secrets, credentials, absolute paths, path escapes, empty strings, scalar strings, and unsupported glob forms are invalid.

## GitHub URL Resolution

For every matched markdown file, the command resolves the GitHub browser URL that Trello should link to:

```text
https://github.com/<owner>/<repo>/blob/<branch>/<repo-relative-path>
```

Configured or injected repository and branch data wins when available. Otherwise the resolver may use deterministic local metadata such as package repository information or git remote/branch fallback. The resolver MUST warn when fallback data is used or ambiguous, and MUST fail the file when it cannot build a safe unambiguous GitHub URL. The command MUST NOT call GitHub APIs.

Write mode also resolves a repository entry key in `owner/name` form. In trusted GitHub Actions write mode, `GITHUB_REPOSITORY` or explicit GitHub metadata is the trusted source for this key. Write mode MUST fail before Trello mutation if the repository key is missing or malformed.

## Credentials

Dry-run mode never requires Trello credentials. Write mode reads only `TRELLO_API_KEY` and `TRELLO_TOKEN` from the trusted GitHub Actions workflow environment. `.dotdotgod/trello-credentials.json` is not a credential source.

Missing, malformed, or empty write-mode credentials are usage errors with exit code `2` and no Trello API calls. Committed config may hold sync paths but MUST NOT be used as a credential source. Credential values and `GITHUB_TOKEN` MUST never appear in reports, errors, config output, tests, or diagnostics.

## Trello Write Surface

Trusted GitHub Actions write mode may use only Trello REST card lookup, attachment list/create, and custom field definition/value endpoints. The combined workflow also builds the static Power-Up Pages artifact from `packages/trello-power-up/**`, but Trello secrets MUST be scoped only to the default-branch push write step. The extracted short link is valid as `{idOrShortLink}`. The sync MUST NOT update card descriptions or call comment, GitHub write, webhook, OAuth, backend, or PR/status APIs.

## Attachment Semantics

The only default attachment write is the resolved GitHub browser URL for the markdown file. Attachment matching is exact-match only against Trello attachment `url`; attachment name, trailing slash normalization, URL decoding, and path normalization are ignored. Similar but non-exact URLs are treated as missing and create a new attachment.

If attachment creation fails, custom field update MUST be skipped for that card, final status MUST be `api-failed`, and the command MUST exit `1`.

## Custom Field Data

The sync stores Power-Up display data in a board text custom field named `dotdotgod-view`. GitHub Actions may create the field when absent and then update the card's field value. Trello card descriptions are user-authored and MUST NOT be modified by dotdotgod.

The field value is compact JSON with this shape:

```json
{"version":1,"entries":[{"repositoryKey":"org/repo","repositoryLabel":"repo","docsPath":"docs/trello/example.md","githubUrl":"https://github.com/org/repo/blob/main/docs/trello/example.md","trelloUrl":"https://trello.com/c/AbCdEf12/","title":"Example task","summary":"Short markdown excerpt for the Power-Up preview.","traceabilityState":"present","traceabilityDetails":["implementedBy: 1"]}]}
```

A sync from one repository creates the payload when absent, appends its entry when only sibling entries exist, replaces its own entry when present, preserves other repository entries, and treats invalid JSON, unsupported payload shape, or duplicate repository keys as conflicts. `title` comes from the first `#` heading or file name fallback. `summary` is the first plain-text paragraph after frontmatter and code blocks, compacted for Trello custom field storage.

## Traceability Policy

The command reads canonical fenced `json dotdotgod` blocks only to summarize traceability state. It MUST NOT define a second traceability format.

Traceability states are `present`, `not_required`, `missing`, and `invalid`. Any malformed `json dotdotgod` block in a synced file fails. Missing traceability fails only when the synced path requires traceability through existing traceability config.

## Duplicate Card Policy

Two or more markdown files that resolve to the same Trello short link are a conflict. The affected duplicate group MUST make no Trello API calls and the command exits `1`.

## Reports and Status

Human-readable output is the only public report format. The implementation may build structured report data internally, but Trello docs sync does not expose public `--json` output.

Dry-run reports planned attachment and custom field actions without reading Trello. Write reports each card's docs path, Trello URL, GitHub URL, repository entry key, attachment result, custom field result/action, final status, warnings, and errors. Report order MUST be deterministic by repository-relative file path.

Attachment and custom field sub-status values are `not-run`, `written`, `unchanged`, `failed`, with custom field also allowing `conflict`. Final card status values are `written`, `unchanged`, `blocked`, `conflict`, and `api-failed`.

## Failure Semantics

Planning errors are `blocked`. Duplicate Trello cards and invalid custom field payloads are `conflict`. Trello API failures, including 401, 403, 404, malformed responses, network failures, and 429 rate limits, are `api-failed`. Card-level API failures MUST NOT stop unrelated cards from continuing.

The sync does not retry 429 rate limits. It reports `API_TOKEN_LIMIT_EXCEEDED`, `API_KEY_LIMIT_EXCEEDED`, and `Retry-After` when present. Thrown fetch failures are normalized as `api-failed`.

Errors MUST include the cause, the affected file/card when available, and repair or retry guidance that an agent/operator can execute.

## Exit Codes

| Scenario | Exit code |
| --- | ---: |
| Dry-run succeeds, including planned updates | `0` |
| Trusted CI write mode all cards written or unchanged | `0` |
| No matching docs in dry-run or trusted CI write mode | `0` |
| Any blocked file, duplicate-card conflict, custom field conflict, or Trello API failure | `1` |
| Missing or malformed write-mode Actions secrets | `2` |
| Local/manual write-mode attempt | `2` |
| Missing project root, unknown command, or invalid option | `2` |

No matching docs in trusted CI write mode MUST warn and MUST NOT create or call the Trello client. Local/manual write-mode attempts MUST fail with exit `2` before treating no matching docs as success.

## Non-Goals

- Trello comments or description writes.
- GitHub write API calls, PR comments, or status updates.
- Webhooks, OAuth, backend workers, or server-hosted previews.
- Creating repository markdown from Trello cards.
- Public JSON output, manual write-mode inputs, or LLM-generated summaries.
- Marketplace Power-Up publication in this phase.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/core.mjs](../../packages/cli/src/core.mjs)
  - [packages/cli/src/cli/usage.mjs](../../packages/cli/src/cli/usage.mjs)
  - [packages/cli/src/memory/config.mjs](../../packages/cli/src/memory/config.mjs)
  - [packages/cli/src/trello/sync.mjs](../../packages/cli/src/trello/sync.mjs)
  - [packages/cli/src/trello/metadata.mjs](../../packages/cli/src/trello/metadata.mjs)
  - [packages/cli/src/trello/github-url.mjs](../../packages/cli/src/trello/github-url.mjs)
  - [packages/cli/src/trello/summary.mjs](../../packages/cli/src/trello/summary.mjs)
  - [packages/cli/src/trello/report.mjs](../../packages/cli/src/trello/report.mjs)
  - [packages/cli/src/trello/client.mjs](../../packages/cli/src/trello/client.mjs)
  - [packages/cli/src/trello/custom-fields.mjs](../../packages/cli/src/trello/custom-fields.mjs)
  - [packages/trello-power-up/src/index.js](../../packages/trello-power-up/src/index.js)
  - [.github/workflows/trello-docs-sync.yml](../../.github/workflows/trello-docs-sync.yml)
- Verified by:
  - [packages/cli/test/trello-sync.test.mjs](../../packages/cli/test/trello-sync.test.mjs)
  - [packages/cli/test/trello-workflow.test.mjs](../../packages/cli/test/trello-workflow.test.mjs)
  - [packages/cli/test/core.test.mjs](../../packages/cli/test/core.test.mjs)
  - [packages/trello-power-up/test/index.test.mjs](../../packages/trello-power-up/test/index.test.mjs)
  - [docs/test/TRELLO_DOCS_SYNC.md](../test/TRELLO_DOCS_SYNC.md)
- Related docs:
  - [docs/arch/TRELLO_DOCS_SYNC.md](../arch/TRELLO_DOCS_SYNC.md)
  - [docs/spec/CONFIG_COMMAND.md](CONFIG_COMMAND.md)
  - [docs/spec/VALIDATION_CONFIG.md](VALIDATION_CONFIG.md)
  - [docs/test/CONFIG_COMMAND.md](../test/CONFIG_COMMAND.md)
- Verification commands:
  - `node --test packages/cli/test/trello-sync.test.mjs packages/cli/test/trello-workflow.test.mjs`
  - `pnpm --filter @dotdotgod/cli test`
  - `pnpm --filter @dotdotgod/trello-power-up test`
  - `node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index`

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/core.mjs","packages/cli/src/cli/usage.mjs","packages/cli/src/memory/config.mjs","packages/cli/src/trello/sync.mjs","packages/cli/src/trello/metadata.mjs","packages/cli/src/trello/github-url.mjs","packages/cli/src/trello/summary.mjs","packages/cli/src/trello/report.mjs","packages/cli/src/trello/client.mjs","packages/cli/src/trello/custom-fields.mjs","packages/trello-power-up/src/index.js",".github/workflows/trello-docs-sync.yml"],"verifiedBy":["packages/cli/test/trello-sync.test.mjs","packages/cli/test/trello-workflow.test.mjs","packages/cli/test/core.test.mjs","packages/trello-power-up/test/index.test.mjs","docs/test/TRELLO_DOCS_SYNC.md"],"relatedDocs":["docs/arch/TRELLO_DOCS_SYNC.md","docs/spec/CONFIG_COMMAND.md","docs/spec/VALIDATION_CONFIG.md","docs/test/CONFIG_COMMAND.md"],"verificationCommands":["node --test packages/cli/test/trello-sync.test.mjs packages/cli/test/trello-workflow.test.mjs","pnpm --filter @dotdotgod/cli test","pnpm --filter @dotdotgod/trello-power-up test","node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index"]}
```
