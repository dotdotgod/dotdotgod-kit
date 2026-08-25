# Context Execution Verification

## Automated Coverage

`packages/context/test/context.test.mjs` covers the existing end-to-end contracts:

- bounded overlapping generic chunks;
- FTS5 indexing, ranked search, scope filters, and source purge;
- small direct output and large indexed output;
- ordered batch results under concurrency;
- file processing without returning source bytes;
- destructive purge selector validation.

Focused hardening suites cover:

- `chunks.test.mjs`: Markdown headings/fences, JSON key paths, deterministic fallback, depth policy, Unicode, and UTF-8 byte bounds;
- `provenance.test.mjs`: hashes, operation-owned trust, spoof prevention, malformed metadata, and legacy defaults;
- `rank.test.mjs`: normalized terms, RRF, deterministic ties, title/path coverage, proximity, and bounded explanations;
- `safe-fetch.test.mjs`: URL/address policy, every DNS answer, redirects, wire/decoded limits, MIME/encoding rejection, timeout, and abort;
- `doctor.test.mjs`: no-network read-only checks, existing schema inspection, and incompatible schema failure without repair;
- `package-audit.test.mjs`: package exports, declared files, license, and absence of a `context-mode` dependency or known copied artifact;
- `store-operations.test.mjs`: WAL, busy timeout, reopen, concurrent access, transactional failure rollback, incompatible/corrupt databases, and privacy-safe statistics;
- `environment-policy.test.mjs`: platform-specific reserved variables, overrides, deletion, validation, deterministic metadata, and value secrecy;
- `directory-ingestion.test.mjs`: containment, symlinks, special files, deterministic filters, cancellation, replacement checks, and every traversal budget;
- `html-normalize.test.mjs`: structural extraction, active/hidden content removal, MIME/charset policy, malformed input, and UTF-8 byte bounds.

`packages/context/test/mcp.test.mjs` starts the real stdio server and verifies:

- MCP initialization succeeds;
- `tools/list` exposes the complete context and project workflow surface;
- a structured tool call succeeds without protocol stdout corruption.

`packages/context/test/adapters.test.mjs` starts both Claude Code and Codex MCP wrappers from working directories outside their plugin directories and verifies the complete context, project-workflow, session, ingestion-job, healing, and doctor tool surface.

`packages/context/test/adapter-packaging.test.mjs` packs and extracts both adapters outside workspace dependency ancestry, audits links and local-path leakage, blocks runtime package-manager/network commands, executes valid and malformed hook input, initializes MCP, lists the complete tool surface, calls project load, executes the packaged CLI entry, and reports compressed and unpacked sizes.

Pi typecheck and adapter package verification cover native imports, generated MCP/hook runtime drift, hook resources, manifests, and package allowlists. Pi keeps direct native context bindings, including the read-only doctor, rather than starting a context MCP child.

## Required Regression Cases

Add or preserve focused cases for:

- nonzero exit, spawn failure, timeout, abort, process-group cleanup, and identical environment policy across command/batch/file execution;
- stdout/stderr identity, Unicode, huge lines, binary-like bytes, JSON, logs, and Markdown;
- automatic direct/indexed threshold and response-size bound;
- concurrent session/project isolation, bounded SQLite busy behavior, atomic expiry/purge, and reopen compatibility;
- TTL expiry and scoped purge;
- legacy provenance defaults, trust spoof prevention, and non-authoritative search rendering;
- scope/session/source filtering before ranking fusion;
- Markdown/JSON deterministic structural chunking and byte bounds;
- directory root escape, symlink defaults, replacement races, special files, cancellation, deterministic filters, and aggregate limits;
- HTML active/hidden content, malformed input, MIME/charset, deterministic output, and preserved external-untrusted provenance;
- URL protocols, credentials, blocked IPv4/IPv6 classes, all DNS answers, socket peer checks, and redirects;
- HTTP errors, MIME/encoding rejection, timeout, abort, wire limits, and decompressed limits;
- doctor no-network/no-repair behavior and schema compatibility;
- initializer dry-run default and explicit write confirmation;
- project-load query and project-impact 20-path bound;
- hook recursion bypass, retry cap, stale fingerprint, unsupported-tool gaps, stable state routing across differing or missing cwd values, declared-root precedence, same-session cross-project isolation, and canonical-root fingerprints;
- packed Claude/Codex focused Load without ancestor `node_modules`, including bounded query degradation without `ERR_MODULE_NOT_FOUND`, failed-Load gate retention, successful Load plus direct PostToolUse runtime clearance, and Claude matcher coverage for plugin-qualified MCP tool names.

## Manual Adapter Verification

Follow [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Verify Claude Code and Codex from working directories different from the installed plugin path. Within one session, also vary project-relative hook cwd values and confirm a successful load clears the original root's denial state. Confirm the local MCP server starts, hooks follow host trust rules, large output is indexed without appearing in full, and denial messages lead to a successful MCP call followed by retry. For Claude, do not treat direct `runtime.mjs posttooluse` execution as proof of host dispatch: use an installed plugin and confirm the plugin-qualified Load tool triggers the configured PostToolUse matcher before the retry succeeds.

Verify Pi registers native tools and does not start a dotdotgod MCP child process. Confirm search output marks retrieved text as data with no instruction authority, existing database records surface safe `unknown` defaults, and doctor performs no repair or network activity.

Safe-fetch integration tests must use controlled fixtures with an explicit private-network test override. Production defaults must continue to reject private and reserved destinations.

## Phase 3 Regression Coverage

Automated coverage verifies typo retrieval with SQL scope filtering, migration ledger idempotence, restart job recovery, explicit backup-before-heal, durable job completion, allowlist name-only reporting, opaque session validation, absent-by-default renderer behavior, rendered byte limits, and untrusted provenance. MCP and Pi registration tests verify tool/schema parity.

## Commands

```bash
pnpm --filter @dotdotgod/context verify
pnpm --filter @dotdotgod/pi verify
pnpm --filter @dotdotgod/claude-code verify
pnpm --filter @dotdotgod/codex verify
pnpm run verify:generated
node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index
pnpm run pack:dry-run
```
