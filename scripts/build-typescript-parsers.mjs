// Explicit regeneration: requires tree-sitter-cli 0.25.10 and emsdk 4.0.4 (or Docker).
// Input is an extracted tree-sitter-typescript 0.23.2 npm package with its
// tree-sitter-javascript 0.23.1 dependency installed. Never patch node_modules.
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { patchTypescriptGrammar } from '../packages/cli/src/symbols/typescript-import-grammar.mjs';

const source = resolve(process.argv[2]);
const cli = process.env.TREE_SITTER_CLI ?? 'tree-sitter';
const grammar = join(source, 'common/define-grammar.js');
writeFileSync(grammar, patchTypescriptGrammar(readFileSync(grammar, 'utf8')));
const target = resolve('packages/cli/src/symbols/parsers');
mkdirSync(target, { recursive: true });
for (const language of ['typescript', 'tsx']) {
  const cwd = join(source, language);
  execFileSync(cli, ['generate'], { cwd, stdio: 'inherit' });
  execFileSync(cli, ['build', '--wasm', ...(process.argv.includes('--docker') ? ['--docker'] : [])], { cwd, stdio: 'inherit' });
  copyFileSync(join(cwd, `tree-sitter-${language}.wasm`), join(target, `tree-sitter-${language}.wasm`));
}
copyFileSync(join(source, 'LICENSE'), join(target, 'TYPESCRIPT_LICENSE'));
