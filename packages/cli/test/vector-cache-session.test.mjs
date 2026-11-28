import test from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import { buildVectorIndex } from '../src/commands/query.mjs';
import { projectLoad } from '../src/context/project.mjs';
import { readPreparedVectorSnapshot, vectorCacheSession } from '../src/query/cache-session.mjs';
import { DEFAULT_EMBEDDING_PROFILE, embeddingProfileIdentity } from '../src/query/embedding-config.mjs';
import { profileFingerprint } from '../src/query/store.mjs';
import { openReadOnly } from '../src/storage/index-store.mjs';

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
    const committed = (corpus) => {
      const db = openReadOnly(root);
      try { return db.sql('SELECT fingerprint FROM corpus_fingerprints WHERE corpus=?').all(corpus).map(({ fingerprint }) => fingerprint); }
      finally { db.close(); }
    };
    assert.deepEqual(committed('code'), []);
    assert.deepEqual(committed('docs'), ['docs']);
    const many = Array.from({ length: 20 }, (_, i) => chunk(`new-${i}`));
    let batches = 0;
    await assert.rejects(build(many, ['docs'], { embed: async (texts) => { if (++batches === 2) throw new Error('interrupted'); return embed(texts); } }), /interrupted/);
    const resumed = await build(many, ['docs']);
    assert.equal(resumed.manifest.embedded, 4);
    assert.equal(resumed.manifest.diagnostics.corpora.docs.recovered, 16);
    assert.equal(committed('docs').length, 20);
    assert.equal(existsSync(join(root, '.dotdotgod/vectors/snapshots.json')), false);
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
    assert.equal(rebuilt.manifest.diagnostics.reason, 'valid'); // A stale/corrupt legacy export cannot override SQLite.
    assert.equal(rebuilt.manifest.embedded, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function preparedFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'prepared-vector-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cache = join(root, '.dotdotgod');
  const dir = join(cache, 'vectors');
  const snapshot = join(dir, 'snapshots.json');
  const lock = join(dir, 'build.lock');
  mkdirSync(dir, { recursive: true });
  const identity = embeddingProfileIdentity(DEFAULT_EMBEDDING_PROFILE);
  const current = { ...chunk('current'), text: 'current metadata' };
  const row = { chunk: { ...current, text: 'stale metadata' }, vector: [1, 0] };
  const state = { schema: 1, profile: profileFingerprint(identity), dimensions: 2, docs: [row], code: [], pending: [row] };
  return { root, cache, dir, snapshot, lock, identity, current, row, state,
    write: (data) => writeFileSync(snapshot, JSON.stringify(data)),
    read: () => readPreparedVectorSnapshot(root, identity, [current], ['docs']) };
}

test('prepared reader only accepts compatible committed rows and uses current metadata', (t) => {
  const { dir, snapshot, lock, state, row, current, read, write } = preparedFixture(t);
  const assertReason = (reason) => assert.deepEqual(read(), { ready: false, reason });
  for (const file of ['manifest.json', 'chunks.jsonl', 'embeddings.f32']) writeFileSync(join(dir, file), 'legacy sentinel');
  assertReason('missing');
  writeFileSync(snapshot, '{broken');
  assertReason('corrupt');
  writeFileSync(lock, 'malformed lock');
  assertReason('build-in-progress');
  assert.equal(readFileSync(lock, 'utf8'), 'malformed lock');
  rmSync(lock);
  for (const [override, reason] of [
    [{ schema: 2 }, 'schema-mismatch'], [{ profile: 'other' }, 'profile-mismatch'],
    [{ dimensions: 0 }, 'corrupt'], [{ docs: [{ ...row, vector: [0.5, 0] }] }, 'corrupt'],
    [{ docs: [{ ...row, vector: [null, 0] }] }, 'corrupt'], [{ docs: [] }, 'empty'],
    [{ docs: [], code: [row] }, 'empty'],
  ]) {
    write({ ...state, ...override });
    assertReason(reason);
  }
  write({ ...state, pending: { invalid: true } });
  assert.deepEqual(read(), { ready: true, chunks: [current], vectors: new Float32Array([1, 0]), manifest: { dimensions: 2 } });
});

test('prepared reader refuses symlinks and rechecks the lock after one snapshot read', (t) => {
  for (const key of ['cache', 'dir', 'snapshot', 'lock']) {
    const fixture = preparedFixture(t);
    rmSync(fixture[key], { recursive: true, force: true });
    symlinkSync(join(fixture.root, 'missing-target'), fixture[key]);
    assert.deepEqual(fixture.read(), { ready: false, reason: 'unusable' }, key);
  }
  const { snapshot, lock, state, read, write } = preparedFixture(t);
  write(state);
  const realRead = fs.readFileSync;
  const tracked = t.mock.method(fs, 'readFileSync', (path, options) => {
    const text = realRead(path, options);
    if (path === snapshot) writeFileSync(lock, 'writer appeared');
    return text;
  });
  syncBuiltinESMExports();
  try {
    assert.deepEqual(read(), { ready: false, reason: 'build-in-progress' });
    assert.deepEqual(tracked.mock.calls.map(({ arguments: [path] }) => path), [snapshot]);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('focused Load returns keywords before releasing a live writer barrier', async (t) => {
  const { root, dir, snapshot, lock, identity, state, write } = preparedFixture(t);
  write(state);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/README.md'), '# Fixture keyword');
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ embedding: DEFAULT_EMBEDDING_PROFILE }));
  const entered = Promise.withResolvers();
  const barrier = Promise.withResolvers();
  const writer = vectorCacheSession(root, identity, async () => {
    entered.resolve();
    await barrier.promise;
  });
  const timer = new AbortController();
  try {
    await entered.promise;
    const cacheState = () => [lock, snapshot].map((path) => {
      const { ino, mtimeMs } = lstatSync(path);
      return [ino, mtimeMs, readFileSync(path, 'utf8')];
    });
    const before = cacheState();
    const outcome = await Promise.race([
      projectLoad({ root, focus: 'keyword' }),
      sleep(1500, null, { signal: timer.signal }).then(() => assert.fail('reader waited on writer')),
    ]);
    assert.deepEqual(outcome.query.results.map(({ retrieval }) => retrieval), [['keyword']]);
    assert.match(outcome.query.warnings[0], /build-in-progress/);
    assert.equal(outcome.vectorUnavailable, undefined);
    assert.deepEqual(cacheState(), before);
    assert.deepEqual(fs.readdirSync(dir), ['build.lock', 'snapshots.json']);
    assert.equal(fs.existsSync(join(root, '.dotdotgod/outlines.json')), false);
  } finally {
    timer.abort();
    barrier.resolve();
    await writer;
  }
});
