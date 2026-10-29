// Obsidian's reviewer runs the root build script and compares root artifacts.
import '../packages/obsidian/scripts/build.mjs';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
for (const file of ['main.js', 'styles.css']) {
  await copyFile(resolve(root, 'packages/obsidian/dist', file), resolve(root, file));
}
