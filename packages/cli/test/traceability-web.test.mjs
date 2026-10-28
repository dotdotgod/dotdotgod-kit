import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startImpactGraphServer } from '../src/graph-view/server.mjs';
import policy from '../src/graph-view/policy.cjs';
import { runInNewContext } from 'node:vm';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('file windows are bounded and cover the tail of large lists', () => {
  const context = { module: { exports: {} } };
  runInNewContext(readFileSync(new URL('../src/graph-view/assets/file-list.js', import.meta.url), 'utf8'), context);
  const { fileWindow } = context.module.exports;
  assert.equal(fileWindow(0, 0, 400).end, 0);
  const first = fileWindow(10000, 0, 400);
  assert.equal(first.start, 0);
  assert.ok(first.end < 30);
  const tail = fileWindow(10000, 359600, 400);
  assert.equal(tail.end, 10000);
  assert.ok(tail.end - tail.start < 30);
});

test('graph client distinguishes HTTP, network, malformed data, and recovery', async () => {
  const context = { module: { exports: {} } };
  runInNewContext(readFileSync(new URL('../src/graph-view/assets/graph-client.js', import.meta.url), 'utf8'), context);
  const { fetchGraph } = context.module.exports;
  await assert.rejects(fetchGraph(async () => { throw Error('offline'); }), /NETWORK/);
  await assert.rejects(fetchGraph(async () => new Response(JSON.stringify({ error: { message: 'bad configuration' } }), { status: 500 })), /HTTP 500: bad configuration/);
  await assert.rejects(fetchGraph(async () => new Response('Not found', { status: 404 })), /HTTP 404/);
  await assert.rejects(fetchGraph(async () => Response.json({ version: 1 })), /INVALID_GRAPH/);
  const graph = { version: 1, nodes: [], edges: [], types: [] };
  assert.deepEqual(await fetchGraph(async () => Response.json(graph)), graph);
});

test('reload returns config failures and recovers after repair', async t => {
  const root = mkdtempSync(join(tmpdir(), 'traceability-reload-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/README.md'), '# Documents\n');
  const running = await startImpactGraphServer({ root });
  t.after(() => new Promise(resolve => running.server.close(resolve)));
  assert.equal((await fetch(`${running.url}/api/graph`)).status, 200);
  writeFileSync(join(root, 'dotdotgod.config.json'), '{broken');
  const failed = await fetch(`${running.url}/api/graph`);
  assert.equal(failed.status, 500);
  assert.match((await failed.json()).error.message, /MEMORY_CONFIG_INVALID_JSON/);
  writeFileSync(join(root, 'dotdotgod.config.json'), '{}');
  for (let i = 0; i < 3; i++) assert.equal((await fetch(`${running.url}/api/graph`)).status, 200);
});
test('browser and Node use identical filtering and representative relations', () => {
  const browser = {};
  runInNewContext(readFileSync(new URL('../src/graph-view/policy.cjs', import.meta.url), 'utf8'), browser);
  const graph = { edges: [
    { source: 'docs/A.md', target: 'src/a.ts', relation: 'implements', weight: 4 },
    { source: 'docs/A.md', target: 'docs/B.md', relation: 'related', weight: 2 },
    { source: 'docs/A.md', target: 'docs/B.md', relation: 'verifies', weight: 3 },
  ] };
  for (const options of [{}, { documentsOnly: true }, { disabledRelations: ['verifies'] }, { disabledRelations: ['related', 'verifies', 'implements'] }]) {
    assert.deepEqual(JSON.parse(JSON.stringify(browser.selectTraceability(graph, options))), policy.selectTraceability(graph, options));
  }
  assert.equal(policy.selectTraceability(graph).edges.length, 2);
  assert.deepEqual(policy.selectTraceability(graph, { documentsOnly: true }).paths, ['docs/A.md', 'docs/B.md']);
});
test('standalone graph serves configured traceability without changed roots', async () => {
  const running = await startImpactGraphServer({ root: new URL('../../..', import.meta.url).pathname });
  try {
    const response = await fetch(`${running.url}/api/graph`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.nodes.length > 0);
    assert.ok(payload.edges.length > 0);
    assert.equal(payload.projectRoot, undefined);
    assert.ok(payload.edges.every(e => payload.types.some(t => t.relation === e.relation && t.weight === e.weight)));
    assert.equal((await fetch(`${running.url}/api/impact`)).status, 404);
    assert.equal((await fetch(`${running.url}/api/graph`, { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => running.server.close(resolve)); }
});
