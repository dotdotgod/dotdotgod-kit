# @dotdotgod/context

[![npm version](https://img.shields.io/npm/v/@dotdotgod/context.svg)](https://www.npmjs.com/package/@dotdotgod/context) [![GitHub](https://img.shields.io/badge/GitHub-dotdotgod%2Fdotdotgod--kit-181717?logo=github)](https://github.com/dotdotgod/dotdotgod-kit/tree/main/packages/context) [![License: Elastic 2.0](https://img.shields.io/badge/License-Elastic%202.0-blue.svg)](https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE)

Local-first execution, ingestion, and retrieval runtime for dotdotgod adapters.

The package exposes a local stdio MCP server and reusable core modules. Claude Code and Codex start the server through their adapter packages. Pi calls the same core through native extension tools and does not start an MCP child. Only dotdotgod execution tools use the capture and indexing behavior described here; the adapters do not transparently intercept ordinary host Bash or shell tools.

## Tool Surface

- `execute`, `batch_execute`, `execute_file`
- `index`, `search`, `fetch_and_index`
- `stats`, `doctor`, `purge`
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

## Local Storage And Retrieval

Indexed content is stored in the project-local SQLite FTS5 database:

```text
.dotdotgod/context/context.sqlite
```

The store is local ignored state, not maintained project truth. Sources can use transient, session, or project scope and carry optional expiry metadata. Search applies scope, session, and source predicates before candidate fusion, then:

1. retrieves bounded Porter-tokenized FTS5 candidates;
2. retrieves bounded label/path candidates;
3. combines lists with reciprocal-rank fusion (RRF);
4. reranks deterministically using title, path, and term-proximity signals;
5. returns bounded excerpts with ranking and provenance evidence.

This is bounded indexing and retrieval, not LLM summarization. Search does not add execution output to the maintained documentation graph automatically.

## Structural Ingestion

Local `index` accepts one regular text file up to **25 MiB**. Directory ingestion is not supported.

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

HTML is handled as bounded untrusted text; the package does not claim rich HTML extraction. These controls provide application-level URL and address validation, not a network namespace or process sandbox.

## Diagnostics And Deletion

`doctor` performs local, read-only checks for:

- the minimum Node.js runtime;
- project and storage-path readiness;
- SQLite FTS5 with the Porter tokenizer;
- compatibility of an existing context database schema;
- current store statistics when supplied;
- the configured strict fetch policy.

Doctor does not create the database, execute commands, contact npm or other networks, migrate schemas, repair configuration, or install upgrades.

`purge` permanently deletes indexed data only when `confirm: true` is supplied with exactly one selector: scope, session ID, or source ID.

## Project Workflow Boundaries

The MCP server also exposes bounded project load, graph impact, and initializer services. Project initialization defaults to dry-run and requires both `dryRun: false` and `confirmWrite: true` before writing.

Claude Code and Codex adapter hooks may tell the model to call these MCP tools and retry a denied operation. Hooks do not transform an ordinary host shell call into an MCP call. Pi retains its native project-memory lifecycle and calls the shared runtime directly.

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
