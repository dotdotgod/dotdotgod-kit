import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import validation from '../src/validation.cjs';
const { graphPath, validateGraph, normalizeOptions } = validation;
const graph = () => ({ version: 1, config: { documentation: { root: 'docs' } },
  types: [{ relation: 'implemented_by', label: 'Implemented by', weight: 4, color: '#72b9e6' }],
  edges: [{ source: 'docs/A.md', target: 'src/a.ts', relation: 'implemented_by', weight: 4, color: '#72b9e6' }] });

test('vault paths reject traversal, absolute paths and non-JSON settings', () => {
  for (const path of ['../x.json', '/tmp/x.json', 'C:/x.json', 'a\\b.json', 'a//b.json', 'a/./b.json', 'a/../b.json', 'a\0.json', 'a.txt', '']) {
    assert.throws(() => graphPath(path));
  }
  assert.equal(graphPath('.dotdotgod/traceability.json'), '.dotdotgod/traceability.json');
  assert.equal(graphPath('자료/그래프.json'), '자료/그래프.json');
});
test('graph schema rejects malformed types, paths, colors, weights and unknown relations', () => {
  assert.equal(validateGraph(graph()).edges.length, 1);
  for (const mutate of [g => { g.version = 2; }, g => { g.types.push(g.types[0]); },
    g => { g.types[0].color = 'red'; }, g => { g.types[0].weight = -1; },
    g => { g.edges[0].source = '../secret.md'; }, g => { g.edges[0].relation = 'unknown'; },
    g => { g.edges[0].weight = 999; }, g => { g.edges = [null]; }, g => { g.types = [null]; }]) {
    const value = graph(); mutate(value); assert.throws(() => validateGraph(value));
  }
});
test('settings normalize corrupt state and drop obsolete absolute paths', () => {
  const options = normalizeOptions({ graphFile: '/private/file.json', graphPath: '../bad.json', disabledRelations: null, showFiles: false, showLegend: 'no' });
  assert.equal(options.graphPath, '.dotdotgod/traceability.json');
  assert.deepEqual(options.disabledRelations, []);
  assert.equal(options.documentsOnly, true);
  assert.equal(options.showLegend, true);
  assert.equal('graphFile' in options, false);
  assert.deepEqual(normalizeOptions({ disabledRelations: ['a', null, 1] }).disabledRelations, ['a']);
});

function pluginHarness() {
  const notices = [], intervals = [];
  const context = { module: { exports: {} }, console: { error() {} }, setInterval: callback => { intervals.push(callback); return 1; },
    require: name => {
      if (name === 'obsidian') return { Plugin: class {}, Notice: class { constructor(message) { notices.push(message); } }, getLanguage: () => 'en' };
      if (name === './validation.cjs') return validation;
      if (name === './i18n.cjs') return { translate: (_, key) => key };
      if (name === './settings.cjs') return { TraceabilitySettings: class {} };
      if (name === './renderer.cjs') return { attach() { throw Error('unsupported'); } };
      throw Error(name);
    } };
  runInNewContext(readFileSync(new URL('../src/main.cjs', import.meta.url), 'utf8'), context);
  const plugin = new context.module.exports();
  plugin.loadData = async () => null;
  plugin.addSettingTab = () => {};
  plugin.addCommand = () => {};
  plugin.registerInterval = () => {};
  let layoutReady;
  plugin.app = { workspace: { onLayoutReady: callback => { layoutReady = callback; }, getLeavesOfType: () => [] },
    vault: { adapter: { read: async () => JSON.stringify(graph()) }, getAbstractFileByPath: () => ({ extension: 'md' }) } };
  return { plugin, notices, intervals, ready: () => layoutReady() };
}
test('first-run missing export keeps plugin/settings available and reload recovers', async () => {
  const { plugin, ready, notices } = pluginHarness();
  plugin.app.vault.adapter.read = async () => { throw Error('ENOENT'); };
  await plugin.onload();
  await ready();
  assert.equal(notices.length, 1);
  plugin.app.vault.adapter.read = async () => JSON.stringify(graph());
  await plugin.loadGraph();
  assert.equal(plugin.graph.edges.length, 1);
  plugin.onunload();
});
test('reload failure retains last graph; missing vault files are omitted', async () => {
  const { plugin } = pluginHarness(); await plugin.onload(); await plugin.loadGraph();
  const before = plugin.graph;
  plugin.app.vault.adapter.read = async () => '{broken';
  await assert.rejects(plugin.loadGraph()); assert.equal(plugin.graph, before);
  plugin.app.vault.adapter.read = async () => JSON.stringify(graph());
  plugin.app.vault.getAbstractFileByPath = () => null;
  await plugin.loadGraph(); assert.equal(plugin.graph.edges.length, 0);
  plugin.onunload();
});
test('concurrent reloads coalesce and pending IO cannot reattach after unload', async () => {
  const { plugin } = pluginHarness(); await plugin.onload();
  let finish, reads = 0;
  plugin.app.vault.adapter.read = () => { reads++; return new Promise(resolve => { finish = resolve; }); };
  const a = plugin.loadGraph(), b = plugin.loadGraph();
  plugin.onunload(); finish(JSON.stringify(graph())); await Promise.all([a, b]);
  assert.equal(reads, 1); assert.equal(plugin.graph, undefined); assert.equal(plugin.bindings.size, 0);
});
test('unsupported renderer is reported once without modifying it', async () => {
  const { plugin, notices } = pluginHarness(); await plugin.onload(); await plugin.loadGraph();
  const renderer = { px: { stage: {} } };
  plugin.app.workspace.getLeavesOfType = () => [{ view: { renderer } }];
  plugin.refresh(); plugin.refresh();
  assert.equal(notices.length, 1); assert.equal(plugin.bindings.size, 0);
  assert.deepEqual(Object.keys(renderer), ['px']); plugin.onunload();
});
test('release metadata and bundled output agree', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../manifest.json', import.meta.url)));
  const versions = JSON.parse(readFileSync(new URL('../../../versions.json', import.meta.url)));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert.equal(pkg.version, manifest.version);
  assert.equal(versions[manifest.version], manifest.minAppVersion);
  assert.equal(manifest.isDesktopOnly, true);
  const bundle = readFileSync(new URL('../dist/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(bundle, /require\(["']\.\.?\//);
  assert.doesNotMatch(bundle, /openPath|fetch\(|https?:\/\//);
  assert.match(bundle, /showItemInFolder/);
});

test('plugin build is independent of invocation directory', () => {
  const root = new URL('../../..', import.meta.url).pathname;
  const build = new URL('../scripts/build.mjs', import.meta.url).pathname;
  const digest = () => createHash('sha256').update(readFileSync(new URL('../dist/main.js', import.meta.url))).digest('hex');
  execFileSync(process.execPath, [build], { cwd: root });
  const fromRoot = digest();
  execFileSync(process.execPath, [build], { cwd: new URL('..', import.meta.url).pathname });
  assert.equal(digest(), fromRoot);
});

test('root build reproduces the published main and styles bytes for review', () => {
  const root = new URL('../../..', import.meta.url);
  execFileSync(process.execPath, [new URL('scripts/obsidian-community-build.mjs', root).pathname], { cwd: root.pathname });
  for (const file of ['main.js', 'styles.css']) {
    assert.deepEqual(readFileSync(new URL(file, root)), readFileSync(new URL(`../dist/${file}`, import.meta.url)));
  }
});
