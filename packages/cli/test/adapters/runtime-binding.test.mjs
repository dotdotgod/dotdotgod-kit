import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { adapterError, formatAdapterError } from '../../src/adapters/errors.mjs';
import { bindRuntime, runtimeArgv, runtimeHookCommand, runtimeIsPresent } from '../../src/adapters/runtime-binding.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'runtime-fixture-'));
  const privateTmp = join(dir, 'tmp');
  mkdirSync(privateTmp);
  // Only this test worker's TMPDIR changes; the persistent fixtures stay outside it.
  const prior = process.env.TMPDIR;
  process.env.TMPDIR = privateTmp;
  t.after(() => {
    if (prior === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prior;
    rmSync(dir, { recursive: true, force: true });
  });
  const entry = join(dir, "entry ' $name.mjs");
  const node = join(dir, 'node link');
  writeFileSync(entry, "console.log('0.12.0')");
  symlinkSync(process.execPath, node);
  const env = { PATH: dir, HOME: dir, TMPDIR: privateTmp, XDG_CONFIG_HOME: join(dir, 'config') };
  return { cwd: dir, homeDir: dir, env, nodeExecPath: node, cliEntryPath: entry, coreVersion: '0.12.0' };
}

const code = (code) => ({ code, exitCode: 1 });

test('pinned resolves symlinks, checks the Node floor and requires SQLite', (t) => {
  const ctx = fixture(t);
  const bind = (version, sqlite = true) => bindRuntime(ctx, { probe: () => ({ nodeVersion: version, sqlite }) });
  const binding = bind('22.5.0').binding;
  assert.equal(binding.nodePath, realpathSync(ctx.nodeExecPath));
  assert.equal(binding.cliEntry, ctx.cliEntryPath);
  assert.ok(Object.isFrozen(binding));
  assert.throws(() => bind('22.4.9'), code('NODE_VERSION_UNSUPPORTED'));
  assert.throws(() => bind('22.5.0-rc.1'), code('NODE_VERSION_UNSUPPORTED'));
  assert.throws(() => bind('22.5.0', false), code('SQLITE_UNAVAILABLE'));
  assert.equal(bindRuntime(ctx).binding.mode, 'pinned');
  assert.throws(() => bindRuntime({ ...ctx, env: { ...ctx.env, NODE_OPTIONS: '--no-experimental-sqlite' } }),
    code('SQLITE_UNAVAILABLE'));
});

test('pinned rejects all five transient locations before probing or writing', (t) => {
  const ctx = fixture(t);
  for (const dir of ['_npx', 'pnpm/dlx', 'yarn/dlx', 'bunx'].map((s) => join(ctx.cwd, s)).concat(realpathSync(tmpdir()))) {
    mkdirSync(dir, { recursive: true });
    const cliEntryPath = join(mkdtempSync(join(dir, 't3-')), 'cli.mjs');
    t.after(() => rmSync(dirname(cliEntryPath), { recursive: true, force: true }));
    writeFileSync(cliEntryPath, '');
    const alias = join(ctx.cwd, 'cli-alias');
    symlinkSync(cliEntryPath, alias);
    const before = readdirSync(dirname(cliEntryPath));
    assert.throws(() => bindRuntime({ ...ctx, cliEntryPath: alias }, { probe: () => assert.fail('probe ran') }),
      code('EPHEMERAL_RUNTIME_PATH'));
    assert.deepEqual(readdirSync(dirname(cliEntryPath)), before);
    rmSync(alias);
  }
});

