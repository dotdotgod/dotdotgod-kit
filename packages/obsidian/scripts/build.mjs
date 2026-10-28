import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'packages/obsidian/dist');
await mkdir(output, { recursive: true });
await build({ entryPoints: [resolve(root, 'packages/obsidian/src/main.cjs')], outfile: resolve(output, 'main.js'),
  bundle: true, platform: 'node', format: 'cjs', target: 'es2022', external: ['obsidian', 'electron', 'node:*'], legalComments: 'none' });
await copyFile(resolve(root, 'manifest.json'), resolve(output, 'manifest.json'));
await copyFile(resolve(root, 'versions.json'), resolve(output, 'versions.json'));
await copyFile(resolve(root, 'LICENSE'), resolve(output, 'LICENSE'));
await copyFile(resolve(root, 'packages/obsidian/styles.css'), resolve(output, 'styles.css'));
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(await readFile(resolve(root, 'packages/obsidian/package.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error('Plugin version mismatch');
console.log(`Built ${manifest.id} ${manifest.version}`);
