import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { formatShellPath, formatStatus, formatError } from '../../src/commands/adapter-format.mjs';
import { adapterError, formatAdapterError } from '../../src/adapters/errors.mjs';

const bin = fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'adapter-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = join(dir, "home '$");
  const root = join(dir, "work '$");
  mkdirSync(home);
  mkdirSync(root);
  const temp = join(dir, 'temp');
  mkdirSync(temp);
  const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: join(dir, 'xdg'), CODEX_HOME: join(home, '.codex'), TMPDIR: temp, TMP: temp, TEMP: temp };
  return { home, root, env, run: (...args) => spawnSync(process.execPath, [bin, ...args], { cwd: root, env, encoding: 'utf8' }) };
}

test('U-1: two-level help and scoped usage errors', (t) => {
  const { run, home, root } = fixture(t);
  assert.match(run('--help').stdout, /adapter/);
  const overview = run('help', 'adapter');
  assert.equal(overview.status, 0);
  for (const command of ['install', 'uninstall', 'status', 'setup-plan']) {
    assert.match(overview.stdout, new RegExp(`adapter ${command} `));
    const help = run('help', 'adapter', command);
    assert.equal(help.status, 0);
    assert.match(help.stdout, new RegExp(`^Usage:\\s+dotdotgod adapter ${command} `));
    assert.equal(run('adapter', command, '--help').stdout, help.stdout);
  }
  for (const [args, code] of [
    [['install'], 'INVALID_ARGUMENT'], [['bogus'], 'INVALID_ARGUMENT'],
    [['uninstall', 'codex', '--keep-modified'], 'INVALID_ARGUMENT'],
    [['install', 'not-a-host'], 'INVALID_HOST'], [['setup-plan', 'hermes'], 'INVALID_HOST'],
    [['install', 'obsidian'], 'OBSIDIAN_UNSUPPORTED'], [['install', 'pi'], 'PI_REQUIRES_WITH_SKILLS'],
    [['uninstall', 'pi'], 'PI_REQUIRES_WITH_SKILLS'],
    [['install', 'codex', '--scope', 'project'], 'INVALID_SCOPE'],
    [['install', 'codex', '--root', '.'], 'INVALID_ROOT'],
    [['install', 'opencode', '--scope', 'user', '--root', '.'], 'INVALID_ROOT'],
    [['status', '--scope', 'global'], 'INVALID_SCOPE'],
    [['install', 'opencode', '--root', 'absent'], 'INVALID_ROOT'],
    [['install', 'opencode', '--root', 'bad\x1b[31m'], 'UNSAFE_PATH_CHARS'],
    [['setup-plan', 'codex', '--catalog', 'bad\n'], 'UNSAFE_PATH_CHARS'],
  ]) {
    const result = run('adapter', ...args, '--json');
    assert.equal(result.status, 2, `${args}: ${result.stderr} ${result.stdout}`);
    assert.equal(result.stderr, '');
    assert.equal(JSON.parse(result.stdout).error.code, code);
  }
  const human = run('adapter', 'uninstall', 'pi');
  assert.equal(human.stdout, '');
  assert.match(human.stderr, /pi install npm:@dotdotgod\/pi[\s\S]*Usage:\s+dotdotgod adapter uninstall/);
  assert.deepEqual(readdirSync(home), []);
  assert.deepEqual(readdirSync(root), []);
});

test('U-1: Pi status and global settings are read-only; JSON paths are not HOME-masked', (t) => {
  const { run, home } = fixture(t);
  mkdirSync(join(home, '.dotdotgod'));
  // An unsafe global config proves adapter status does not traverse its target.
  symlinkSync(join(home, 'does-not-exist'), join(home, '.dotdotgod/config.json'));
  const pi = run('adapter', 'status', 'pi', '--json');
  assert.equal(pi.status, 0, pi.stderr);
  assert.equal(JSON.parse(pi.stdout).hosts[0].status, 'not-installed');
  const json = run('adapter', 'status', 'opencode', '--root', home, '--json');
  assert.equal(JSON.parse(json.stdout).opencodeInspected.root, home);
  const human = run('adapter', 'status', 'opencode', '--root', home);
  assert.match(human.stdout, /opencode inspected: project \(~\)/);
  assert.ok(!human.stdout.includes(home));
  assert.deepEqual(readdirSync(join(home, '.dotdotgod')), ['config.json']);
});

test('U-1: runtime path safety errors are exit 1 without human usage or writes', (t) => {
  const { run, env, home, root } = fixture(t);
  env.CODEX_HOME = join(home, 'bad\x1b[31m');
  const result = run('adapter', 'install', 'codex', '--json');
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).error.code, 'UNSAFE_PATH_CHARS');
  assert.deepEqual(readdirSync(home), []);
  assert.deepEqual(readdirSync(root), []);
});

