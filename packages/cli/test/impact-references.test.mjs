import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildIndex, writeIndex, readIndex } from '../src/index/cache.mjs';
import { CACHE_VERSION } from '../src/index/constants.mjs';
import { buildImpactReport, buildCompactImpactReport } from '../src/impact/report.mjs';
import { buildImpactGraphPayload } from '../src/graph-view/payload.mjs';
import { startImpactGraphServer } from '../src/graph-view/server.mjs';

const bin = fileURLToPath(new URL('../bin/dotdotgod.mjs', import.meta.url));
function fixture(t, source) {
  const root = mkdtempSync(join(tmpdir(), 'impact-references-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs/README.md'), source);
  writeFileSync(join(root, 'docs/TARGET.md'), '# Present\n\n## Repeat\n\n## Repeat\n');
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ embedding: { enabled: false } }));
  return root;
}
const report = (root, index = buildIndex(root, null), limits = {}) => buildImpactReport(index, ['docs/README.md'], { root, ...limits });
const hasTarget = (impact, path = 'docs/TARGET.md') => impact.related.some((node) => node.path === path);

test('missing files and anchors are excluded, mixed valid evidence and duplicate anchors survive', (t) => {
  const root = fixture(t, '# Root\n[missing](MISSING.md)\n[bad](TARGET.md#absent)\n[good](TARGET.md#present)\n[repeat](TARGET.md#repeat-1)\n[encoded](TARGET.md#%70resent)\n[same](#absent)\n[same valid](#root)\n```json dotdotgod\n{"kind":"spec","implementedBy":["missing.mjs"]}\n```\n');
  const index = buildIndex(root, null);
  const impact = report(root, index);
  assert.equal(impact.warnings.total, 4);
  assert.deepEqual(impact.warnings.items.filter((item) => item.reason === 'MISSING_FILE').map((item) => item.target), ['missing.mjs', 'MISSING.md']);
  assert.ok(hasTarget(impact));
  assert.ok(!hasTarget(impact, 'docs/MISSING.md'));
  assert.equal(impact.structuralGraph.edges.filter((edge) => edge.target === 'file:docs/TARGET.md' && edge.relation === 'links_to').length, 3);
  assert.ok(!impact.related.some((node) => node.references));
  assert.equal(buildCompactImpactReport(impact).warnings, impact.warnings);
  for (const entry of impact.perSeed) assert.ok(!entry.related.some((node) => node.path === 'docs/MISSING.md'));
  for (const group of Object.values(impact.groups)) assert.ok(!group.items.some((node) => node.path === 'docs/MISSING.md'));
  const payload = buildImpactGraphPayload(index, impact);
  assert.ok(!payload.nodes.some((node) => node.path === 'docs/MISSING.md'));
  const ids = new Set(payload.nodes.map((node) => node.id));
  assert.ok(payload.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
  assert.ok(index.graph.nodes.some((node) => node.path === 'docs/MISSING.md'), 'persisted graph remains intact');
});

test('anchor-only invalid evidence cannot introduce an existing target or affect PPR', (t) => {
  const root = fixture(t, '# Root\n[bad](TARGET.md#absent)\n');
  const index = buildIndex(root, null);
  const impact = report(root, index);
  assert.ok(!hasTarget(impact));
  assert.equal(impact.warnings.items[0].reason, 'BROKEN_ANCHOR');
  const cleanGraph = { ...index, graph: { ...index.graph, edges: index.graph.edges.filter((edge) => !['links_to', 'routes_to'].includes(edge.relation)) } };
  const clean = buildImpactReport(cleanGraph, ['docs/README.md']);
  assert.deepEqual(impact.related.map((item) => [item.id, item.scoreBreakdown.connection]), clean.related.map((item) => [item.id, item.scoreBreakdown.connection]));
});

test('source-owned evidence survives shards and target deletion/restoration and heading changes', (t) => {
  const root = fixture(t, '# Root\n[target](TARGET.md#present)\n```json dotdotgod\n{"kind":"spec","implementedBy":["impl.mjs"]}\n```\n');
  writeFileSync(join(root, 'impl.mjs'), 'export const value = 1;');
  let index = buildIndex(root, null);
  writeIndex(root, index); index = readIndex(root);
  assert.ok(index.graph.nodes.find((node) => node.path === 'docs/README.md').references.length >= 3);
  const incoming = buildImpactReport(index, ['impl.mjs'], { root });
  assert.ok(incoming.related.some((item) => item.path === 'docs/README.md'));
  rmSync(join(root, 'docs/TARGET.md')); rmSync(join(root, 'impl.mjs'));
  index = buildIndex(root, index); writeIndex(root, index); index = readIndex(root);
  assert.equal(report(root, index).warnings.total, 2);
  writeFileSync(join(root, 'docs/TARGET.md'), '# Renamed\n'); writeFileSync(join(root, 'impl.mjs'), 'export const value = 2;');
  index = buildIndex(root, index);
  let impact = report(root, index);
  assert.equal(impact.warnings.total, 1);
  assert.equal(impact.warnings.items[0].reason, 'BROKEN_ANCHOR');
  assert.ok(hasTarget(impact, 'impl.mjs'));
  writeFileSync(join(root, 'docs/TARGET.md'), '# Present\n');
  index = buildIndex(root, index); impact = report(root, index);
  assert.equal(impact.warnings.total, 0); assert.ok(hasTarget(impact));
  assert.deepEqual(impact.related, report(root).related);
  const old = { ...index, version: CACHE_VERSION - 1 };
  assert.equal(buildIndex(root, old).incremental.fullRebuild, true);
});

test('deleted seeds retain incoming Markdown and traceability docs across deletion and restoration', (t) => {
  const root = fixture(t, '# Root\n[target](TARGET.md#present)\n```json dotdotgod\n{"kind":"spec","implementedBy":["impl.mjs"]}\n```\n');
  writeFileSync(join(root, 'impl.mjs'), 'export const value = 1;');
  const changed = ['docs/TARGET.md', 'impl.mjs'];
  let index = buildIndex(root, null);
  const checkIncoming = (deleted) => {
    const impact = buildImpactReport(index, changed, { root });
    assert.ok(hasTarget(impact, 'docs/README.md'));
    for (const seed of impact.perSeed) assert.ok(seed.related.some((item) => item.path === 'docs/README.md'), seed.changed);
    const payload = buildImpactGraphPayload(index, impact);
    assert.ok(payload.nodes.some((node) => node.path === 'docs/README.md'));
    for (const path of changed) {
      assert.ok(payload.edges.some((edge) => edge.source === 'file:docs/README.md' && edge.target === `file:${path}`), path);
      const single = buildImpactReport(index, [path], { root });
      assert.ok(hasTarget(single, 'docs/README.md'), path);
      if (deleted) assert.ok(single.warnings.items.some((item) => item.targetPath === path && item.reason === 'MISSING_FILE'));
    }
    assert.equal(impact.warnings.total, deleted ? 2 : 0);
  };
  checkIncoming(false);
  for (const path of changed) rmSync(join(root, path));
  index = buildIndex(root, index); writeIndex(root, index); index = readIndex(root);
  checkIncoming(true);
  const nonseed = report(root, index);
  for (const path of changed) assert.ok(!hasTarget(nonseed, path));
  writeFileSync(join(root, 'docs/TARGET.md'), '# Present\n');
  writeFileSync(join(root, 'impl.mjs'), 'export const value = 2;');
  index = buildIndex(root, index); writeIndex(root, index); index = readIndex(root);
  checkIncoming(false);
});

test('directories, existing unindexed files, URLs and logical package declarations are not broken', (t) => {
  const root = fixture(t, '# Root\n[dir](../assets)\n[unindexed](../assets/data.txt)\n[remote](https://example.com/absent#heading)\n[ftp](ftp://example.com/absent)\n[pkg](../package.json)\n');
  mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/data.txt'), 'content');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', files: ['assets/**'], scripts: { test: 'node --test' }, dependencies: { 'not-a-local-file': '1' } }));
  const impact = report(root);
  assert.equal(impact.warnings.total, 0);
  assert.ok(hasTarget(impact, 'assets/data.txt'));
  assert.ok(hasTarget(impact, 'assets'));
});

