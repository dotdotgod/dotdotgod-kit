import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url))).version;

// Explicit real-app acceptance against the isolated vault, never a user's vault.
const expression = `(async () => {
  const assert = (value, message) => { if (!value) throw Error(message); };
  assert(app.vault.adapter.getBasePath().endsWith('/.obsidian-dev/vault'), 'Not the isolated vault');
  const id = 'dotdotgod-graph-probe';
  const view = app.workspace.getLeavesOfType('graph')[0]?.view;
  assert(view, 'Open the global graph first');
  const renderer = view.renderer;
  const plugin = app.plugins.plugins[id];
  assert(plugin?.manifest.version === ${JSON.stringify(version)}, 'Install the current bundle first');
  const saved = structuredClone(plugin.options);
  const options = JSON.stringify(view.dataEngine.options);
  const countUI = () => document.querySelectorAll('[data-dotdotgod-controls]').length;
  let result;
  try {
    await app.plugins.disablePlugin(id);
    const baseline = renderer.nodes.map(n => n.id).sort();
    const originalSetData = renderer.setData;
    const originalClick = renderer.onNodeClick;
    const originalHover = renderer.onNodeHover;
    await app.plugins.enablePlugin(id);
    const active = app.plugins.plugins[id];
    // Use the newly enabled instance for the rest of the check.
    await active.loadGraph();
    const endpoints = new Set(active.graph.edges.flatMap(e => [e.source, e.target]));
    assert(endpoints.size > 0 && active.bindings.size === 1, 'No exported graph binding');
    for (let i = 0; i < 3; i++) await active.loadGraph();
    assert(countUI() === 1, 'Reload duplicated controls');
    const allRelations = active.graph.types.map(t => t.relation);
    const apply = async values => {
      Object.assign(active.options, values); await active.saveData(active.options);
      active.detach(); active.refresh();
    };
    await apply({ disabledRelations: allRelations });
    assert(renderer.nodes.every(n => !endpoints.has(n.id)), 'Disabled endpoints remain');
    assert(baseline.filter(path => !endpoints.has(path)).every(path => renderer.nodeLookup[path]), 'Unrelated native nodes removed');
    await apply({ disabledRelations: [], documentsOnly: true });
    assert(renderer.nodes.every(n => /\\.md$/i.test(n.id)), 'Non-Markdown nodes remain');
    await apply({ documentsOnly: false, showLegend: false, weightedLines: false });
    assert(document.querySelector('[data-dotdotgod-legend]').style.display === 'none', 'Legend not hidden');
    const code = active.graph.edges.flatMap(e => [e.source, e.target]).find(path => !/\\.md$/i.test(path));
    assert(code && renderer.nodeLookup[code], 'No source node');
    const shell = require('electron').shell;
    const originalReveal = shell.showItemInFolder;
    let revealed;
    try {
      shell.showItemInFolder = path => { revealed = path; };
      renderer.onNodeClick({}, code, '');
    } finally { shell.showItemInFolder = originalReveal; }
    assert(revealed === require('node:path').join(app.vault.adapter.getBasePath(), code), 'Reveal escaped vault or did not route');
    const previous = active.graph;
    active.options.graphPath = '.dotdotgod/missing-release-check.json';
    let failed = false;
    try { await active.loadGraph(); } catch { failed = true; }
    assert(failed && active.graph === previous && countUI() === 1, 'Missing export destroyed current graph');
    active.options.graphPath = saved.graphPath;
    await active.loadGraph();
    assert(JSON.stringify(view.dataEngine.options) === options, 'Native graph options changed');
    await app.plugins.disablePlugin(id);
    assert(renderer.setData === originalSetData && renderer.onNodeClick === originalClick && renderer.onNodeHover === originalHover, 'Native hooks not restored');
    assert(JSON.stringify(renderer.nodes.map(n => n.id).sort()) === JSON.stringify(baseline), 'Native nodes not restored');
    assert(countUI() === 0 && !document.querySelector('[data-dotdotgod-legend]') && !document.querySelector('[data-dotdotgod-tooltip]'), 'Plugin UI survived unload');
    await app.plugins.enablePlugin(id);
    const restored = app.plugins.plugins[id];
    restored.options = saved; await restored.saveData(saved); await restored.loadGraph();
    const tab = app.setting.pluginTabs.find(tab => tab.plugin === restored);
    assert(tab, 'Missing public settings tab');
    tab.display();
    const pathInput = tab.containerEl.querySelector('input');
    assert(pathInput?.value === saved.graphPath, 'Settings path not displayed');
    pathInput.value = saved.graphPath; pathInput.dispatchEvent(new Event('input', { bubbles: true }));
    tab.containerEl.querySelector('button').click();
    for (let i = 0; i < 50 && (restored.loading || tab.containerEl.querySelector('button').disabled); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert((await restored.loadData()).graphPath === saved.graphPath, 'Settings did not persist path');
    await view.leaf.detach();
    restored.refresh();
    assert(restored.bindings.size === 0 && countUI() === 0, 'Closed graph retained binding');
    app.commands.executeCommandById('graph:open');
    for (let i = 0; i < 100 && restored.bindings.size === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 20)); restored.refresh();
    }
    assert(restored.bindings.size === 1 && countUI() === 1, 'Reopened graph did not rebind');
    result = { ok: true, version: restored.manifest.version, edges: restored.graph.edges.length,
      reloads: 3, filters: true, missingExportRecovery: true, revealRouting: true,
      nativeOptionsPreserved: true, unloadRestored: true, reenabled: true,
      settingsSaved: true, graphReopened: true };
  } finally {
    const current = app.plugins.plugins[id];
    if (current) { current.options = saved; await current.saveData(saved); await current.loadGraph(); }
  }
  return JSON.stringify(result);
})()`;
console.log(execFileSync(process.execPath, [resolve(import.meta.dirname, 'obsidian-dev.mjs'), 'eval', expression], { encoding: 'utf8' }));
