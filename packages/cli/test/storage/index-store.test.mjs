import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs, { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildVectorIndex, queryProject } from '../../src/commands/query.mjs';
import { chunkMarkdown } from '../../src/query/chunks.mjs';
import { DEFAULT_EMBEDDING_PROFILE, embeddingProfileIdentity } from '../../src/query/embedding-config.mjs';
import { graphPath, loadGraph } from '../../src/query/hnsw-index.mjs';
import { profileFingerprint, writeVectorCache } from '../../src/query/store.mjs';
import { indexPath, openReadOnly, openWriter } from '../../src/storage/index-store.mjs';
import { buildOutlines, outlinePath, readOutlines } from '../../src/symbols/store.mjs';

const fp = profileFingerprint(embeddingProfileIdentity(DEFAULT_EMBEDDING_PROFILE));
const embed = (texts) => texts.map(() => [1, 0]);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'index-store-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs')); mkdirSync(join(root, 'src'));
  const write = (path, body) => writeFileSync(join(root, path), body);
  return { root, write };
}

function snapshot(root, work) {
  const reader = openReadOnly(root);
  try { return work(reader); } finally { reader.close(); }
}

test('single-file changes update only corresponding rows and ancestor digests, skipping unchanged reads', async (t) => {
  const { root, write } = fixture(t);
  const one = 'src/first.ts'; const two = 'src/second.ts';
  write(one, 'export function first() {}');
  write(two, 'export function second() {}');
  await buildOutlines(root);
  const dump = () => snapshot(root, (db) => ({
    two: db.file(two), symbols: db.symbols(two), chunks: db.chunks(two),
    hashes: db.sql('SELECT dir_path,merkle_hash FROM dir_hashes ORDER BY dir_path').all().map(({ merkle_hash }) => merkle_hash),
  }));
  const before = dump();
  const orig = fs.readFileSync;
  const mocked = t.mock.method(fs, 'readFileSync', (path, options) => {
    assert.notEqual(path, join(root, two), 'unchanged source must not be opened or hashed');
    return orig(path, options);
  });
  syncBuiltinESMExports();
  try {
    write(one, 'export function changedFirst() {}');
    const outline = await buildOutlines(root);
    assert.deepEqual(outline.refresh, { parsed: 1, reused: 1 });
    const after = dump();
    assert.deepEqual({ ...after, hashes: before.hashes }, before);
    assert.equal(after.hashes.length, 2);
    for (let i = 0; i < 2; i += 1) assert.notEqual(after.hashes[i], before.hashes[i]);
    rmSync(join(root, one));
    await buildOutlines(root);
    snapshot(root, (db) => {
      assert.equal(db.file(one), undefined);
      assert.equal(db.sql('SELECT count(*) AS n FROM chunks_fts WHERE chunks_fts MATCH ?').get('changedFirst').n, 0);
      assert.deepEqual(db.symbols(one), []);
    });
    assert.ok(mocked.mock.calls.length > 0);
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
});

test('Git candidate refresh includes a reverted working-tree change and deletions', async (t) => {
  const { root, write } = fixture(t);
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  git('init', '-q');
  write('src/old.ts', 'export function before() {}');
  git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
  await buildOutlines(root);
  write('src/old.ts', 'export function edited() {}');
  write('src/new.ts', 'export function added() {}');
  assert.equal((await buildOutlines(root)).refresh.parsed, 2);
  git('checkout', '--', 'src/old.ts');
  rmSync(join(root, 'src/new.ts'));
  const restored = await buildOutlines(root);
  assert.equal(restored.files.length, 1);
  assert.equal(restored.files[0].symbols[0].name, 'before');
});

test('WAL commits packed batches and a separate process never sees an uncommitted transaction', (t) => {
  const { root } = fixture(t);
  assert.equal(openReadOnly(root), null);
  const writer = openWriter(root);
  try {
    const rows = Array.from({ length: 16 }, (_, i) => ({ fingerprint: `batch1-${i}`, vector: [1, 0] }));
    const start = performance.now();
    writer.upsertVectorBatch(fp, 2, rows);
    t.diagnostic(`16-row batch commit ${(performance.now() - start).toFixed(3)} ms`);
    assert.equal(writer.sql('SELECT length(vec_f32) AS bytes FROM vectors LIMIT 1').get().bytes, 8);
    writer.transaction(() => {
      writer.putVectors(fp, 2, [{ fingerprint: 'uncommitted', vector: [0, 1] }]);
      const module = new URL('../../src/storage/index-store.mjs', import.meta.url).href;
      const source = `import { openReadOnly } from ${JSON.stringify(module)};
        const store = openReadOnly(${JSON.stringify(root)});
        console.log(JSON.stringify([store.sql('PRAGMA busy_timeout').get().timeout, store.sql('SELECT count(*) AS n FROM vectors').get().n]));
        store.close();`;
      const reader = spawnSync(process.execPath, ['--input-type=module', '-e', source], { encoding: 'utf8', timeout: 1500 });
      assert.equal(reader.status, 0, reader.stderr);
      assert.deepEqual(JSON.parse(reader.stdout), [0, 16]);
    });
    assert.equal(snapshot(root, (db) => db.sql('SELECT count(*) AS n FROM vectors').get().n), 17);
  } finally { writer.close(); }
  assert.deepEqual(fs.readdirSync(join(root, '.dotdotgod')), ['index.sqlite']);
  snapshot(root, () => {});
  assert.deepEqual(fs.readdirSync(join(root, '.dotdotgod')), ['index.sqlite']);
});

test('readers return null while the index is initializing or exclusively locked', (t) => {
  const { root, write } = fixture(t);
  mkdirSync(join(root, '.dotdotgod'));
  write('.dotdotgod/index.sqlite', '');
  const assertUnavailable = (state) => {
    assert.equal(openReadOnly(root), null, state);
    assert.equal(readOutlines(root), null, state);
  };
  assertUnavailable('empty file');

  const db = new (process.getBuiltinModule('node:sqlite').DatabaseSync)(indexPath(root));
  try {
    db.exec('CREATE TABLE initializing (id INTEGER)');
    assertUnavailable('missing meta table');

    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema_version', '999');
      PRAGMA locking_mode=EXCLUSIVE;
      BEGIN EXCLUSIVE;`);
    assert.ok(existsSync(`${indexPath(root)}-shm`), 'reader must attempt a WAL connection');
    assertUnavailable('exclusive WAL lock');
  } finally { db.close(); }
  assert.throws(() => openReadOnly(root), /Unsupported incremental index schema/);
  assert.throws(() => readOutlines(root), /Unsupported incremental index schema/);
});

test('live build lock and interrupted batches expose only last committed corpus, then recover 16/20', async (t) => {
  const { root, write } = fixture(t);
  write('docs/BASE.md', '# Base needle');
  await buildVectorIndex(root, { embed });
  write('docs/NEW.md', Array.from({ length: 20 }, (_, i) => `# Pending ${i}\nneedle`).join('\n'));
  const entered = Promise.withResolvers(); const release = Promise.withResolvers();
  let batch = 0;
  // This refresh selects only the 20 new chunks, so BASE remains committed until successful publication.
  const chunks = chunkMarkdown('docs/NEW.md', readFileSync(join(root, 'docs/NEW.md'), 'utf8'));
  const active = buildVectorIndex(root, { chunks, corpora: ['docs'], embed: async (texts) => {
    if (++batch === 2) { entered.resolve(); await release.promise; throw new Error('interrupted'); }
    return embed(texts);
  } });
  const failure = assert.rejects(active, /interrupted/);
  await entered.promise;
  try {
    assert.equal(existsSync(join(root, '.dotdotgod/vectors/build.lock')), true);
    assert.equal(snapshot(root, (db) => db.sql('SELECT count(*) AS n FROM vectors').get().n), 17);
    const search = await queryProject(root, 'needle', { scope: 'docs', embed, search: 'vector', indexPolicy: 'prepared-only' });
    assert.deepEqual(search.results.map(({ path }) => path), ['docs/BASE.md']);
  } finally { release.resolve(); await failure; }
  const resume = await buildVectorIndex(root, { chunks, corpora: ['docs'], embed });
  assert.equal(resume.manifest.embedded, 4);
  assert.equal(resume.manifest.diagnostics.corpora.docs.recovered, 16);
  assert.equal(existsSync(join(root, '.dotdotgod/vectors/snapshots.json')), false);
});

test('prepared ANN reopens the committed generation after an interrupted incremental graph write', async (t) => {
  const { root, write } = fixture(t);
  const file = (offset, size) => Array.from({ length: size }, (_, i) => `# Entry ${i + offset}\nExample`).join('\n');
  const point = (i) => {
    if (i === 2001) return [0, 0, 1];
    const z = Math.sin(i * 3.7) * 0.6;
    const xy = Math.sqrt(1 - z * z);
    return [xy * Math.cos(i), xy * Math.sin(i), z];
  };
  const embed = async (texts) => texts.map((text) => point(Number(/Entry (\d+)/.exec(text)?.[1] ?? 14)));
  write('docs/BASE.md', file(0, 2000));
  await buildVectorIndex(root, { embed });
  const path = graphPath(root, fp);
  const delta = path.replace(/\.bin$/, '.wal');
  const generation = () => snapshot(root, (db) => Number(db.meta(`hnsw_generation:${fp}`)));
  const before = generation();
  assert.equal(loadGraph(path, before).size, 2000);
  write('docs/DELTA.md', file(2000, 20));
  let batch = 0;
  await assert.rejects(buildVectorIndex(root, { embed: (texts) => {
    if (++batch === 2) throw new Error('interrupted graph writer');
    return embed(texts);
  } }), /interrupted graph writer/);
  const pending = generation();
  assert.ok(pending > before);
  assert.equal(loadGraph(path, pending).size, 2016);
  const query = (text = 'Entry 14') => queryProject(root, text, { scope: 'docs', search: 'vector', limit: 1, indexPolicy: 'prepared-only', embed });
  appendFileSync(delta, Buffer.from([255, 255, 255])); // Incomplete successor frame, not committed in SQLite.
  const withTail = readFileSync(delta);
  assert.deepEqual((await query()).results.map(({ path }) => path), ['docs/BASE.md']);
  assert.deepEqual(readFileSync(delta), withTail);
  const resumed = await buildVectorIndex(root, { embed });
  assert.equal(resumed.manifest.embedded, 4);
  assert.equal(resumed.manifest.diagnostics.corpora.docs.recovered, 16);
  assert.equal(loadGraph(path, generation()).size, 2020);
  assert.ok((await query('Entry 2001')).results.some(({ path }) => path === 'docs/DELTA.md'));
});

for (const format of ['snapshot', 'trio']) test(`first writer migrates outlines and ${format} without passage embeddings`, async (t) => {
  const { root, write } = fixture(t);
  write('src/api.ts', 'export function migrate() {}');
  const outline = await buildOutlines(root);
  rmSync(indexPath(root));
  writeFileSync(outlinePath(root), JSON.stringify(outline));
  write('docs/README.md', '# migrate\ncontent');
  const chunks = chunkMarkdown('docs/README.md', '# migrate\ncontent');
  const directory = join(root, '.dotdotgod/vectors'); mkdirSync(directory);
  if (format === 'snapshot') {
    writeFileSync(join(directory, 'snapshots.json'), JSON.stringify({ schema: 1, profile: fp, dimensions: 2,
      docs: [], code: [], pending: chunks.map((chunk) => ({ chunk, vector: [1, 0] })) }));
  } else writeVectorCache(root, chunks, Float32Array.of(1, 0), { profileFingerprint: fp, dimensions: 2 });
  const result = await buildVectorIndex(root, { embed: () => assert.fail('compatible cached vectors must migrate') });
  assert.equal(result.manifest.embedded, 0);
  assert.equal(result.manifest.diagnostics.corpora.docs.recovered, format === 'snapshot' ? 1 : 0);
  assert.deepEqual(readOutlines(root).files, outline.files);
});

test('locked legacy trio is not read by other writers, and symlinked cache paths fail closed', (t) => {
  const { root } = fixture(t);
  const directory = join(root, '.dotdotgod/vectors'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'build.lock'), 'live sentinel');
  for (const file of ['manifest.json', 'chunks.jsonl', 'embeddings.f32']) writeFileSync(join(directory, file), 'legacy sentinel');
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (path, options) => {
    assert.ok(!String(path).startsWith(directory), `legacy file read under lock: ${path}`);
    return original(path, options);
  });
  syncBuiltinESMExports();
  try {
    const db = openWriter(root);
    try { assert.equal(db.meta('vector_migration'), undefined); } finally { db.close(); }
  } finally { t.mock.restoreAll(); syncBuiltinESMExports(); }
  assert.equal(readFileSync(join(directory, 'build.lock'), 'utf8'), 'live sentinel');
  rmSync(indexPath(root));
  symlinkSync(join(root, 'missing'), indexPath(root));
  assert.throws(() => openReadOnly(root), /regular file/);
  assert.throws(() => readOutlines(root), /regular file/);
  assert.throws(() => openWriter(root), /regular file/);
  rmSync(join(root, '.dotdotgod'), { recursive: true });
  symlinkSync(join(root, 'docs'), join(root, '.dotdotgod'));
  assert.throws(() => openReadOnly(root), /real directory/);
  assert.throws(() => readOutlines(root), /real directory/);
});

