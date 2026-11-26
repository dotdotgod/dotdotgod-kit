import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const bin = fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url));
const nodeArgs = ['--disable-warning=ExperimentalWarning'];
const preload = (source) => '--import=data:text/javascript,' + encodeURIComponent(source);
const noHome = preload(`
  import os from 'node:os';
  import { syncBuiltinESMExports } from 'node:module';
  os.homedir = () => { throw new Error('home unavailable'); };
  syncBuiltinESMExports();
`);
const noSpawn = preload(`
  import childProcess from 'node:child_process';
  import sqlite from 'node:sqlite';
  import { syncBuiltinESMExports } from 'node:module';
  childProcess.spawn = () => { process.exit(99); };
  sqlite.DatabaseSync = function () { process.exit(98); };
  syncBuiltinESMExports();
`);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-dispatch-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(args, options = {}, entry = bin, flags = []) {
  return spawnSync(process.execPath, [...nodeArgs, ...flags, entry, ...args], { encoding: 'utf8', timeout: 5000, ...options });
}

function assertHookFailure(result) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '{}\n');
  assert.match(result.stderr, /^dotdotgod hook error: [^\n]+\n$/);
  assert.doesNotMatch(result.stderr.slice(0, -1), /[\x00-\x1f\x7f-\x9f]/);
  assert.ok(result.stderr.trimEnd().length <= 240);
}

test('hook dispatch fails open on invalid invocation, stdin, and lazy-load errors', (t) => {
  for (const args of [[], ['codex'], ['unknown', 'posttooluse'], ['codex', 'unknown']]) {
    assertHookFailure(run(['hook', ...args]));
  }
  assertHookFailure(run(['hook', 'antigravity', 'posttooluse'], { input: '{' }));
  assertHookFailure(run(['hook', 'hermes', 'decision'], { input: '[]' }));

  const home = fixture(t);
  const copy = join(home, 'bin', 'dotdotgod.mjs');
  mkdirSync(join(home, 'bin'));
  mkdirSync(join(home, 'src', 'context'), { recursive: true });
  copyFileSync(bin, copy);
  for (const path of ['primitives.mjs', 'context/hook-state.mjs']) {
    copyFileSync(new URL(`../../src/${path}`, import.meta.url), join(home, 'src', path));
  }
  const options = { env: { ...process.env, HOME: home }, input: '{}' };
  const missing = run(['hook', 'codex', 'posttooluse'], options, copy);
  assertHookFailure(missing);
  assert.ok(!missing.stderr.includes(home));
  assert.match(missing.stderr, /~\/src\/context\/hooks\.mjs/);
  assertHookFailure(run(['hook', 'hermes', 'decision'], options, copy));

  const styledHome = `${home.slice(0, 4)}\u001b[31m${home.slice(4)}`;
  const message = `\u001b]8;;hidden\u0007\u0090opaque\u009c${styledHome}/runtime\u001b[0m\u0085\u0002 ${'x'.repeat(300)}`;
  writeFileSync(join(home, 'src', 'context', 'hooks.mjs'), `throw new Error(${JSON.stringify(message)});`);
  const thrown = run(['hook', 'claude-code', 'sessionstart'], options, copy);
  assertHookFailure(thrown);
  assert.match(thrown.stderr, /~\/runtime .*\.\.\.\n$/);
  assert.doesNotMatch(thrown.stderr, /hidden|opaque/);

  const unavailableHome = run(['hook', 'codex', 'posttooluse'], options, copy, [noHome]);
  assertHookFailure(unavailableHome);
  assert.match(unavailableHome.stderr, /~\/runtime/);
  assert.ok(!unavailableHome.stderr.includes(home));
  const rootHome = run(['hook', 'codex', 'posttooluse'], { ...options, env: { ...options.env, HOME: '/' } }, copy);
  assertHookFailure(rootHome);
  assert.ok(rootHome.stderr.includes(`${home}/runtime`));
});

test('Hermes decision is dispatched with the existing state response', (t) => {
  const root = fixture(t);
  const state = { assessed: false, loaded: false, notified: false, skipCount: 0, lastPromptHash: null };
  const result = run(['hook', 'hermes', 'decision'], { input: JSON.stringify({ root, rawPrompt: 'hello', sessionState: state }) });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.ok, true);
  assert.deepEqual(output.state, state);
  assert.deepEqual(readdirSync(root), []);
});

test('Hermes decision preserves structured errors for valid JSON with domain or runtime failures', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'dotdotgod.config.json'), '{}');
  const args = ['hook', 'hermes', 'decision'];
  const results = [
    run(args, { input: JSON.stringify({ root, rawPrompt: { toString: 0 } }) }),
    run(args, { input: JSON.stringify({ root }) }, bin, [noHome]),
  ];
  for (const result of results) {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual(JSON.parse(result.stdout), { ok: false, errorLine: 'dotdotgod decision: state_error' });
  }
});

