import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fsBuiltin, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { createAdapterFs, requireProjectRoot } from '../../src/adapters/fs-safety.mjs';
import { assertNoManagedConflict, createMarkerStore, inspectManagedStatus } from '../../src/adapters/marker-store.mjs';
import { readWorkflow } from '../../src/adapters/workflows.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'adapter-'));
  const privateTmp = join(dir, 'tmp');
  mkdirSync(privateTmp);
  const prior = process.env.TMPDIR;
  process.env.TMPDIR = privateTmp;
  t.after(() => {
    if (prior === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prior;
    rmSync(dir, { recursive: true, force: true });
  });
  const homeDir = join(dir, 'home');
  const root = join(dir, 'project');
  mkdirSync(homeDir);
  mkdirSync(root);
  const input = { host: 'opencode', scope: 'project', root };
  const ctx = { cwd: root, homeDir, env: {}, coreVersion: '0.12.0' };
  const fs = createAdapterFs({ root, homeDir });
  const installDir = join(root, '.dotdotgod/adapters/opencode');
  const markerPath = join(root, '.dotdotgod/adapters/state/opencode.json');
  const config = join(root, 'opencode.jsonc');
  const raw = Buffer.from('fixture bytes');
  const runtime = { mode: 'pinned', nodePath: join(dir, 'node'), cliEntry: join(dir, 'cli.mjs') };
  writeFileSync(runtime.nodePath, '', { mode: 0o700 });
  writeFileSync(runtime.cliEntry, '');
  const marker = {
    schemaVersion: 1, phase: 'installed', host: 'opencode', scope: 'project', installDir,
    cliVersion: '0.12.0', installedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', runtime,
    managedFiles: { 'main.mjs': { sha256: createHash('sha256').update(raw).digest('hex'), size: raw.length } },
    sharedConfigEdits: [{ path: config, kind: 'plugins', entry: './.dotdotgod/adapters/opencode' }],
  };
  return { dir, homeDir, root, ctx, fs, input, marker, markerPath, config, raw, main: join(installDir, 'main.mjs') };
}

test('safe writes publish private files by rename and reject stale byte snapshots', (t) => {
  const { fs, root } = fixture(t);
  const dir = join(root, 'new/sub');
  const target = join(dir, 'state.json');
  fs.writeAtomic(target, Buffer.from('old'), null);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(target).mode & 0o777, 0o600);
  const old = fs.read(target);
  const before = statSync(target).ino;
  assert.throws(() => fs.writeAtomic(target, 'x', null), { code: 'CONCURRENT_MODIFICATION' });
  fs.writeAtomic(target, 'new', old);
  assert.notEqual(statSync(target).ino, before);
  assert.throws(() => fs.writeAtomic(target, 'x', old), { code: 'CONCURRENT_MODIFICATION' });
  assert.throws(() => fs.removeFile(target, old), { code: 'CONCURRENT_MODIFICATION' });
  assert.equal(readFileSync(target, 'utf8'), 'new');
  assert.deepEqual(readdirSync(dir), ['state.json']);
});

