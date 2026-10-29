// Explicit regeneration: requires tree-sitter-cli 0.25.10 and emsdk 4.0.4 (or Docker).
// Input is an extracted tree-sitter-c-sharp 0.23.5 npm package. Never patch node_modules.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { patchCsharpGrammar } from '../packages/cli/src/symbols/csharp-contextual-grammar.mjs';

const source = resolve(process.argv[2]);
const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
if (metadata.name !== 'tree-sitter-c-sharp' || metadata.version !== '0.23.5') throw new Error('Expected tree-sitter-c-sharp 0.23.5.');
const cli = process.env.TREE_SITTER_CLI ?? 'tree-sitter';
const grammar = join(source, 'grammar.js');
writeFileSync(grammar, patchCsharpGrammar(readFileSync(grammar, 'utf8')));
execFileSync(cli, ['generate'], { cwd: source, stdio: 'inherit' });
execFileSync(cli, ['build', '--wasm', ...(process.argv.includes('--docker') ? ['--docker'] : [])], { cwd: source, stdio: 'inherit' });
const target = resolve('packages/cli/src/symbols/parsers');
mkdirSync(target, { recursive: true });
copyFileSync(join(source, 'tree-sitter-c_sharp.wasm'), join(target, 'tree-sitter-c-sharp.wasm'));
copyFileSync(join(source, 'LICENSE'), join(target, 'CSHARP_LICENSE'));