test('--use-path checks the Node actually used by the CLI', (t) => {
  const ctx = fixture(t);
  const cli = join(ctx.cwd, 'dotdotgod');
  assert.throws(() => bindRuntime(ctx, { usePath: true }), code('PATH_CLI_NOT_FOUND'));
  writeFileSync(cli, '#!/bin/sh\necho 0.12.0\n', { mode: 0o700 });
  assert.throws(() => bindRuntime(ctx, { usePath: true }), code('PATH_CLI_INCOMPATIBLE'));
  writeFileSync(cli, '#!/bin/sh\nexec "${0%/*}/node link" "${0%/*}/entry" "$@"\n');
  writeFileSync(join(ctx.cwd, 'entry'), "console.log('0.12.0')");
  const result = bindRuntime(ctx, { usePath: true });
  assert.equal(result.binding.command, 'dotdotgod');
  assert.deepEqual(runtimeArgv(result.binding, ['mcp']), ['dotdotgod', 'mcp']);
  assert.deepEqual(result.warnings.map(({ code }) => code), ['USE_PATH_RISK']);
  for (const report of [{ nodeVersion: '22.4.9', sqlite: true }, { nodeVersion: '22.5.0', sqlite: false }]) {
    assert.throws(() => bindRuntime(ctx, { usePath: true, probe: () => ({ ...report, cliVersion: '0.12.0' }) }),
      code('PATH_CLI_INCOMPATIBLE'));
  }
  const temporary = join(mkdtempSync(join(tmpdir(), 'path-cli-')), 'dotdotgod');
  t.after(() => rmSync(dirname(temporary), { recursive: true, force: true }));
  writeFileSync(temporary, '', { mode: 0o700 });
  rmSync(cli);
  symlinkSync(temporary, cli);
  assert.throws(() => bindRuntime(ctx, { usePath: true, probe: () => assert.fail('probe ran') }),
    code('EPHEMERAL_RUNTIME_PATH'));
});

test('PATH preflight accepts a Node eval wrapper without a script argv', (t) => {
  const ctx = fixture(t);
  writeFileSync(join(ctx.cwd, 'dotdotgod'), '#!/bin/sh\nexec "${0%/*}/node link" -e \'console.log("0.12.0")\'\n', { mode: 0o700 });
  assert.equal(bindRuntime(ctx, { usePath: true }).binding.mode, 'path');
});

test('PATH lookup skips empty entries and status checks paths without invoking the CLI', (t) => {
  const ctx = fixture(t);
  const binding = { mode: 'path', command: 'dotdotgod' };
  writeFileSync(join(ctx.cwd, 'dotdotgod'), '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  const emptyPath = { ...ctx, env: { ...ctx.env, PATH: delimiter } };
  const pinned = { mode: 'pinned', nodePath: realpathSync(ctx.nodeExecPath), cliEntry: ctx.cliEntryPath };
  assert.throws(() => bindRuntime(emptyPath, { usePath: true }), code('PATH_CLI_NOT_FOUND'));
  assert.equal(runtimeIsPresent(binding, emptyPath), false);
  assert.equal(runtimeIsPresent(binding, ctx), true);
  assert.equal(runtimeIsPresent(pinned, ctx), true);
  for (const dir of [join(ctx.cwd, '_npx'), join(ctx.cwd, 'line\nbreak'), tmpdir()]) {
    mkdirSync(dir, { recursive: true });
    const cli = join(dir, 'dotdotgod');
    writeFileSync(cli, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
    const alternate = { ...ctx, env: { ...ctx.env, PATH: dir } };
    assert.equal(runtimeIsPresent(binding, alternate), false);
    assert.equal(runtimeIsPresent({ ...pinned, cliEntry: cli }, ctx), false);
  }
});

test('hook command quotes literal argv and rejects control characters with exit 1', (t) => {
  const ctx = fixture(t);
  writeFileSync(ctx.cliEntryPath, 'console.log(JSON.stringify(process.argv.slice(2)))');
  const binding = bindRuntime(ctx).binding;
  const args = ['hook', "space ' $literal"];
  const result = spawnSync('/bin/sh', ['-c', runtimeHookCommand(binding, args)], { cwd: ctx.cwd, env: ctx.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  for (const char of ['\0', '\n', '\x1b', '\x7f', '\x9f']) {
    assert.throws(() => runtimeHookCommand({ ...binding, cliEntry: binding.cliEntry + char }, args),
      code('UNSAFE_PATH_CHARS'));
  }
  assert.equal(adapterError('UNSAFE_PATH_CHARS').exitCode, 2);
  assert.equal(adapterError('INVALID_ROOT').exitCode, 2);
});

test('error JSON does not serialize arbitrary details or underlying exception text', () => {
  const error = adapterError('IO_ERROR', { target: '/safe', config: 'SECRET', detail: 'SECRET', cause: Error('SECRET') });
  const dto = formatAdapterError('install', 'codex', error);
  assert.equal(dto.schemaVersion, 1);
  assert.equal(dto.error.target, '/safe');
  assert.doesNotMatch(JSON.stringify(dto), /SECRET/);
  const fallback = formatAdapterError('install', undefined, Error('SECRET'));
  assert.doesNotMatch(JSON.stringify(fallback), /SECRET/);
  assert.deepEqual(Object.keys(fallback.error), ['code', 'detail', 'recovery']);
  assert.equal(Object.hasOwn(fallback, 'host'), false);
});