test('FTS lexical splits, multilingual bigrams, exact B-tree match and scopes', async (t) => {
  const { root, write } = fixture(t);
  write('src/run.ts', 'export function buildVectorIndex() {}\nexport function snake_case() {}');
  write('docs/PUBLIC.md', '# buildVectorIndex\n\n의미메모리 검색엔진 中文検索');
  write('docs/PRIVATE.md', '# buildVectorIndex\n\nprivate term');
  write('docs/EXCLUDED.md', '# buildVectorIndex');
  write('dotdotgod.config.json', JSON.stringify({ load: { documentationSummary: { exclude: ['docs/EXCLUDED.md'] } },
    memory: { areas: [{ id: 'private', scope: 'local', freshness: 'fresh', paths: ['docs/PRIVATE.md'] }] } }));
  const result = (query, scope, prepared = true) => queryProject(root, query, { search: 'keyword', scope, ...(prepared ? { indexPolicy: 'prepared-only' } : {}) });
  await result('buildVectorIndex', 'all', false);
  const all = await result('buildVectorIndex', 'all');
  assert.equal(all.results[0].name, 'buildVectorIndex');
  assert.equal(all.results[0].exactNameMatch, true);
  assert.equal(all.results.some(({ path }) => path === 'docs/EXCLUDED.md'), false);
  assert.equal((await result('build vector index', 'code')).results[0].name, 'buildVectorIndex');
  assert.equal((await result('snake case', 'code')).results[0].name, 'snake_case');
  assert.deepEqual((await result('메모리 검색엔진 中文', 'docs')).results.map(({ path }) => path), ['docs/PUBLIC.md']);
  assert.deepEqual(new Set((await result('buildVectorIndex', 'shared')).results.map(({ path }) => path)), new Set(['docs/PUBLIC.md', 'src/run.ts']));
});