test('Antigravity CLI routes a valid edit and emits the pending advisory at PreInvocation', (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'dotdotgod.config.json'), '{"decision":{"mode":"advisory"}}');
  const file = join(root, 'edited.ts');
  writeFileSync(file, 'export const edited = true;');
  const session = { conversationId: 'agy-session', workspacePaths: [root] };
  const edit = run(['hook', 'antigravity', 'PostToolUse'], {
    input: JSON.stringify({ ...session, toolCall: { name: 'write_file', args: { Path: file } }, error: '' }),
  });
  assert.equal(edit.status, 0, edit.stderr);
  assert.deepEqual(JSON.parse(edit.stdout), {});
  const pre = run(['hook', 'antigravity', 'PreInvocation'], { input: JSON.stringify(session) });
  assert.equal(pre.status, 0, pre.stderr);
  const [{ systemMessage }] = JSON.parse(pre.stdout).injectSteps;
  assert.match(systemMessage.systemMessage, /DOTDOTGOD IMPACT PENDING.*edited\.ts/s);
});

test('bridge rejects invalid roots/sessions without spawning; discovery is in-process and read-only', (t) => {
  const root = fixture(t);
  const file = join(root, 'file');
  writeFileSync(file, 'fixture');
  for (const args of [[join(root, 'missing'), 'session'], [file, 'session'], [root, 'default'], [root, '../bad'], [root]]) {
    const result = run(['mcp-bridge', ...args], { cwd: root }, bin, [noSpawn]);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
  }
  let tools;
  for (const session of ['default', '../bad']) {
    const options = { cwd: root, env: { ...process.env, DOTDOTGOD_SESSION_ID: session } };
    const listed = run(['mcp-bridge', '--list-tools'], options, bin, [noSpawn]);
    assert.equal(listed.status, 0, listed.stderr);
    const catalog = JSON.parse(listed.stdout);
    tools ??= catalog;
    assert.deepEqual(catalog, tools);
    const server = run(['mcp'], options, bin, [noSpawn]);
    assert.equal(server.status, 1, server.stderr);
    assert.match(server.stderr, /sessionId must be an opaque/);
    assert.equal(server.stdout, '');
  }
  assert.equal(new Set(tools.map(tool => tool.name)).size, 19);
  assert.ok(tools.some(tool => tool.name === 'project_initialize' && tool.inputSchema.properties.confirmWrite));
  assert.deepEqual(readdirSync(root), ['file']);

  const live = run(['mcp-bridge', root, 'bridge-session'], { input: '{"list":true}\n', env: { ...process.env, PATH: root } });
  assert.equal(live.status, 0, live.stderr);
  assert.deepEqual(JSON.parse(live.stdout), { ok: true, value: { tools } });
  assert.deepEqual(readdirSync(root), ['file']);
});

test('bridge SIGTERM aborts a request, reaps the server and a SIGTERM-ignoring command, and never replays', { skip: process.platform === 'win32', timeout: 10000 }, async (t) => {
  const root = fixture(t);
  const pidsPath = join(root, 'pids');
  const signalPath = join(root, 'saw-sigterm');
  const script = `
    const { appendFileSync, writeFileSync } = require('node:fs');
    process.on('SIGTERM', () => writeFileSync(${JSON.stringify(signalPath)}, 'received'));
    appendFileSync(${JSON.stringify(pidsPath)}, JSON.stringify([process.pid, process.ppid]) + '\\n');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, [...nodeArgs, bin, 'mcp-bridge', root, 'bridge-session'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exited = once(child, 'close');
  let pids;
  t.after(() => {
    child.kill('SIGTERM');
    for (const pid of pids ?? []) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', value => { stderr += value; });
  child.stdout.resume();
  child.stdin.write(JSON.stringify({ name: 'execute', arguments: { commands: [{ executable: process.execPath, args: ['-e', script] }] } }) + '\n');
  const deadline = Date.now() + 5000;
  while (!existsSync(pidsPath) && Date.now() < deadline && child.exitCode === null) await delay(10);
  assert.ok(existsSync(pidsPath), stderr);
  const started = readFileSync(pidsPath, 'utf8');
  pids = JSON.parse(started);
  const group = (pid) => execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  assert.equal(group(pids[1]), group(child.pid));
  child.kill('SIGTERM');
  assert.deepEqual(await exited, [0, null], stderr);
  assert.equal(readFileSync(pidsPath, 'utf8'), started);
  assert.equal(readFileSync(signalPath, 'utf8'), 'received');
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  pids = undefined;
});
