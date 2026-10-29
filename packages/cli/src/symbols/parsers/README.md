# Pinned Parser Grammars

## TypeScript And TSX

TypeScript and TSX WASM are generated from tree-sitter-typescript 0.23.2
(npm integrity sha512-e04JUUKxTT53/x3Uq1zIL45DoYKVfHH4CZqwgZhPg5qYROl5nQjV+85ruFzFGZxu+QeFVbRTPDRnqL9UbU4VeA==),
with tree-sitter-javascript 0.23.1, tree-sitter-cli 0.25.10, and emsdk 4.0.4.
The MIT license is retained as TYPESCRIPT_LICENSE.

The small source patch in ../typescript-import-grammar.mjs adds import types as
primary types and typeof operands with their own conflict/precedence handling.
It fixes generic typeof-import calls and qualified import-type arrays without
changing application text or hiding tree-sitter error nodes.

To regenerate, extract the pinned npm grammar into a disposable directory, install
its exact JavaScript dependency without lifecycle scripts
(`npm install --ignore-scripts --omit=dev --no-package-lock tree-sitter-javascript@0.23.1`), then run from checkout:

```sh
TREE_SITTER_CLI=/path/to/tree-sitter-0.25.10 node scripts/build-typescript-parsers.mjs /path/to/extracted/package --docker
```

## C#

C# WASM is generated from tree-sitter-c-sharp 0.23.5
(npm integrity sha512-xJGOeXPMmld0nES5+080N/06yY6LQi+KWGWV4LfZaZe6srJPtUtfhIbRSN7EZN6IaauzW28v6W4QHFwmeUW6HQ==),
with tree-sitter-cli 0.25.10 and emsdk 4.0.4. Its MIT license is retained as
CSHARP_LICENSE. The source tarball is
https://registry.npmjs.org/tree-sitter-c-sharp/-/tree-sitter-c-sharp-0.23.5.tgz.

This grammar recognizes collection expressions, including empty and spread forms.
The small ../csharp-contextual-grammar.mjs patch adds required to the grammar's
contextual identifier choice: it remains a member modifier but can also name a
pattern variable used as required[i]. No application text or parse errors are
rewritten. Extract the pinned npm tarball into a fresh disposable directory:

```sh
TREE_SITTER_CLI=/path/to/tree-sitter-0.25.10 node scripts/build-csharp-parser.mjs /path/to/extracted/package --docker
```

## Runtime And Distribution

Docker builds use emscripten/emsdk:4.0.4. Other language grammars and the runtime
remain supplied by @vscode/tree-sitter-wasm 0.3.1. Runtime and grammar hashes
participate in outline cache identity. Changing extraction behavior also bumps
EXTRACTOR_ID. Adapter generation must copy the same overrides and licenses before
packaging; the regeneration scripts above do not rebuild adapters.

These are syntax grammars, not C# compiler validation. For example, the upstream
grammar accepts a standalone range expression [..] as a collection element even
though the compiler rejects it. Genuine tree-sitter ERROR/missing nodes still
produce partial status; other unsupported/new forms can remain incomplete.
