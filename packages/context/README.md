# @dotdotgod/context

[![npm version](https://img.shields.io/npm/v/@dotdotgod/context.svg)](https://www.npmjs.com/package/@dotdotgod/context) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/context) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Local-first execution, ingestion, and retrieval runtime for dotdotgod adapters.

Use this package to keep large command output, project files, and fetched text available as bounded local evidence across agent turns. Small results return directly; larger results become searchable excerpts with source provenance. Durable ingestion jobs and opaque session resume support work that outlives one tool call.

Claude Code and Codex start the bundled stdio MCP server through their adapter packages. Pi calls the same core through native extension tools. Direct integrators can use the server, hooks, and typed core exports on Node.js 22.5 or newer.

```bash
npm install @dotdotgod/context
```

```bash
dotdotgod-context
```

The runtime policies apply to dotdotgod execution and retrieval tools. Each host's built-in shell keeps its native behavior.

## What Changes

- **Large output remains useful.** The runtime indexes oversized results locally and returns only the excerpts relevant to the next question.
- **Evidence keeps its identity.** Project files, command output, and fetched resources carry distinct provenance and trust metadata.
- **Longer processing becomes resumable.** Durable ingestion jobs expose bounded queue, status, cancellation, and restart recovery.
- **Retrieved text stays evidence.** Search marks indexed content with `instructionAuthority: "none"` so callers can treat it as data rather than project instructions.
- **One core supports different agent hosts.** MCP adapters and Pi-native tools share the same execution, storage, retrieval, fetch, and diagnostic behavior.

## Tool Surface

- `execute`, `batch_execute`, `execute_file`
- `index`, `search`, `fetch_and_index`
- `session_resume`, `ingestion_job_start`, `ingestion_job_status`, `ingestion_job_cancel`
- `context_heal`, `stats`, `doctor`, `purge`
- `dotdotgod_project_load`, `dotdotgod_project_impact`, `dotdotgod_project_initialize`

Run the stdio MCP server directly with:

```bash
dotdotgod-context
```

The MCP server reserves stdout for JSON-RPC. Child stdout and stderr flow through private temporary files and are removed after the result has been bounded or indexed.

## Command Output

The dotdotgod execution tools support four output modes:

| Mode | Behavior |
| --- | --- |
| `auto` | Returns bounded direct output when small and indexes larger output. |
| `direct` | Returns bounded stdout and stderr excerpts and reports truncation. |
| `indexed` | Indexes output and returns metadata instead of the raw streams. |
| `discard` | Returns status and metrics without stream content. |

Each command has one **10 MiB combined capture ceiling** shared by stdout and stderr. If either stream exceeds the remaining shared budget, the runtime terminates the process and reports `captureLimitExceeded`. A direct response is capped at **1 MiB per stream**, even if a caller requests more. Automatically indexed command output defaults to session scope and a 24-hour expiry.

`batch_execute` accepts up to 100 commands, uses concurrency from 1 through 8, and preserves input order. Execution and explicit shell mode remain write-capable operations subject to the host's approval model.

`execute`, `batch_execute`, and `execute_file` share an `inherit-filtered-v1` child-environment policy. It preserves compatibility-oriented inheritance while filtering `NODE_OPTIONS`, `PYTHONPATH`, `RUBYOPT`, `LD_PRELOAD`, and supported-platform `DYLD_*` variables. Callers may provide string overrides or remove inherited variables with `null`, but cannot restore reserved variables. Results report filtered names without values. This policy applies only to these dotdotgod tools and does not isolate ordinary inherited credentials.

## Local Storage And Retrieval

Indexed content is stored in the project-local SQLite FTS5 database:

```text
.dotdotgod/context/context.sqlite
```

The store is local ignored state, not maintained project truth. Sources can use transient, session, or project scope and carry optional expiry metadata. Writable connections use WAL and a 1-second busy timeout. Source replacement, expiry, and purge update source and FTS rows transactionally. Recognized older schemas migrate transactionally through a version ledger; unknown, newer, incomplete, or corrupt schemas fail closed before explicit healing. Search applies scope, session, and source predicates before candidate fusion, then:

1. retrieves bounded Porter-tokenized FTS5 candidates;
2. retrieves bounded label/path candidates;
3. combines lists with reciprocal-rank fusion (RRF);
4. reranks deterministically using title, path, and term-proximity signals;
5. returns bounded excerpts with ranking and provenance evidence.

This bounded retrieval keeps indexed runtime material separate from maintained project truth. Search returns source excerpts and does not add execution output to the maintained documentation graph.

## Structural Ingestion

Local `index` accepts one project-contained regular text file or directory. A file is limited to **25 MiB**. Directory defaults allow at most depth 16, 10,000 visited entries, 1,000 indexed files, 25 MiB per file, and 100 MiB in aggregate; callers may configure the traversal limits explicitly.

Directory ingestion:

- walks paths in deterministic lexical order and returns metadata-only indexed, skipped, and failed entries;
- accepts explicit `includeExtensions` and `excludePaths` filters but does not interpret `.gitignore` files;
- skips directory and file symlinks by default; optional file-symlink following remains limited to targets inside the project;
- rejects special files and verifies file identity through a bounded descriptor read before indexing;
- stops further traversal/indexing on cancellation while reporting already committed sources.

Content chunking then applies these rules:

- Markdown is split around headings, prose blocks, and fenced blocks while retaining heading and fence metadata.
- JSON is parsed into deterministic key-path chunks; invalid JSON falls back to bounded text chunks.
- Generic and legacy plain text keeps overlapping text chunks.
- Structural and fallback chunks enforce a UTF-8 byte ceiling.

Extractor and chunker versions make new and legacy records observable without a mandatory reindex or migration.

## Provenance And Instruction Boundary

The indexing operation owns security-sensitive provenance fields, so caller metadata cannot promote trust or spoof origin and content hashes. New records include source type, trust, origin, SHA-256 content hash, indexed time, extractor, and chunker version. Legacy or inconsistent records remain readable with `unknown` provenance instead of being rewritten.

Trust defaults include:

- project files: `project-maintained`;
- command output: `tool-output`;
- fetched URLs: `external-untrusted`.

Search results set `instructionAuthority: "none"` and the MCP response describes retrieved text as data with no authority to request tool calls, command execution, configuration changes, upgrades, or destructive confirmation. This non-authoritative rendering and provenance are defense in depth; they are not a guarantee that prompt injection is prevented.

## Strict URL Fetching

`fetch_and_index` accepts credential-free HTTP(S) URLs and indexes bounded text without returning the complete body. Both the wire response and decoded body have independent **10 MiB maximums**.

The application-level fetch policy:

- rejects URL credentials and non-HTTP(S) schemes;
- resolves and validates every DNS answer against private and reserved address policy;
- pins lookup to accepted addresses and rechecks the connected socket peer;
- manually revalidates every redirect, with at most five redirects by default;
- enforces timeout, declared length, wire-byte, and decoded-byte limits;
- supports identity, gzip, deflate, and Brotli encodings and rejects unsupported encodings;
- accepts bounded text-oriented MIME types and fails closed for unsupported types or HTTP statuses.

Accepted HTML is normalized by a bounded `html-v1` extractor. It validates supported UTF-8/US-ASCII declarations, removes scripts, styles, noscript and hidden/non-content elements, and preserves basic titles, headings, paragraphs, lists, tables, code, and link text. Link metadata is separately bounded. The extractor does not invoke a browser, execute JavaScript, load subresources, follow links, or provide standards-complete HTML rendering. HTML remains `external-untrusted`; normalization is not rendering sanitization or a prompt-injection guarantee. These controls provide application-level URL and address validation. They offer defense in depth rather than a network namespace or process sandbox.

## Diagnostics And Deletion

`doctor` performs local, read-only checks for:

- the minimum Node.js runtime;
- project and storage-path readiness;
- SQLite FTS5 with the Porter tokenizer;
- compatibility of an existing context database schema without migration or repair;
- current store statistics when supplied;
- the configured strict fetch policy.

Doctor does not create the database, execute commands, contact npm or other networks, migrate schemas, repair configuration, or install upgrades.

`purge` permanently deletes indexed data only when `confirm: true` is supplied with exactly one selector: scope, session ID, or source ID.

## Project Workflow Boundaries

The MCP server also exposes bounded project load, graph impact, and initializer services. Project initialization defaults to dry-run and requires both `dryRun: false` and `confirmWrite: true` before writing.

Claude Code and Codex adapter hooks may tell the model to call these MCP tools and retry a denied operation. Hooks do not transform an ordinary host shell call into an MCP call. Pi retains its native project-memory lifecycle and calls the shared runtime directly.

## Advanced Runtime Capabilities

Search includes a bounded typo-tolerant trigram lane while Porter FTS remains primary. Databases use transactional version-ledger migrations; explicit healing backs up first and accepts only recognized profiles. Opaque session IDs can be resumed without a history-listing API. Durable background ingestion has bounded queue, status, cancellation, and restart recovery.

Execution keeps compatibility-oriented filtered inheritance by default; this mode is not credential isolation. Opt-in `allowlist-v1` starts from an empty child environment and copies only explicit names, including caller overrides only when separately allowlisted, with names-only reporting. Strict fetch remains default. Browser rendering is available only through an injected renderer plus `browser: true`; this package bundles no browser, keeps rendered content `external-untrusted`, enforces limits/abort, and makes no sandbox claim.

## Learn More

- [Behavior specification](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/spec/CONTEXT_EXECUTION.md)
- [Runtime architecture](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/arch/CONTEXT_EXECUTION_ARCHITECTURE.md)
- [Verification strategy](https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/test/CONTEXT_EXECUTION.md)
- [Repository README](https://github.com/dotdotgod/dotdotgod-kit#readme)

## Local Development

```bash
pnpm --filter @dotdotgod/context verify
pnpm --filter @dotdotgod/context pack:dry-run
```
