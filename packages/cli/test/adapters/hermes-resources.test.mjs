import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, existsSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assertNoManagedConflict, createMarkerStore } from '../../src/adapters/marker-store.mjs';
import { detectHermesLegacy, renderHermesFiles } from '../../src/adapters/hosts/hermes.mjs';

const cliEntry = fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url));
const pinned = { mode: 'pinned', nodePath: process.execPath, cliEntry };
const pathBinding = { mode: 'path', command: 'dotdotgod' };
const options = { host: 'hermes', scope: 'user' };
const storeFor = (homeDir) => createMarkerStore({ homeDir, cwd: homeDir, env: {} }, options);

// T7 exercises installed bytes via T3's actual file and marker writer. T8 owns the CLI lifecycle.
function installFixture(homeDir, binding = pinned) {
  const store = storeFor(homeDir);
  const files = renderHermesFiles(binding);
  const state = assertNoManagedConflict(store, { legacy: detectHermesLegacy(store), plannedFiles: [...files.keys()] });
  const time = new Date().toISOString();
  const marker = {
    schemaVersion: 1, phase: 'staging', ...options, installDir: store.installDir,
    cliVersion: '0.0.0', installedAt: time, updatedAt: time, runtime: binding, sharedConfigEdits: [],
    managedFiles: Object.fromEntries([...files].map(([path, bytes]) => [path, {
      size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    }])),
  };
  store.write(marker, state.snapshot);
  for (const [path, bytes] of files) store.installFs.writeAtomic(join(store.installDir, path), bytes, null);
  store.write({ ...marker, phase: 'installed' }, store.read().snapshot);
  return store;
}

if (process.argv[2] === '--fixture') {
  console.log(installFixture(process.argv[3]).installDir);
} else {
  test('Hermes installed bytes retain nonblocking native hooks, skills, and the shared tool catalog', (t) => {
    const homeDir = mkdtempSync(join(realpathSync(tmpdir()), 'hermes-resources-'));
    t.after(() => rmSync(homeDir, { recursive: true, force: true }));
    const config = join(homeDir, '.hermes/config.yaml');
    mkdirSync(join(homeDir, '.hermes'));
    const sentinel = Buffer.from('# untouched\r\nplugins: {}\r\n');
    writeFileSync(config, sentinel);
    const { installDir, configPaths } = installFixture(homeDir);
    const read = (path) => readFileSync(join(installDir, path), 'utf8');
    assert.deepEqual(readFileSync(config), sentinel);
    assert.deepEqual(configPaths, []);
    for (const path of ['plugin.yaml', '__init__.py', 'runtime.py', 'proxy.py', 'policy.py', 'impact.py', 'runtime.json', 'tools.json', 'LICENSE',
      'skills/project-initializer/scripts/init_project.sh', 'skills/project-initializer/templates/software.json']) assert.ok(read(path), path);
    assert.deepEqual(JSON.parse(read('runtime.json')), pinned);
    assert.deepEqual(JSON.parse(renderHermesFiles(pathBinding).get('runtime.json')), pathBinding);
    assert.deepEqual(readdirSync(join(installDir, 'skills')).sort(), ['impact-review', 'project-initializer', 'project-load']);
    for (const path of readdirSync(installDir, { recursive: true })) assert.doesNotMatch(path, /\.py[co]$|__pycache__|^mcp[\/\\]|node_modules/);
    const tools = JSON.parse(read('tools.json'));
    assert.equal(tools.length, 19);
    const shared = JSON.parse(execFileSync(process.execPath, [cliEntry, 'mcp-bridge', '--list-tools'], { cwd: homeDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    assert.deepEqual(tools, shared);
    const manifest = read('plugin.yaml').split('provides_tools:\n')[1].split('provides_hooks:')[0];
    const names = [...manifest.matchAll(/^  - (.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(names.sort(), [...tools.map(tool => tool.name), 'select_root'].sort());
    assert.match(read('plugin.yaml'), /^  - post_tool_call$/m);
    assert.doesNotMatch(read('policy.py'), /\bGATE\b|\bdef gate\(|\bdef commands\(/);
    assert.doesNotMatch(read('runtime.py'), /"action":\s*"block"/);
    assert.equal(existsSync(join(homeDir, '.dotdotgod/context')), false);
  });

  test('legacy detection is read-only, including dangling development links', (t) => {
    const homeDir = mkdtempSync(join(realpathSync(tmpdir()), 'hermes-legacy-'));
    t.after(() => rmSync(homeDir, { recursive: true, force: true }));
    const store = storeFor(homeDir);
    const { installDir, markerPath } = store;
    assert.equal(detectHermesLegacy(store), false);
    mkdirSync(join(installDir, '..'), { recursive: true });
    symlinkSync(join(homeDir, 'missing'), installDir);
    assert.equal(detectHermesLegacy(store), true);
    assert.throws(() => assertNoManagedConflict(store, { legacy: detectHermesLegacy(store) }), { code: 'LEGACY_COEXIST_CONFLICT' });
    rmSync(installDir);
    mkdirSync(join(installDir, 'mcp'), { recursive: true });
    writeFileSync(join(installDir, 'mcp/bridge.mjs'), 'legacy bytes');
    assert.equal(detectHermesLegacy(store), true);
    assert.equal(readFileSync(join(installDir, 'mcp/bridge.mjs'), 'utf8'), 'legacy bytes');
    assert.equal(existsSync(markerPath), false);
  });
}
