import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { exportTraceability } from './obsidian-traceability-export.mjs';
const directory = resolve(import.meta.dirname, '../.obsidian-dev/vault/.obsidian/plugins/dotdotgod-graph-probe');
await mkdir(directory, { recursive: true });
const helper = await readFile(resolve(import.meta.dirname, '../packages/cli/src/graph-view/node-style.cjs'), 'utf8');
const policy = await readFile(resolve(import.meta.dirname, '../packages/cli/src/graph-view/policy.cjs'), 'utf8');
const plugin = await readFile(resolve(import.meta.dirname, 'obsidian-graph-probe.cjs'), 'utf8');
const translations = await readFile(resolve(import.meta.dirname, 'obsidian-i18n.cjs'), 'utf8');
await writeFile(resolve(directory, 'main.js'), helper.replace('module.exports = { describeNode };', '') + '\n' + policy.replace("if (typeof module !== 'undefined') module.exports = { selectTraceability };\nelse globalThis.selectTraceability = selectTraceability;", '') + '\n' + translations.replace('module.exports = { translate };', '') + '\n' + plugin.replace("const { describeNode } = require('./obsidian-node-style.cjs');", '').replace("const { translate } = require('./obsidian-i18n.cjs');", '').replace("const { selectTraceability } = require('./policy.cjs');", ''));
await copyFile(resolve(import.meta.dirname, 'obsidian-node-style.cjs'), resolve(directory, 'obsidian-node-style.cjs'));
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({
  id: 'dotdotgod-graph-probe', name: 'dotdotgod Graph Probe', version: '0.0.1',
  minAppVersion: '1.14.5', description: 'Development-only native graph compatibility probe.', author: 'dotdotgod', isDesktopOnly: true,
}, null, 2));
const project = resolve(import.meta.dirname, '..');
const graphFile = resolve(project, '.obsidian-dev/traceability.json');
const graph = await exportTraceability(project);
await writeFile(graphFile, JSON.stringify(graph, null, 2));
let settings = {};
try { settings = JSON.parse(await readFile(resolve(directory, 'data.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await writeFile(resolve(directory, 'data.json'), JSON.stringify({ ...settings, graphFile }));
console.log(directory);