test('U-1: terminal-safe output, DETAIL-only truncation, shell paths and allowlisted errors', () => {
  assert.equal(formatShellPath('/home/example', '/home/example'), '"$HOME"');
  assert.equal(formatShellPath("/home/example/a'b $c", '/home/example'), `"$HOME"'/a'\\''b $c'`);
  assert.equal(formatShellPath('/home/examples/$c', '/home/example'), "'/home/examples/$c'");
  const path = `/home/example/${'long/'.repeat(20)}repo`;
  const statuses = ['installed', 'not-installed', 'broken-runtime', 'version-drift', 'partial', 'modified', 'legacy-coexist'];
  const hosts = statuses.map((status, index) => ({ host: `test${index}`, scope: 'user', status,
    detail: `${path}\x1b[31m\x1b]0;HIDDEN\x07\x1bPHIDDEN\x1b\\\x9fHIDDEN\x9c\x01`,
    recovery: index === 0 ? [{ argv: ['dotdotgod', 'adapter', 'install', 'opencode', '--root', path] }] : [] }));
  const output = formatStatus({ coreVersion: '0.11.0', nodeVersion: '22.23.2', hosts, opencodeInspected: null }, '/home/example', false);
  for (const status of statuses) assert.ok(output.includes(status));
  const rows = output.split('\n').filter((line) => /^test\d/u.test(line));
  assert.equal(rows.length, 7);
  assert.ok(rows.every((line) => line.length === 77 && line.endsWith('...')));
  assert.ok(output.includes(`Recovery commands:\n  [test0]\n    dotdotgod adapter install opencode --root ${formatShellPath(path, '/home/example')}`));
  const error = adapterError('CONFIG_PARSE_ERROR', { target: path });
  error.details.raw = 'SENTINEL_SECRET';
  const dto = formatAdapterError('install', 'opencode', error);
  assert.ok(!JSON.stringify(dto).includes('SENTINEL_SECRET'));
  assert.ok(!formatError(dto.error, '/home/example').includes('/home/example'));
  assert.doesNotMatch(output, /HIDDEN|[\x1b\x01\x9f]/u);
});

test('U-1: Codex Plan preview preserves explicit inputs, shell quoting and the execution boundary', (t) => {
  const { root, home, run } = fixture(t);
  const codex = join(home, "codex '$");
  const catalog = join(home, "catalog '$");
  writeFileSync(catalog, '{"models":[{"slug":"fixture"}]}');
  writeFileSync(codex, `#!/bin/sh\nif [ "$1" = --version ]; then echo 'codex-cli 0.163.0'; exit 0; fi\nread -r one\necho '{"id":1,"result":{}}'\nread -r two\nread -r three\necho '{"id":2,"result":{"config":{}}}'\n`, { mode: 0o700 });
  const args = ['adapter', 'setup-plan', 'codex', root, '--codex', codex, '--catalog', catalog];
  const human = run(...args);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /preview; pass --confirm to write[\s\S]*\[EXECUTION BOUNDARY\]/);
  assert.ok(human.stdout.includes(`--codex ${formatShellPath(codex, home)} --catalog ${formatShellPath(catalog, home)} --confirm`));
  assert.ok(!human.stdout.includes(home));
  const json = run(...args, '--json');
  assert.equal(json.status, 0, json.stderr);
  const plan = JSON.parse(json.stdout);
  assert.equal(plan.launch[0], codex);
  assert.ok(plan.apply.includes(codex) && plan.apply.includes(catalog));
  assert.deepEqual(readdirSync(root), []);
  assert.deepEqual(readdirSync(home).sort(), ["catalog '$", "codex '$"]);
});

test('U-1: SIGTERM during the synchronous PATH preflight stops before host writes', (t) => {
  const { env, root, home, run } = fixture(t);
  writeFileSync(join(root, 'dotdotgod'), `#!/bin/sh\nkill -TERM "$PPID"\nexec node ${formatShellPath(bin, home)} "$@"\n`, { mode: 0o700 });
  env.PATH = `${root}:${env.PATH}`;
  const result = run('adapter', 'install', 'hermes', '--use-path', '--json');
  assert.equal(result.status, 143, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(readdirSync(home), []);
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  test(`U-1: ${signal} abort closes Codex child, suppresses output and removes listeners`, async (t) => {
    const { env, root } = fixture(t);
    const codex = join(root, 'fake-codex');
    const stopped = join(root, 'stopped');
    writeFileSync(codex, `#!/bin/sh\nif [ "$1" = --version ]; then echo 'codex-cli 0.163.0'; exit 0; fi\nexec node ${JSON.stringify(join(root, 'rpc.mjs'))}\n`, { mode: 0o700 });
    writeFileSync(join(root, 'rpc.mjs'), `import { writeFileSync } from 'node:fs';\nprocess.on('SIGTERM', () => { writeFileSync(${JSON.stringify(stopped)}, 'closed'); process.exit(0); });\nprocess.stdin.resume();\nprocess.kill(process.ppid, ${JSON.stringify(signal)});\n`);
    const uri = new URL('../../src/commands/adapter.mjs', import.meta.url).href;
    const script = `import assert from 'node:assert/strict'; import {runAdapter} from ${JSON.stringify(uri)};
      const count = () => ['SIGINT','SIGTERM'].map(s => process.listenerCount(s));
      const before = count(); await runAdapter(['setup-plan','codex','--codex',${JSON.stringify(codex)},'--json']);
      assert.deepEqual(count(), before);`;
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--eval', script], { cwd: root, env });
      let stdout = '', stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (status) => resolve({ status, stdout, stderr }));
    });
    assert.deepEqual(result, { status: code, stdout: '', stderr: '' });
    assert.equal(readFileSync(stopped, 'utf8'), 'closed');
  });
}
