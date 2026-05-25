# Trello Docs Sync Architecture

## Purpose

Trello docs sync links repository markdown to Trello cards. Local CLI usage is an offline dry-run pipeline. Trello writes are restricted to the GitHub Actions trusted default-branch push workflow, which reuses the dry-run plan, writes the GitHub attachment and the current repository's `dotdotgod-view` custom field entry, and keeps repository markdown canonical.

## Boundaries

Dry-run mode must not construct or call a Trello client. Write mode may call only Trello card, attachment, and custom field REST endpoints and is gated to GitHub Actions default-branch push. Current scope excludes local operator writes, local credential files, GitHub write APIs, PR comments, status updates, comments, description writes, webhooks, OAuth, backend services, Trello-to-markdown import, public JSON output, and LLM summaries.

## Module Responsibilities

| Module | Responsibility |
| --- | --- |
| `packages/cli/src/core.mjs` | Route `trello sync`, parse mode, and map usage failures to exit `2`. |
| `packages/cli/src/cli/usage.mjs` | Document dry-run, CI-only write-mode command shape, and Actions secret guidance. |
| `packages/cli/src/memory/config.mjs` | Parse and validate `integrations.trello.syncPaths`; never provide credentials. |
| `packages/cli/src/trello/sync.mjs` | Orchestrate planning, CI write gating, duplicate-card checks, write steps, status aggregation, and exit codes. |
| `packages/cli/src/trello/client.mjs` | Resolve Actions/env credentials, call Trello REST endpoints through injected fetch, normalize API errors, and redact secrets. |
| `packages/cli/src/trello/custom-fields.mjs` | Build, parse, merge, and validate the compact `dotdotgod-view` linked-docs custom field payload. |
| `packages/cli/src/trello/metadata.mjs` | Parse frontmatter `trelloUrl`, validate Trello URL shape, and extract short link. |
| `packages/cli/src/trello/github-url.mjs` | Build GitHub browser URLs and resolve `owner/name` repository entry keys from explicit inputs, GitHub Actions metadata, or dry-run fallback metadata. |
| `packages/cli/src/trello/summary.mjs` | Produce deterministic linked-docs data and traceability state. |
| `packages/cli/src/trello/report.mjs` | Render human-readable dry-run and write-mode output from structured report data. |
| `.github/workflows/trello-docs-sync.yml` | Run dry-run for manual/PR events, write mode only for default-branch push, build the Power-Up Pages artifact, and deploy Pages outside PRs. |
| `packages/trello-power-up/src/index.js` | Render read-only card-back UI from the `dotdotgod-view` custom field. |

## Data Flow

1. CLI routing accepts `trello sync <root> --dry-run` or `trello sync <root>`.
2. Config loading resolves built-in `docs/trello/**` plus `integrations.trello.syncPaths` extras.
3. Scanner finds markdown files under resolved sync paths.
4. Metadata parser validates `trelloUrl` and extracts the short link.
5. GitHub URL resolver builds one browser URL and one `owner/name` repository key for each matched file without GitHub APIs.
6. Traceability reader inspects canonical `json dotdotgod` blocks.
7. Summary helper builds deterministic linked-docs data for the current repository entry.
8. Dry-run returns a planned report without creating the Trello client.
9. Write mode first verifies it is running in the trusted GitHub Actions default-branch push context; local/manual writes fail with exit `2`.
10. Write mode resolves Actions/env credentials and detects duplicate Trello short links before API calls.
11. For each valid non-duplicate file, the client resolves the card with custom field items, lists attachments, adds the GitHub URL attachment if no exact URL match exists, ensures the `dotdotgod-view` text custom field exists, and updates that field with a merged repository entry payload.
12. The orchestrator records attachment result, custom field result, final status, warnings, and actionable errors.
13. In parallel with sync safety checks, the workflow builds `packages/trello-power-up/**` into `dist/trello` and deploys it to GitHub Pages only outside PRs on the default branch.
14. The report formatter prints deterministic human-readable output and the orchestrator returns the final exit code.

## Config and Credential Model

The built-in sync path `docs/trello/**` is always active. Extra paths come from root config:

```json
{
  "integrations": {
    "trello": {
      "syncPaths": ["docs/issue/**"]
    }
  }
}
```

Valid path patterns are exact repository-relative paths, subtree patterns ending in `/**`, and suffix patterns starting with `**/`. Trello sync paths reject secret-like targets such as `.env`, private key files, credentials, and secrets.

Write credentials are resolved outside committed config from `TRELLO_API_KEY` and `TRELLO_TOKEN` only. In CI they come from Actions secrets. `.dotdotgod/trello-credentials.json` is not used. The resolver rejects missing, malformed, or empty values. Credential values and `GITHUB_TOKEN` must be redacted from errors, reports, and tests.