test('warnings are bounded separately; valid candidates refill limits; missing seeds stay context', (t) => {
  const root = fixture(t, '# Root\n' + Array.from({ length: 30 }, (_, i) => `[missing](ABSENT_${i}.md)`).join('\n') + '\n[valid](TARGET.md#present)\n');
  const index = buildIndex(root, null);
  const impact = report(root, index, { related: 3 });
  assert.equal(impact.warnings.total, 30); assert.equal(impact.warnings.items.length, 20); assert.equal(impact.warnings.omitted, 10);
  assert.equal(impact.related.length, 3); assert.equal(impact.omittedRelated, 0);
  assert.deepEqual(impact.warnings, report(root, index).warnings);
  const multi = buildImpactReport(index, ['docs/README.md', 'deleted.mjs'], { root });
  assert.ok(buildImpactGraphPayload(index, multi).nodes.some((node) => node.id === 'file:deleted.mjs' && node.seed));
  assert.deepEqual(multi.changedFiles, ['docs/README.md', 'deleted.mjs']);
  assert.ok(!multi.related.some((node) => multi.changedFiles.some((path) => node.id === `file:${path}`)));
  const reversed = buildImpactReport(index, ['deleted.mjs', 'docs/README.md'], { root });
  assert.deepEqual(multi.related.map((item) => [item.id, item.impactScore]), reversed.related.map((item) => [item.id, item.impactScore]));
});

