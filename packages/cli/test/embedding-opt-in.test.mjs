import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildVectorIndex, queryProject } from '../src/commands/query.mjs';
import { buildVectorImpactOverlay } from '../src/impact/vector-overlay.mjs';
import { resolveEmbedder } from '../src/query/embedder.mjs';

test('unconfigured search and impact skip embeddings without warnings even with an installed runtime', async () => {
  const root = mkdtempSync(join(tmpdir(), 'embedding-optin-'));
  const home = join(root, 'home');
  mkdirSync(join(root, 'docs')); mkdirSync(home);
  writeFileSync(join(root, 'docs/README.md'), '# Widget\nWidget search evidence');
  try {
    const result = await queryProject(root, 'widget', { home, scope: 'docs' });
    assert.equal(result.results.length, 1);
    assert.equal(result.provider, null);
    assert.equal(result.embeddingSource, 'not-used');
    assert.deepEqual(result.warnings, []);
    assert.equal(result.index, null);
    await assert.rejects(queryProject(root, 'widget', { home, search: 'vector' }), /not configured/);
    await assert.rejects(resolveEmbedder(root, { home }), /not configured/);
    const overlay = await buildVectorImpactOverlay(root, {}, ['docs/README.md'], { home });
    assert.equal(overlay.status, 'disabled');
    assert.deepEqual(overlay.edges, []);
    assert.equal(existsSync(join(root, '.dotdotgod/vector')), false);
    mkdirSync(join(home, '.dotdotgod'));
    writeFileSync(join(home, '.dotdotgod/config.json'), JSON.stringify({ embedding: { provider: 'local', model: 'explicit' } }));
    const passages = [];
    const configured = await queryProject(root, 'widget', { home, scope: 'docs', embed: async texts => { passages.push(...texts); return texts.map(() => [1, 0]); } });
    assert.ok(passages.length);
    assert.ok(configured.results[0].retrieval.includes('vector'));
    const keyword = await queryProject(root, 'widget', { home, scope: 'docs', search: 'keyword', embed: () => assert.fail('keyword must skip embedder') });
    assert.deepEqual(keyword.results[0].retrieval, ['keyword']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('prepared hybrid uses only the query embedding and current documentation', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'prepared-query-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'));
  for (const file of ['CURRENT', 'REMOVED', 'EXCLUDED']) writeFileSync(join(root, `docs/${file}.md`), '# Needle');
  const build = (texts) => texts.map(() => [1, 0]);
  await buildVectorIndex(root, { embed: build });
  rmSync(join(root, 'docs/REMOVED.md'));
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ load: { documentationSummary: { exclude: ['docs/EXCLUDED.md'] } } }));
  const cache = join(root, '.dotdotgod');
  const snapshot = () => readdirSync(cache, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => [entry.parentPath, entry.name, readFileSync(join(entry.parentPath, entry.name))]);
  const before = snapshot();
  assert.deepEqual(before.map(([, name]) => name), ['index.sqlite']);
  const calls = [];
  const options = { indexPolicy: 'prepared-only', embed: async (texts) => { calls.push(texts); return build(texts); } };
  const result = await queryProject(root, 'needle', options);
  assert.deepEqual(calls, [['query: needle']]); // A document-role call would use the passage prefix.
  assert.deepEqual(result.results.map(({ path, retrieval }) => [path, retrieval]), [['docs/CURRENT.md', ['keyword', 'vector']]]);
  assert.deepEqual(snapshot(), before);
  assert.equal(existsSync(join(root, '.dotdotgod/outlines.json')), false);
  const incompatible = { ...options, profile: { provider: 'local', model: 'other' } };
  await assert.rejects(queryProject(root, 'needle', { ...incompatible, search: 'vector' }), /profile-mismatch/);
  assert.equal(calls.length, 1);

  const controller = new AbortController();
  const reason = new Error('prepared query cancelled');
  await assert.rejects(queryProject(root, 'needle', {
    ...options, signal: controller.signal, embed: () => {
      controller.abort(reason);
      return new Promise(() => {});
    },
  }), (error) => error === reason);
  assert.deepEqual(snapshot(), before);
});
