import { mkdir, copyFile, writeFile, readFile, constants } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { exportTraceability } from './obsidian-traceability-export.mjs';
const project = resolve(import.meta.dirname, '..');
execFileSync(process.execPath, [resolve(project, 'packages/obsidian/scripts/build.mjs')], { stdio: 'inherit' });
// Keep the original local probe ID to avoid enabling two adapters in the test vault.
const vault = resolve(project, '.obsidian-dev/vault');
const directory = resolve(vault, '.obsidian/plugins/dotdotgod-graph-probe');
await mkdir(directory, { recursive: true });
await copyFile(resolve(project, 'packages/obsidian/dist/main.js'), resolve(directory, 'main.js'));
await copyFile(resolve(project, 'packages/obsidian/dist/styles.css'), resolve(directory, 'styles.css'));
const manifest = JSON.parse(await readFile(resolve(project, 'manifest.json'), 'utf8'));
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify({ ...manifest, id: 'dotdotgod-graph-probe' }));
const graph = await exportTraceability(project);
delete graph.projectRoot;
await mkdir(resolve(vault, '.dotdotgod'), { recursive: true });
await writeFile(resolve(vault, '.dotdotgod/traceability.json'), JSON.stringify(graph));
// Copy only the exported read-only fixture files; no symlinks outside the vault.
for (const path of new Set(graph.edges.flatMap(edge => [edge.source, edge.target]))) {
  const target = resolve(vault, path);
  await mkdir(dirname(target), { recursive: true });
  try { await copyFile(resolve(project, path), target, constants.COPYFILE_EXCL); } catch (error) { if (error.code !== 'EEXIST') throw error; }
}
let settings = {};
try { settings = JSON.parse(await readFile(resolve(directory, 'data.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
delete settings.graphFile;
await writeFile(resolve(directory, 'data.json'), JSON.stringify({ ...settings, graphPath: '.dotdotgod/traceability.json' }));
console.log(directory);
