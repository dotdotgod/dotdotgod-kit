import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { queryProject } from '../src/commands/query.mjs';
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
