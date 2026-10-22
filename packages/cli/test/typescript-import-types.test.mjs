import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { extractSymbols } from '../src/symbols/parser.mjs';
import { buildOutlines, outlineStatus } from '../src/symbols/store.mjs';

for (const language of ['typescript', 'tsx']) {
  test(`${language} import types parse without suppressing real syntax errors`, async () => {
    const source = `/** Load module. */
export async function load() {
  return original<typeof import('./module')>();
}
export interface Options {
  records?: import('./module').Record[];
  nested?: import('./module').Types.Record<string>[];
}
type Module = typeof import('./module');
const dynamic = import('./module');
`;
    const result = await extractSymbols(`example.${language === 'tsx' ? 'tsx' : 'ts'}`, source, language);
    assert.equal(result.status, 'parsed');
    const load = result.symbols.find(symbol => symbol.name === 'load');
    assert.equal(load.declarationStartLine, 2);
    assert.equal(load.endLine, 4);
    assert.ok(!load.signature.includes('original'));
    const options = result.symbols.find(symbol => symbol.name === 'Options');
    assert.ok(options);
    assert.equal(options.declarationStartLine, 5);
    for (const invalid of ["const x = original<typeof import('./module')>(;", "interface X { records?: import('./module').Record[; }", 'function broken( {']) {
      assert.equal((await extractSymbols('bad.ts', invalid, language)).status, 'partial');
    }
  });
}

test('nineteen import-type fixtures index without exclusions and remain fresh on reuse', async () => {
  const root = mkdtempSync(join(tmpdir(), 'typescript-import-'));
  try {
    mkdirSync(join(root, 'src'));
    for (let i = 0; i < 18; i++) writeFileSync(join(root, `src/test${i}.${i % 2 ? 'tsx' : 'ts'}`), `export function test${i}() { return original<typeof import('./module')>(); }`);
    writeFileSync(join(root, 'src/types.ts'), "export interface Options { records?: import('./module').Record[]; }");
    const index = await buildOutlines(root);
    assert.equal(index.files.length, 19);
    assert.ok(index.files.every(file => file.status === 'parsed'));
    assert.equal(outlineStatus(root).ok, true);
    assert.equal((await buildOutlines(root)).refresh.reused, 19);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
