import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { openCodeFiles } from '../../src/adapters/hosts/opencode.mjs';

const cliEntry = realpathSync(fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)));
const pinned = { mode: 'pinned', nodePath: process.execPath, cliEntry };
const fromPath = { mode: 'path', command: 'dotdotgod' };
const features = ['ImpactState', 'evaluateLoadDecision', 'formatDecisionError', 'formatDecisionInjection', 'impactReminder', 'isInitializedProject', 'validateSessionId'];

async function fixture(t, binding) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'opencode-runtime-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, bytes, options) => {
    const target = join(root, name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, options);
    return target;
  };
  const files = openCodeFiles(binding);
  for (const [name, bytes] of files) write(name, bytes);
  const { loadRuntime } = await import(pathToFileURL(join(root, 'src/runtime.mjs')));
  return { root, write, loadRuntime, bind: (value) => write('runtime.json', JSON.stringify(value)), files };
}

test('pinned and PATH fixtures resolve the same T3 package and expose exactly seven runtime features', async t => {
  const f = await fixture(t, pinned);
  assert.deepEqual(JSON.parse(f.files.get('package.json')), { type: 'module', main: './index.js' });
  assert.equal([...f.files.keys()].some(name => name.startsWith('mcp/') || name.endsWith('.wasm')), false);
  const nodeAlias = join(f.root, 'node-alias');
  const cliAlias = join(f.root, 'entry-alias');
  symlinkSync(process.execPath, nodeAlias);
  symlinkSync(cliEntry, cliAlias);
  f.bind({ mode: 'pinned', nodePath: nodeAlias, cliEntry: cliAlias });
  const local = await f.loadRuntime();
  assert.deepEqual(local.argv, [realpathSync(process.execPath), cliEntry]);
  assert.deepEqual(Object.keys(local.advisory).sort(), features);

  f.bind(fromPath);
  const bin = join(f.root, 'bin');
  mkdirSync(bin);
  symlinkSync(cliEntry, join(bin, 'dotdotgod'));
  const previous = process.env.PATH;
  t.after(() => { process.env.PATH = previous; });
  process.env.PATH = bin;
  const path = await f.loadRuntime();
  assert.deepEqual(path.argv, [cliEntry]);
  assert.deepEqual(path.advisory, local.advisory);
});

test('SEC-D2 rejects runtime.json symlinks, injection fields, wrong commands, untrusted packages and a redirected module', async t => {
  const f = await fixture(t, pinned);
  const sentinel = join(f.root, 'executed');
  const poison = `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(sentinel)}, 'executed');`;
  const rogue = f.write('rogue.mjs', poison);
  const bad = { argv: null, advisory: null };
  for (const binding of [{ ...pinned, impactModule: rogue }, { ...fromPath, impactModule: rogue },
    { mode: 'path', command: rogue }, { mode: 'other' }, { ...pinned, cliEntry: rogue }]) {
    f.bind(binding);
    assert.deepEqual(await f.loadRuntime(), bad);
  }
  rmSync(join(f.root, 'runtime.json'));
  f.write('symlink-target', JSON.stringify(pinned));
  symlinkSync('symlink-target', join(f.root, 'runtime.json'));
  assert.deepEqual(await f.loadRuntime(), bad);
  rmSync(join(f.root, 'runtime.json'));

  const fakeCli = f.write('wrong/bin/dotdotgod.mjs', '#!/usr/bin/env node\n' + poison, { mode: 0o700 });
  f.write('wrong/package.json', '{"name":"unrelated"}');
  f.write('wrong/src/context/opencode-runtime.mjs', poison);
  f.bind({ ...pinned, cliEntry: fakeCli });
  assert.deepEqual(await f.loadRuntime(), bad);

  f.bind(fromPath);
  const bin = join(f.root, 'bin');
  const genuine = join(f.root, 'genuine');
  mkdirSync(bin);
  mkdirSync(genuine);
  symlinkSync(fakeCli, join(bin, 'dotdotgod'));
  symlinkSync(cliEntry, join(genuine, 'dotdotgod'));
  const previous = process.env.PATH;
  t.after(() => { process.env.PATH = previous; });
  process.env.PATH = `${bin}${delimiter}${genuine}`;
  assert.deepEqual(await f.loadRuntime(), bad);

  f.write('wrong/package.json', '{"name":"@dotdotgod/cli"}');
  rmSync(join(f.root, 'wrong/src/context/opencode-runtime.mjs'));
  symlinkSync(rogue, join(f.root, 'wrong/src/context/opencode-runtime.mjs'));
  assert.deepEqual(await f.loadRuntime(), bad);
  assert.equal(existsSync(sentinel), false);
});

test('advisory import failure is fail-open without substituting a different module', async t => {
  const f = await fixture(t, pinned);
  const cli = f.write('broken/bin/dotdotgod.mjs', '');
  f.write('broken/package.json', '{"name":"@dotdotgod/cli"}');
  f.write('broken/src/context/opencode-runtime.mjs', 'export const ImpactState =');
  f.bind({ ...pinned, cliEntry: cli });
  assert.deepEqual(await f.loadRuntime(), { argv: [realpathSync(process.execPath), cli], advisory: null });
});
