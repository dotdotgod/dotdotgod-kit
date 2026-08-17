# Context Execution Verification

## Automated Coverage

`packages/context/test/context.test.mjs` covers the existing end-to-end contracts:

- bounded overlapping generic chunks;
- FTS5 indexing, ranked search, scope filters, and source purge;
- small direct output and large indexed output;
- ordered batch results under concurrency;
- file processing without returning source bytes;
- destructive purge selector validation.

Focused Phase 1 suites cover:

- `chunks.test.mjs`: Markdown headings/fences, JSON key paths, deterministic fallback, depth policy, Unicode, and UTF-8 byte bounds;
- `provenance.test.mjs`: hashes, operation-owned trust, spoof prevention, malformed metadata, and legacy defaults;
- `rank.test.mjs`: normalized terms, RRF, deterministic ties, title/path coverage, proximity, and bounded explanations;
- `safe-fetch.test.mjs`: URL/address policy, every DNS answer, redirects, wire/decoded limits, MIME/encoding rejection, timeout, and abort;
- `doctor.test.mjs`: no-network read-only checks, existing schema inspection, and incompatible schema failure without repair;
- `package-audit.test.mjs`: package exports, declared files, license, and absence of a `context-mode` dependency or known copied artifact.

`packages/context/test/mcp.test.mjs` starts the real stdio server and verifies:

- MCP initialization succeeds;
- `tools/list` exposes the complete context and project workflow surface;
- a structured tool call succeeds without protocol stdout corruption.

`packages/context/test/adapters.test.mjs` starts both Claude Code and Codex MCP wrappers from working directories outside their plugin directories and verifies all twelve tools plus `doctor`.

Pi typecheck and adapter package verification cover native imports, packaged MCP wrappers, hook resources, manifests, and package allowlists. Pi keeps direct native context bindings, including the read-only doctor, rather than starting a context MCP child.

## Required Regression Cases

Add or preserve focused cases for:

- nonzero exit, spawn failure, timeout, abort, and process-group cleanup;
- stdout/stderr identity, Unicode, huge lines, binary-like bytes, JSON, logs, and Markdown;
- automatic direct/indexed threshold and response-size bound;
- concurrent session/project isolation;
- TTL expiry and scoped purge;
- legacy provenance defaults, trust spoof prevention, and non-authoritative search rendering;
- scope/session/source filtering before ranking fusion;
- Markdown/JSON deterministic structural chunking and byte bounds;
- URL protocols, credentials, blocked IPv4/IPv6 classes, all DNS answers, socket peer checks, and redirects;
- HTTP errors, MIME/encoding rejection, timeout, abort, wire limits, and decompressed limits;
- doctor no-network/no-repair behavior and schema compatibility;
- initializer dry-run default and explicit write confirmation;
- project-load query and project-impact 20-path bound;
- hook recursion bypass, retry cap, stale fingerprint, and unsupported-tool gaps.

## Manual Adapter Verification

Follow [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Verify Claude Code and Codex from working directories different from the installed plugin path. Confirm the local MCP server starts, hooks follow host trust rules, large output is indexed without appearing in full, and denial messages lead to a successful MCP call followed by retry.

Verify Pi registers native tools and does not start a dotdotgod MCP child process. Confirm search output marks retrieved text as data with no instruction authority, existing database records surface safe `unknown` defaults, and doctor performs no repair or network activity.

Safe-fetch integration tests must use controlled fixtures with an explicit private-network test override. Production defaults must continue to reject private and reserved destinations.

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
