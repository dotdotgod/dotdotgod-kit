# Context Execution Verification

## Automated Coverage

`packages/context/test/context.test.mjs` covers the existing end-to-end contracts:

- bounded overlapping generic chunks;
- FTS5 indexing, ranked search, scope filters, and source purge;
- small direct output and large indexed output;
- ordered single/multi execute results under concurrency, required arrays, and rejection of old inputs;
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
- `directory-ingestion.test.mjs`: external directory/file access, symlinks, special files, deterministic filters, cancellation, replacement checks, and every traversal budget;
- `html-normalize.test.mjs`: structural extraction, active/hidden content removal, MIME/charset policy, malformed input, and UTF-8 byte bounds.

`packages/context/test/mcp.test.mjs` starts the real stdio server and verifies:

- MCP initialization succeeds;
- `tools/list` exposes the complete context and project workflow surface;
- a structured tool call succeeds without protocol stdout corruption.

`packages/context/test/adapters.test.mjs` starts both Claude Code and Codex MCP wrappers from working directories outside their plugin directories and verifies the complete context, project-workflow, session, ingestion-job, healing, and doctor tool surface.

`packages/context/test/adapter-packaging.test.mjs` packs and extracts both adapters outside workspace dependency ancestry, audits links and local-path leakage, blocks runtime package-manager/network commands, executes valid and malformed hook input, initializes MCP, lists the complete tool surface, calls project load, executes the packaged CLI entry, and reports compressed and unpacked sizes.

Pi verification covers alias-free MCP registration, envelopes and nested calls. The host owns child lifecycle and cancellation. Shared state coverage uses packages/context/test/impact-state.test.mjs.

## Pi Native And Codemode Workflows

- `packages/pi/test/context-workflow.test.ts` exercises MCP tools through public Pi SDK sessions: small direct auto output, large auto/indexed retention and source search, file ingestion without raw bytes, source/scope isolation, no-match, discard, nonzero diagnostics, timeout, and policy-blocked calls.
- `packages/pi/test/context-codemode.test.ts` runs real codemode scripts through the same SDK: MCP tool/namespace discovery, envelope access, execute/index/search chaining, bounded final projections, namespace guidance, nonzero/no-match/malformed JSON distinctions, nested hook calls, policy rejection, and active-child abort.
- `test/support/context-workflow.ts` uses an isolated loader, real host MCP extension, in-memory session and faux stream. No paid model or ambient settings are needed. The fixture explicitly awaits the MCP shutdown hook because SDK dispose alone does not dispatch it.
- `context-tools.test.ts`: automatic-load retry, exactly-once completion, compact narrative, baseline routing and Help guidance.
- Development Pi SDK packages are pinned to `1.0.0`. Tests use public APIs, not a globally installed path. Existing extension tests remain required migration checks.
- Deterministic streams prove workflow and guidance delivery, not actual model adoption. Evaluate real native/codemode tool choices separately with matched baseline/revised prompts, fixture answers, output-boundary measurements, and explicit model/settings records.

```bash
node --test --experimental-strip-types packages/pi/test/context-workflow.test.ts packages/pi/test/context-codemode.test.ts
```

## Opt-In Model Selection Evaluation

`packages/pi/scripts/evaluate-context-tools.mjs` runs four disposable fixture tasks per invocation using the configured model and available credentials. It is not a CI test and may incur model usage charges. Supply `baseline|revised`, `native|codemode`, and repetition `1|2`; eight invocations cover 32 trials. It requires the ignored task baseline captures, uses isolated session settings, and never enables codemode globally. Raw local artifacts are written under `.dotdotgod/context/evaluation/`.

Compare eligible command selection, source-scoped retrieval, fixture-answer correctness, and outer model-visible result bytes. Inner codemode results are not model-visible bytes. Baseline/revised trials use the same upgraded SDK, host-managed MCP transport, current names/envelopes, and model; guidance is the changed condition. Historical captures are not rewritten or directly comparable to this transport. Small samples and sequential conditions do not establish guaranteed adoption, causality, token savings, or improved correctness. Failed retrieval must not be interpreted as absent diagnostics.

## Failure Search Recovery

`packages/context/test/search-recovery.test.mjs` checks middle failure retrieval and filtered, bounded `*` browsing. Public Pi tests check native/codemode calls and prompt guidance. See [recovery contract and cases](../spec/CONTEXT_SEARCH_RECOVERY.md); excerpts never prove absent diagnostics.

## Required Regression Cases

- `packages/context/test/retention.test.mjs`: fixed-day boundaries, jobs and migration.

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
- hook recursion bypass, retry cap, unsupported-tool gaps, stable state routing across differing or missing cwd values, declared-root precedence, same-session cross-project isolation, canonical-root impact paths, project-external scratchpad pruning, acknowledgement-based impact clearing, failure warning without retry loops, and re-edit gating after impact acknowledgement;
- packed Claude/Codex focused Load without ancestor `node_modules`, including bounded query degradation without `ERR_MODULE_NOT_FOUND`, failed-Load gate retention, successful Load plus direct PostToolUse runtime clearance, and Claude matcher coverage for plugin-qualified MCP tool names.

## Manual Adapter Verification

Follow [`manual-smoke/CROSS_AGENT_ADAPTERS.md`](manual-smoke/CROSS_AGENT_ADAPTERS.md).

Verify Claude/Codex outside the plugin directory and with varying hook cwd values. Confirm Load clears the original root's denial state, MCP starts, hooks respect host trust, and large output is indexed. For Claude, verify actual plugin-qualified PostToolUse dispatch; direct runtime execution alone is not evidence of host dispatch.

Verify Pi's host-managed MCP connects, no forwarding aliases remain, raw Code Mode envelopes work, and shutdown reaps the child. Confirm pending impact is advisory while Plan Mode restrictions remain. Retrieved text remains data, legacy provenance remains unknown, and doctor performs no repair or network activity.

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