test('uncertain filesystem access is not classified as a missing target', (t) => {
  const root = fixture(t, '# Root\n[loop](../loop)\n');
  symlinkSync('loop', join(root, 'loop'));
  const impact = report(root);
  assert.equal(impact.warnings.total, 1);
  assert.equal(impact.warnings.items[0].reason, 'REFERENCE_UNAVAILABLE');
  assert.ok(hasTarget(impact, 'loop'));
});

test('CLI all output modes expose warnings without warning-only failure or source repair', (t) => {
  const root = fixture(t, '# Root\n[bad](TARGET.md#absent)\n[missing](MISSING.md)\n');
  const source = readFileSync(join(root, 'docs/README.md'), 'utf8');
  for (const mode of [[], ['--compact'], ['--json'], ['--yml']]) {
    const result = spawnSync(process.execPath, [bin, 'graph', 'impact', root, '--changed', 'docs/README.md', ...mode], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /BROKEN_ANCHOR/); assert.match(result.stdout, /MISSING_FILE/);
    if (mode.includes('--json')) {
      const payload = JSON.parse(result.stdout);
      assert.equal(payload.impact.warnings.total, 2);
      assert.ok(!payload.related.some((node) => node.path === 'docs/MISSING.md'));
    }
    if (mode.includes('--yml')) assert.match(result.stdout, /warnings:\n    total: 2\n    omitted: 0/);
  }
  assert.equal(readFileSync(join(root, 'docs/README.md'), 'utf8'), source);
});

test('served explorer API and accessible warning UI use filtered graph and preserve valid evidence', async (t) => {
  const root = fixture(t, '# Root\n[bad](TARGET.md#absent)\n[good](TARGET.md#present)\n[missing](MISSING.md)\n');
  const running = await startImpactGraphServer({ root, changed: ['docs/README.md'] });
  t.after(() => new Promise((resolve) => running.server.close(resolve)));
  const response = await fetch(`${running.url}/api/impact`); const payload = await response.json();
  assert.equal(payload.impact.warnings.total, 2);
  assert.ok(payload.graph.nodes.some((node) => node.path === 'docs/TARGET.md'));
  assert.ok(!payload.graph.nodes.some((node) => node.path === 'docs/MISSING.md'));
  const ids = new Set(payload.graph.nodes.map((node) => node.id));
  assert.ok(payload.impact.related.every((node) => ids.has(node.id)));
  assert.ok(payload.graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
  const html = await (await fetch(running.url)).text();
  assert.match(html, /id="reference-warnings"[^>]+aria-live="polite"/);
  const app = await (await fetch(`${running.url}/app.js`)).text();
  assert.match(app, /warningList.replaceChildren/); assert.match(app, /item.textContent/);
  const reroot = await (await fetch(`${running.url}/api/reroot?changed=docs%2FTARGET.md`)).json();
  assert.ok(!reroot.graph.nodes.some((node) => node.path === 'docs/MISSING.md'));
});
