# Code Outline Index

## Ownership

Existing index refreshes code outlines and merges parsed declarations/containment
and static import evidence into the graph. Query also refreshes outlines when its
scope includes code. The synchronous buildIndex API consumes only matching cached
outlines; it does not launch an async parser. No language server/config registry,
editor installation, Ctags fallback or automatic summary is required.

Metadata is stored in ignored .dotdotgod/outlines.json with schema, extractor,
effective policy, per-file hashes/status, declarations/imports and refresh counts.
Zero-symbol parsed files remain explicit records. Source changes during parsing
abort the refresh. Changed/deleted records are replaced/removed; unchanged successful
records reuse extraction. Partial parses retry and are reported as incomplete.

## Parser And Coverage

The pinned @vscode/tree-sitter-wasm 0.3.1 MIT distribution supplies the runtime and
grammars. CLI uses it as a production dependency; generated adapter CLI runtimes
include local parser assets/license so extracted plugins need no node_modules.
The pack is about 2.1 MB compressed / 22.1 MB expanded. No runtime grammar download.

Verified grammar routes: JavaScript/JSX, TypeScript, TSX, Python, Go, Rust, Java,
Ruby, PHP, C#, C++, Bash and PowerShell. Other recognized source extensions are
recorded as unsupported, including C, Swift, Kotlin, Lua and Scala. This is not
universal language support or a claim of compiler-level cross-language resolution.

Extraction matches named declaration node forms: functions/methods, classes and
selected interfaces/structs/enums/namespaces, constructors, JS method accessors and
JS/TS named arrow-function variables/fields. Support depends on each grammar's
node fields. Anonymous callbacks, inferred types and arbitrary computed names are
not a general naming/semantic resolution feature. Per-language fixture coverage
must be expanded before promising further forms.

Documentation uses declaration-adjacent comments, requiring doc-style markers for
JS/TS/TSX, Java, PHP, C# and C++. Python uses the first body string expression.
Go/Rust/Ruby/shell comments follow syntactic attachment rules. No IDE hover parity,
inherited docs or generated descriptions; raw comment tags/examples are retained.

## Metadata And Relationships

Each symbol records ID, kind/name/qualified name/owner, language/path, signature,
original documentation, declaration/comment start, declaration start/end and
optional body start/end (one-based inclusive), plus zero-based UTF-16 declaration/
body offsets with exclusive ends for inline declarations. IDs incorporate path, name, kind,
signature fingerprint and duplicate occurrence, not line number alone.

Search passages contain metadata/comments only; nested default-callback bodies
inside declaration headers are replaced by an explicit ellipsis, not inferred types.
Qualified names reflect captured syntax containers, not compiler-resolved namespaces.
A body edit or line shift changes
source identity; an unchanged signature/comment passage can retain its vector.
Callers must compare source hashes before using saved ranges to read implementation.

Graph edges are declares_symbol, contains_symbol and imports. Relative file imports
resolve only against eligible indexed paths with documented JS/TS extension/index
candidates; aliases, external modules, dynamic imports and other ambiguous forms
remain unresolved. An import is never a call. Unresolved import nodes retain syntax
and source location. Reexport source syntax is recorded when the grammar supplies it.

## Discovery And Validation

Reuse configured memory-area source discovery with extra secret/hidden/generated
checks, Gitignore rules (including non-Git projects), and realpath containment.
Do not follow file symlinks outside or inside the repository. Existing source
index collection still determines eligible extensions; binary/vendor/cache bodies
are not embedded. Generated-header files are excluded from outlines.

validate --check-index additionally checks applicable outline cache integrity,
source addition/change/deletion, policy and extractor identities. Plain validate
is unchanged. Unsupported language records produce warnings; partial/failed
extraction and stale/missing/corrupt caches produce actionable non-zero errors.
No parsing, embeddings, model downloads, cache mutation or LSP startup in validation.
Runtime/grammar bytes are fingerprinted without loading a parser; extraction rules
and extension mappings join the policy identity. Rule behavior changes require a new
extractor identity; vector profile
freshness is separate from outline metadata freshness.

## Traceability



<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->
<!-- generated: do not edit manually -->

### Traceability Links

- Implemented by:
  - [packages/cli/src/symbols/languages.mjs](../../../packages/cli/src/symbols/languages.mjs)
  - [packages/cli/src/symbols/runtime.mjs](../../../packages/cli/src/symbols/runtime.mjs)
  - [packages/cli/src/symbols/parser.mjs](../../../packages/cli/src/symbols/parser.mjs)
  - [packages/cli/src/symbols/discovery.mjs](../../../packages/cli/src/symbols/discovery.mjs)
  - [packages/cli/src/symbols/store.mjs](../../../packages/cli/src/symbols/store.mjs)
  - [packages/cli/src/symbols/graph.mjs](../../../packages/cli/src/symbols/graph.mjs)
  - [packages/cli/src/index/cache.mjs](../../../packages/cli/src/index/cache.mjs)
  - [packages/cli/src/validate/run.mjs](../../../packages/cli/src/validate/run.mjs)
  - [scripts/build-adapter-runtime.mjs](../../../scripts/build-adapter-runtime.mjs)
- Verified by:
  - [packages/cli/test/symbol-query.test.mjs](../../../packages/cli/test/symbol-query.test.mjs)
- Related docs:
  - [docs/spec/cli/QUERY.md](QUERY.md)
  - [docs/spec/LOAD_PROJECT.md](../LOAD_PROJECT.md)
- Design decisions:
  - [docs/arch/CROSS_AGENT_ARCHITECTURE.md](../../arch/CROSS_AGENT_ARCHITECTURE.md)

<!-- dotdotgod:traceability-links:end -->

```json dotdotgod
{"kind":"spec","implementedBy":["packages/cli/src/symbols/languages.mjs","packages/cli/src/symbols/runtime.mjs","packages/cli/src/symbols/parser.mjs","packages/cli/src/symbols/discovery.mjs","packages/cli/src/symbols/store.mjs","packages/cli/src/symbols/graph.mjs","packages/cli/src/index/cache.mjs","packages/cli/src/validate/run.mjs","scripts/build-adapter-runtime.mjs"],"verifiedBy":["packages/cli/test/symbol-query.test.mjs"],"relatedDocs":["docs/spec/cli/QUERY.md","docs/spec/LOAD_PROJECT.md"],"designDecisions":["docs/arch/CROSS_AGENT_ARCHITECTURE.md"]}
```