test('exclusive temp creation is followed by a final snapshot check before rename', (t) => {
  const { fs, root } = fixture(t);
  const target = join(root, 'marker.json');
  writeFileSync(target, 'preflight');
  const expected = fs.read(target);
  const open = fsBuiltin.openSync;
  const write = fsBuiltin.writeFileSync;
  let temporary;
  t.mock.method(fsBuiltin, 'openSync', (path, flags, mode) => {
    if (path !== target) {
      assert.equal(dirname(path), root);
      assert.equal(flags, 'wx');
      assert.equal(mode, 0o600);
      temporary = path;
    }
    return open(path, flags, mode);
  });
  t.mock.method(fsBuiltin, 'writeFileSync', (fd, bytes) => {
    write(fd, bytes);
    write(target, 'slow writer');
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => fs.writeAtomic(target, 'install', expected), { code: 'CONCURRENT_MODIFICATION' });
    assert.ok(temporary);
    assert.equal(existsSync(temporary), false);
    assert.equal(readFileSync(target, 'utf8'), 'slow writer');
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('guard rejects symlink segments, escape, absent roots, nonregular and oversized files', (t) => {
  const { fs, root, homeDir, dir } = fixture(t);
  const sentinel = join(homeDir, 'sentinel');
  writeFileSync(sentinel, 'intact');
  const link = join(root, 'linked');
  symlinkSync(homeDir, link);
  const leaf = join(root, 'leaf');
  symlinkSync(sentinel, leaf);
  for (const target of [leaf, join(link, 'sentinel')]) {
    assert.throws(() => fs.read(target), { code: 'SYMLINK_REJECTED' });
    assert.throws(() => fs.writeAtomic(target, 'overwrite', null), { code: 'SYMLINK_REJECTED' });
  }
  assert.throws(() => fs.read(sentinel), { code: 'PATH_OUTSIDE_ROOT' });
  assert.throws(() => fs.read(join(root, 'control\n')), { code: 'UNSAFE_PATH_CHARS' });
  assert.throws(() => requireProjectRoot(link, { cwd: dir, homeDir }), { code: 'SYMLINK_REJECTED' });
  assert.throws(() => requireProjectRoot('absent', { cwd: root, homeDir }), { code: 'INVALID_ROOT', exitCode: 2 });
  assert.equal(existsSync(join(root, 'absent')), false);
  assert.equal(requireProjectRoot('project', { cwd: dir, homeDir }), root);
  assert.throws(() => requireProjectRoot('bad\n', { cwd: dir, homeDir }), { code: 'UNSAFE_PATH_CHARS', exitCode: 2 });
  assert.throws(() => fs.read(root), { code: 'IO_ERROR' });
  const pipe = join(root, 'pipe');
  assert.equal(spawnSync('/usr/bin/mkfifo', [pipe], { cwd: root, timeout: 3000 }).status, 0);
  assert.throws(() => fs.read(pipe), { code: 'IO_ERROR' });
  const big = join(root, 'big');
  writeFileSync(big, '12345');
  assert.throws(() => fs.read(big, { maxBytes: 4 }), { code: 'IO_ERROR' });
  assert.equal(readFileSync(sentinel, 'utf8'), 'intact');
});

test('marker deserialization rejects tampered paths and unsafe schema without leaking data', (t) => {
  const { fs, input, ctx, marker, markerPath, homeDir, raw, main } = fixture(t);
  const store = createMarkerStore(ctx, input);
  assert.equal(store.markerPath, markerPath);
  fs.writeAtomic(main, raw, null);
  fs.mkdir(dirname(markerPath));
  for (const change of [
    { schemaVersion: 2 }, { phase: 'done' }, { installDir: homeDir }, { targetDir: homeDir },
    { sharedConfigEdits: [{ ...marker.sharedConfigEdits[0], path: join(homeDir, 'SECRET') }] },
    { sharedConfigEdits: [{ ...marker.sharedConfigEdits[0], entry: 'SECRET' }] },
    ...['../bad', 'foo/../bad', '/bad', 'bad\x1b', 'foo//bar', 'foo\\bar'].map((key) => ({
      managedFiles: { [key]: marker.managedFiles['main.mjs'] },
    })),
  ]) {
    writeFileSync(markerPath, JSON.stringify({ ...marker, ...change }));
    assert.throws(() => store.read(), (error) => error.code === 'CONFIG_PARSE_ERROR' && !String(error).includes('SECRET'));
    assert.equal(inspectManagedStatus(store).status, 'modified');
    assert.throws(() => assertNoManagedConflict(store), { code: 'CONFIG_PARSE_ERROR' });
    assert.deepEqual(readFileSync(main), raw);
  }
  writeFileSync(markerPath, '{SECRET');
  assert.throws(() => store.read(), { code: 'CONFIG_PARSE_ERROR' });
});

test('marker snapshots, seven R/O statuses, and conflict preflights preserve config and file state', (t) => {
  const { fs, ctx, input, marker, homeDir, raw, main } = fixture(t);
  const store = createMarkerStore(ctx, input);
  const userStore = createMarkerStore(ctx, { host: 'codex', scope: 'user' });
  assert.equal(inspectManagedStatus(userStore).status, 'not-installed');
  assert.deepEqual(readdirSync(homeDir), []);
  const global = join(homeDir, '.dotdotgod/config.json');
  mkdirSync(dirname(global));
  writeFileSync(global, '{"apiKey":"SECRET"}');
  const userFs = createAdapterFs({ root: homeDir, homeDir });
  assert.throws(() => userFs.read(global), { code: 'PATH_OUTSIDE_ROOT' });
  assert.throws(() => userFs.writeAtomic(global, '', null), { code: 'PATH_OUTSIDE_ROOT' });
  assert.throws(() => userFs.removeFile(global, Buffer.from('')), { code: 'PATH_OUTSIDE_ROOT' });
  const status = (options) => inspectManagedStatus(store, options).status;
  assert.equal(status(), 'not-installed');
  assert.equal(status({ legacy: true }), 'legacy-coexist');
  assert.throws(() => assertNoManagedConflict(store, { legacy: true }), { code: 'LEGACY_COEXIST_CONFLICT' });
  fs.writeAtomic(main, raw, null);
  assert.throws(() => assertNoManagedConflict(store), { code: 'UNMANAGED_CONFLICT' });
  store.write({ ...marker, phase: 'staging' }, null);
  assert.equal(status(), 'partial');
  const staging = store.read();
  assert.equal(statSync(store.markerPath).mode & 0o777, 0o600);
  store.write(marker, staging.snapshot);
  assert.equal(status(), 'installed');
  const local = join(store.installDir, 'local.mjs');
  writeFileSync(local, 'unmanaged');
  assert.throws(() => assertNoManagedConflict(store, { plannedFiles: ['local.mjs'] }), { code: 'UNMANAGED_CONFLICT' });
  assert.equal(readFileSync(local, 'utf8'), 'unmanaged');
  assert.throws(() => store.write(marker, staging.snapshot), { code: 'CONCURRENT_MODIFICATION' });
  assert.equal(status({ coreVersion: '0.13.0' }), 'version-drift');
  rmSync(marker.runtime.nodePath);
  assert.equal(status(), 'broken-runtime');
  fs.writeAtomic(main, Buffer.from('fixture BYTE!'), raw);
  assert.equal(status(), 'modified');
  assert.throws(() => assertNoManagedConflict(store), { code: 'MODIFIED_CONFLICT' });
  rmSync(main);
  assert.equal(status(), 'partial');
  assert.deepEqual(assertNoManagedConflict(store).missing, ['main.mjs']);
  assert.equal(readFileSync(global, 'utf8'), '{"apiKey":"SECRET"}');
  assert.deepEqual(readdirSync(homeDir), ['.dotdotgod']);
  assert.deepEqual(readdirSync(dirname(global)), ['config.json']);
});

test('protected config is excluded under both the lexical and canonical home paths', (t) => {
  const { dir, homeDir } = fixture(t);
  const homeAlias = join(dir, 'home-alias');
  symlinkSync(homeDir, homeAlias);
  const config = join(homeDir, '.dotdotgod/config.json');
  mkdirSync(dirname(config));
  writeFileSync(config, 'private fixture');
  const fs = createAdapterFs({ root: dir, homeDir: homeAlias });
  for (const path of [config, join(homeAlias, '.dotdotgod/config.json')]) {
    assert.throws(() => fs.read(path), { code: 'PATH_OUTSIDE_ROOT' });
    assert.throws(() => fs.writeAtomic(path, 'change', null), { code: 'PATH_OUTSIDE_ROOT' });
  }
  assert.equal(readFileSync(config, 'utf8'), 'private fixture');
});

test('user OpenCode config uses only a safe absolute XDG_CONFIG_HOME', (t) => {
  const { ctx, homeDir, dir } = fixture(t);
  const userStore = (XDG_CONFIG_HOME) => createMarkerStore({ ...ctx, env: { XDG_CONFIG_HOME } }, { host: 'opencode', scope: 'user' });
  const custom = join(dir, 'xdg');
  assert.deepEqual(userStore(custom).configPaths, [join(custom, 'opencode/opencode.jsonc')]);
  assert.deepEqual(userStore('relative').configPaths, [join(homeDir, '.config/opencode/opencode.jsonc')]);
  assert.throws(() => userStore(join(dir, 'unsafe\n')), { code: 'UNSAFE_PATH_CHARS', exitCode: 1 });
  assert.throws(() => userStore('unsafe\n'), { code: 'UNSAFE_PATH_CHARS', exitCode: 1 });
  assert.deepEqual(readdirSync(homeDir), []);
  assert.equal(existsSync(custom), false);
});

test('workflow loader reads built-in assets and excludes arbitrary paths', () => {
  for (const name of ['load', 'init', 'plan', 'impact', 'doc-clarify']) {
    assert.equal(readWorkflow(name), readFileSync(new URL(`../../assets/workflows/${name}.md`, import.meta.url), 'utf8'));
  }
  assert.throws(() => readWorkflow('../package'), { code: 'INVALID_ARGUMENT' });
});