The workflow uses `permissions: contents: read` at workflow scope. The Pages deploy job alone receives `pages: write` and `id-token: write`. `actions/checkout` may use read-only `GITHUB_TOKEN` to read private repository contents, but the Trello sync CLI does not consume `GITHUB_TOKEN`.

## Trello Client Boundary

`packages/cli/src/trello/client.mjs` should expose a small adapter with injectable fetch/env and no global network dependency in tests. Required operations:

- `getCard(idOrShortLink)` using `GET /1/cards/{idOrShortLink}` with `customFieldItems=true`.
- `listAttachments(idOrShortLink)` using `GET /1/cards/{idOrShortLink}/attachments`.
- `createAttachment(idOrShortLink, githubUrl)` using `POST /1/cards/{idOrShortLink}/attachments`.
- `listCustomFields(idBoard)` using `GET /1/boards/{idBoard}/customFields`.
- `createCustomField(idBoard, { name, type })` using `POST /1/customFields`.
- `updateCardCustomFieldText(idCard, idCustomField, text)` using `PUT /1/cards/{idCard}/customField/{idCustomField}/item`.

The client normalizes 401, 403, 404, 429, malformed response, and thrown fetch failures to structured `api-failed` diagnostics. For 429, preserve `API_TOKEN_LIMIT_EXCEEDED`, `API_KEY_LIMIT_EXCEEDED`, and `Retry-After` when available. The sync does not retry.

## Custom Field Boundary

The custom-field helper owns the compact JSON payload stored in the board text field named `dotdotgod-view`. The payload has `version: 1` and an `entries` array with one entry per repository key. Each entry stores repo key/label, docs path, GitHub URL, Trello URL, title, summary excerpt, traceability state, and details.

The helper creates a payload when the field is empty, appends a missing current repository entry, replaces exactly one current repository entry, and preserves sibling repository entries. It returns conflict for invalid JSON, unsupported payload shape, missing repository key, or duplicate repository keys. Trello descriptions are not a sync state store.

## Structured Report Model

The orchestrator should build structured data before text formatting: command/mode/root, scan paths, totals, and per-file fields for docs path, Trello URL, short link, GitHub URL, repository key, attachment result, custom field result/action, final status, traceability, warnings, and errors.

Dry-run may keep planned action fields. Trello docs sync does not expose the structure as public `--json`; tests may assert it internally.

## Status and Exit Aggregation

Planning errors produce final status `blocked`. Duplicate short links and invalid custom field payloads produce `conflict`. Trello API, malformed API response, rate-limit, and network failures produce `api-failed`. Successful changes produce `written`; exact matches produce `unchanged`.

Attachment creation failure sets attachment `failed`, skips custom field update with `not-run`, sets final status `api-failed`, and exits `1`. Custom field API failure after attachment success sets custom field `failed`, final status `api-failed`, and exits `1`.

Exit aggregation:

- `0` when all cards are `written` or `unchanged`, or when no matching docs are found.
- `1` when any card/file is `blocked`, `conflict`, or `api-failed`.
- `2` for usage and credential errors before write execution.

## Error and Warning Flow

Usage errors exit `2` and do not run the pipeline. Dry-run planning failures exit `1` for invalid metadata, unresolved GitHub URL, malformed traceability, or missing required traceability.

Write-mode errors must include cause, affected file/card when available, and a fix or retry instruction. Examples: configure Actions secrets, run `--dry-run`, repair invalid custom field data, remove duplicate Trello links, or retry after a rate limit.

Warnings do not fail on their own. Warning cases include no matching docs, unsupported Trello keys ignored because `trelloUrl` exists, and safe fallback metadata used to build a GitHub URL.

## Verification Targets

- `packages/cli/test/trello-sync.test.mjs` for focused dry-run, CI write gating, credential, and write-mode behavior.
- `packages/cli/test/trello-workflow.test.mjs` for combined workflow trigger, permission, path, secret, Pages deploy, and concurrency validation.
- `packages/cli/test/core.test.mjs` for routing/help coverage that cannot live in focused Trello tests.
- `packages/trello-power-up/test/index.test.mjs` for Power-Up payload parsing and rendering helpers.
- `docs/test/TRELLO_DOCS_SYNC.md` for verification strategy.

## Deferred Pieces

- Trello comments and description writes.
- Public JSON output for automation.
- Local operator write mode.
- Marketplace Power-Up publication or backend.
- OAuth, webhooks, server-hosted previews, and Trello-originated markdown creation.
