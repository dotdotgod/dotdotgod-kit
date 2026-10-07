# Code Outline Query Verification

## Automated Coverage

Run node --test packages/cli/test/symbol-query.test.mjs for parser-backed fixtures
and pnpm --filter @dotdotgod/pi run test for focused-load formatting regressions.

The source fixtures exercise named functions/documents in 13 grammar routes,
class/method ownership, TS overloads, JS accessors/arrows, original comment tags,
Python literal versus formatted strings, Unicode/CRLF offsets and malformed syntax.
Grammar availability is not proof of every language feature; add fixtures before
expanding the documented supported-form matrix.

Retrieval checks cover full documentation-body keywords, same-file multiple methods,
body exclusion, deterministic vectors, keyword-only independence, hybrid failure
warnings, exact-name ranking and explicit remote-code consent. Existing documentation
vector and graph-impact tests retain their document-first internal APIs.

Freshness tests cover missing/invalid caches, source addition/edit/deletion, line-only
and body-only vector reuse, zero-symbol files, extractor identity, Gitignore policy,
unsupported languages and source symlink containment. CLI index/validate subprocesses
assert stale-outline JSON errors, unchanged plain validation and no cache repair.
Pi format tests preserve symbol location/type and vector retrieval warnings.

## Clean Checkout And Distribution

After pnpm install, run pnpm run generate to materialize ignored parser binaries.
Then pnpm run verify and pnpm run pack:dry-run:packages verify code, generated drift
and package contents. Assets come from installed pinned dependencies, not runtime
language-server/model installation. Adapter parser folders carry upstream licenses.

For an installed-plugin check, pack/extract outside the workspace dependency ancestry
and run its mcp/cli.mjs index/query --search keyword against a disposable JS/TS/Python
repository without node_modules. Test code-symbol results and validate --check-index,
then edit source and confirm stale validation without a cache write.

## Measurement

Measure cold/warm outline extraction, parsed/reused counts, symbol count, metadata
response bytes and source-body bytes separately. Do not call byte reductions token
measurements, compare unlike corpus sizes without naming the fixture, or infer real
semantic relevance from a deterministic test embedder. No real-model installation
or remote code disclosure is authorized solely by running this test suite.

Contracts: ../spec/cli/QUERY.md and ../spec/cli/CODE_OUTLINES.md.
