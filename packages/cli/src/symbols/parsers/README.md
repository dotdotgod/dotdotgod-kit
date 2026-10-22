# Patched TypeScript Grammars

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
pnpm run generate
```

Docker builds use emscripten/emsdk:4.0.4. Other language grammars and the runtime
remain supplied by @vscode/tree-sitter-wasm 0.3.1. Runtime and grammar hashes
participate in outline cache identity; adapters copy these same patched assets.
