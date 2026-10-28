import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const cli = new URL('../bin/dotdotgod.mjs', import.meta.url).pathname;
test('graph export writes vault-relative configured relations and preserves prior export on error', async t => {
  const root = await mkdtemp(join(tmpdir(), 'graph-export-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs/spec'), { recursive: true });
  await writeFile(join(root, 'a.mjs'), 'export const a = 1;');
  await writeFile(join(root, 'docs/spec/A.md'), '# A\n\n```json dotdotgod\n{"kind":"spec","implementedBy":["a.mjs"]}\n```\n');
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'graph', 'export', root, '--json'], { encoding: 'utf8' }));
  assert.equal(result.ok, true); assert.ok(result.edges > 0);
  const contents = await readFile(result.path, 'utf8'); const graph = JSON.parse(contents);
  assert.equal(graph.projectRoot, undefined);
  assert.ok(graph.edges.some(edge => edge.target === 'a.mjs'));
  assert.doesNotMatch(contents, new RegExp(root));
  assert.ok((await readdir(join(root, '.dotdotgod'))).every(path => !path.endsWith('.tmp')));
  await writeFile(join(root, 'dotdotgod.config.json'), '{broken');
  const failed = spawnSync(process.execPath, [cli, 'graph', 'export', root], { encoding: 'utf8' });
  assert.notEqual(failed.status, 0);
  assert.equal(await readFile(result.path, 'utf8'), contents);
});
test('graph export help names the vault output path', () => {
  const help = execFileSync(process.execPath, [cli, 'graph', 'export', '--help'], { encoding: 'utf8' });
  assert.match(help, /\.dotdotgod\/traceability.json/);
});
