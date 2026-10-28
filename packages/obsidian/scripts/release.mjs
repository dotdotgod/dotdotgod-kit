import './build.mjs';
import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '../../..');
const output = join(root, 'packages/obsidian/dist');
const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
const temporary = await mkdtemp(join(tmpdir(), 'dotdotgod-plugin-release-'));
try {
  const folder = join(temporary, manifest.id);
  await mkdir(folder);
  for (const file of ['main.js', 'manifest.json', 'styles.css', 'LICENSE']) {
    await copyFile(join(output, file), join(folder, file));
  }
  // README links use repository URLs so they remain useful after extraction.
  const readme = (await readFile(join(root, 'packages/obsidian/README.md'), 'utf8'))
    .replaceAll('../../LICENSE', 'https://github.com/dotdotgod/dotdotgod-kit/blob/main/LICENSE')
    .replaceAll('../../docs/report/', 'https://github.com/dotdotgod/dotdotgod-kit/blob/main/docs/report/');
  await writeFile(join(folder, 'README.md'), readme);
  const archive = join(temporary, `${manifest.id}-${manifest.version}.zip`);
  execFileSync('zip', ['-q', '-r', archive, manifest.id], { cwd: temporary });
  await copyFile(archive, join(output, `${manifest.id}-${manifest.version}.zip`));
  console.log(join(output, `${manifest.id}-${manifest.version}.zip`));
} finally { await rm(temporary, { recursive: true, force: true }); }
