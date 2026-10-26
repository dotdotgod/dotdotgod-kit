import test from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildVectorIndex } from '../src/commands/query.mjs';

const chunk = (fingerprint, kind = 'document') => ({ fingerprint, kind, id: fingerprint, path: fingerprint, passage: fingerprint });
test('scope snapshots preserve other corpora, prune empty corpora and recover batches', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vector-session-'));
  let calls = 0;
  const embed = async (texts) => { calls += texts.length; return texts.map(() => [1, 0]); };
  const build = (chunks, corpora, extra = {}) => buildVectorIndex(root, { embed, chunks, corpora, ...extra });
  try {
    const docs = [chunk('docs')]; const code = [chunk('code', 'symbol')];
    await build([...docs, ...code], ['docs', 'code']);
    await build(docs, ['docs']);
    const all = await build([...docs, ...code], ['docs', 'code']);
    assert.equal(all.manifest.embedded, 0); assert.equal(calls, 2);
    await build([], ['code']);
    const state = JSON.parse(readFileSync(join(root, '.dotdotgod/vectors/snapshots.json')));
    assert.equal(state.code.length, 0); assert.equal(state.docs.length, 1);
    const many = Array.from({ length: 20 }, (_, i) => chunk(`new-${i}`));
    let batches = 0;
    await assert.rejects(build(many, ['docs'], { embed: async (texts) => { if (++batches === 2) throw new Error('interrupted'); return embed(texts); } }), /interrupted/);
    const resumed = await build(many, ['docs']);
    assert.equal(resumed.manifest.embedded, 4);
    assert.equal(resumed.manifest.diagnostics.corpora.docs.recovered, 16);
    assert.equal(JSON.parse(readFileSync(join(root, '.dotdotgod/vectors/snapshots.json'))).docs.length, 20);
    const simultaneous = [chunk('concurrent')];
    const results = await Promise.all([build(simultaneous, ['docs']), build(simultaneous, ['docs'])]);
    assert.deepEqual(results.map((result) => result.manifest.embedded), [1, 0]);
    const moduleUrl = new URL('../src/commands/query.mjs', import.meta.url).href;
    const script = `import { buildVectorIndex } from ${JSON.stringify(moduleUrl)};
      const result = await buildVectorIndex(${JSON.stringify(root)}, { chunks: [${JSON.stringify(chunk('multiprocess'))}], corpora: ['docs'], embed: async texts => { await new Promise(resolve => setTimeout(resolve, 150)); return texts.map(() => [1,0]); } });
      console.log(result.manifest.embedded);`;
    const child = () => new Promise((resolve, reject) => {
      const process = spawn('node', ['--input-type=module', '-e', script]);
      let output = ''; let errors = '';
      process.stdout.on('data', (data) => { output += data; });
      process.stderr.on('data', (data) => { errors += data; });
      process.on('error', reject);
      process.on('exit', (code) => code === 0 ? resolve(Number(output.trim())) : reject(new Error(errors)));
    });
    assert.deepEqual((await Promise.all([child(), child()])).sort(), [0, 1]);
    writeFileSync(join(root, '.dotdotgod/vectors/snapshots.json'), '{broken');
    const rebuilt = await build([chunk('fresh')], ['docs']);
    assert.equal(rebuilt.manifest.diagnostics.reason, 'corrupt');
    assert.equal(rebuilt.manifest.embedded, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
