import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveDecisionProfile, sanitizeDecisionProfile, validateDecisionProfile } from '../src/decision/config.mjs';

const bin = fileURLToPath(new URL('../bin/dotdotgod.mjs', import.meta.url));
const defaults = { mode: 'advisory', delivery: 'advice', fallback: 'advisory', timeoutMs: 2000 };
const remote = { mode: 'model', provider: 'openai-compatible', model: 'test-model' };

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dotdotgod-decision-config-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = join(dir, 'project');
  const home = join(dir, 'home');
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  mkdirSync(join(home, '.dotdotgod'), { recursive: true });
  const project = join(root, 'dotdotgod.config.json');
  const global = join(home, '.dotdotgod/config.json');
  const write = (path, data) => writeFileSync(path, JSON.stringify(data));
  const run = (command, ...args) => spawnSync(process.execPath, [bin, command, root, ...args], {
    env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 3000,
  });
  return { project, global, write, run, resolve: () => resolveDecisionProfile(root, { home }) };
}

test('decision profiles are defaulted and replaced whole at each precedence level', (t) => {
  const { resolve, project, global, write } = fixture(t);
  assert.deepEqual(resolve(), { source: 'default', path: null, profile: defaults });
  write(global, { decision: { ...remote, apiKeyEnv: 'DECISION_TEST_KEY', timeoutMs: 900 } });
  write(project, {});
  assert.deepEqual(resolve(), { source: 'global', path: global, profile: { ...defaults, ...remote, apiKeyEnv: 'DECISION_TEST_KEY', timeoutMs: 900 } });
  write(project, { decision: { mode: 'manual' } });
  assert.deepEqual(resolve(), { source: 'project', path: project, profile: { ...defaults, mode: 'manual' } });
});

test('invalid project JSON or schema blocks a valid global profile with one decision diagnostic', (t) => {
  const { project, global, write, resolve, run } = fixture(t);
  write(global, { decision: { mode: 'always' } });
  for (const data of [null, { memory: { areas: null } }, { decision: null }, { decision: { fallback: 'model' } }]) {
    write(project, data);
    assert.equal(resolve().source, 'invalid');
    assert.equal(resolve().profile, null);
  }
  const json = run('config', '--json');
  assert.equal(json.status, 1, json.stderr);
  const payload = JSON.parse(json.stdout);
  assert.deepEqual(payload.errors.map(({ code }) => code), ['DECISION_CONFIG_INVALID']);
  assert.equal(payload.decision.source, 'invalid');
  assert.equal(payload.decision.profile, null);
  const human = run('config');
  assert.equal(human.status, 1);
  assert.match(human.stdout, /decision: invalid.*global fallback blocked/);
  assert.equal(human.stdout.match(/DECISION_CONFIG_INVALID/g)?.length, 1);
  const validation = run('validate', '--json');
  assert.equal(validation.status, 1);
  assert.deepEqual(JSON.parse(validation.stdout).errors.map(({ code }) => code), ['DECISION_CONFIG_INVALID']);
});

test('validate ignores invalid global decision config and config inspection does not', (t) => {
  const { global, write, run } = fixture(t);
  write(global, { decision: { mode: 'NOT_A_MODE' } });
  assert.equal(run('validate', '--json').status, 0);
  const result = run('config', '--json');
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).errors[0].code, 'DECISION_CONFIG_INVALID');
});

test('config warns about project remote credentials and redacts raw keys', (t) => {
  const { project, global, write, run } = fixture(t);
  const decision = { ...remote, apiKeyEnv: 'DECISION_TEST_KEY', baseUrl: 'https://api.example.com/v1///' };
  write(project, { decision });
  const human = run('config');
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /decision: mode=model.*delivery=advice.*fallback=advisory.*timeoutMs=2000/);
  assert.match(human.stdout, /Warning: .*DECISION_TEST_KEY.*api\.example\.com/);
  const view = JSON.parse(run('config', '--json').stdout).decision;
  assert.equal(view.source, 'project');
  assert.equal(view.profile.baseUrl, 'https://api.example.com/v1');
  assert.match(view.warning, /api\.example\.com/);
  assert.match(view.warning, /apiKeyEnv.*DECISION_TEST_KEY/);
  write(project, {});
  write(global, { decision });
  assert.equal(JSON.parse(run('config', '--json').stdout).decision.warning, undefined);
  write(project, { decision: { ...remote, apiKey: 'sentinel-private-key' } });
  for (const args of [[], ['--json']]) {
    const result = run('config', ...args);
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout + result.stderr, /sentinel-private-key/);
    assert.match(result.stdout, /\[redacted\]/);
  }
  assert.equal(sanitizeDecisionProfile({ ...remote, apiKey: 'sentinel-private-key' }).apiKey, '[redacted]');
});

test('malformed config diagnostics never print a V8 source snippet', (t) => {
  const { project, global, resolve, run } = fixture(t);
  const broken = '{"decision":{"apiKey":sentinel-private-json-key}}';
  writeFileSync(project, broken);
  assert.equal(resolve().source, 'invalid');
  assert.doesNotMatch(JSON.stringify(resolve()), /sentinel-private-json-key/);
  for (const command of ['config', 'validate']) {
    for (const args of [[], ['--json']]) {
      const result = run(command, ...args);
      assert.equal(result.status, 1);
      assert.match(result.stdout + result.stderr, /MEMORY_CONFIG_INVALID_JSON/);
      assert.doesNotMatch(result.stdout + result.stderr, /sentinel-private-json-key/);
    }
  }
  rmSync(project);
  writeFileSync(global, broken);
  const result = run('config', '--json');
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /sentinel-private-json-key/);
});

test('config reads reject symlinks, non-regular files and more than 256 KiB', (t) => {
  const { project, global, write, resolve, run } = fixture(t);
  write(global, { decision: { mode: 'manual' } });
  symlinkSync(global, project);
  assert.equal(resolve().source, 'invalid');
  assert.equal(run('config', '--json').status, 1);
  rmSync(project);
  mkdirSync(project);
  assert.equal(resolve().source, 'invalid');
  rmSync(project, { recursive: true });
  if (process.platform !== 'win32') {
    assert.equal(spawnSync('mkfifo', [project]).status, 0);
    assert.equal(run('config', '--json').status, 1);
    rmSync(project);
  }
  const json = JSON.stringify({ decision: { mode: 'always' } });
  writeFileSync(project, json.padEnd(262144));
  assert.equal(resolve().profile.mode, 'always');
  writeFileSync(project, json.padEnd(262145));
  assert.equal(resolve().source, 'invalid');
  rmSync(project);
  rmSync(global);
  symlinkSync(project, global);
  assert.equal(resolve().source, 'invalid');
});

test('decision allowlist, integer bounds, mutually exclusive credentials and host fields', () => {
  for (const fields of [
    { extra: true }, { mode: 'bad' }, { delivery: 'bad' }, { fallback: 'model' },
    { provider: 'local' }, { timeoutMs: 199 }, { timeoutMs: 15001 }, { timeoutMs: 200.5 }, { timeoutMs: '200' },
    { model: ' ' }, { apiKey: '' }, { apiKeyEnv: '1_INVALID' }, { apiKeyEnv: 'INVALID-NAME' },
    { apiKey: 'secret', apiKeyEnv: 'KEY' },
  ]) assert.throws(() => validateDecisionProfile({ ...remote, ...fields }), /decision/);
  for (const timeoutMs of [200, 15000]) assert.equal(validateDecisionProfile({ timeoutMs }).timeoutMs, timeoutMs);
  const host = { mode: 'model', provider: 'host' };
  assert.deepEqual(validateDecisionProfile(host), { ...defaults, ...host });
  assert.equal(validateDecisionProfile({ ...host, model: 'vendor/m' }).model, 'vendor/m');
  for (const fields of [{ baseUrl: 'https://example.com' }, { apiKey: 'secret' }, { apiKeyEnv: 'KEY' }, { model: ' ' }]) {
    assert.throws(() => validateDecisionProfile({ ...host, ...fields }), /decision/);
  }
});

test('decision URL normalizes hosts and rejects credentials, delimiters and unsafe literals', () => {
  for (const baseUrl of [
    'https://user:secret@example.com', 'https://@example.com', 'https://\t/@example.com',
    'https://example.com?secret', 'https://example.com?', 'https://example.com/#secret', 'https://example.com/#',
    'file:///etc/config', 'relative/path', 'https://169.254.1.5', 'https://0xa9fe0105',
    'https://0.42.0.1', 'https://0.0.0.0', 'https://[::]', 'https://[fea0::1]',
    'https://[::ffff:169.254.9.1]', 'https://[::ffff:a9fe:901]',
  ]) assert.throws(() => validateDecisionProfile({ ...remote, baseUrl }), /decision\.baseUrl/);
  for (const host of ['example.com', 'localhost.example.com', '192.168.1.4', '[2001:db8::1]']) {
    for (const credential of [{ apiKey: 'secret' }, { apiKeyEnv: 'KEY' }]) {
      assert.throws(() => validateDecisionProfile({ ...remote, baseUrl: `http://${host}`, ...credential }), /decision\.baseUrl/);
    }
  }
  for (const host of ['localhost', '127.1.2.3', '[::1]']) {
    assert.equal(validateDecisionProfile({ ...remote, baseUrl: `http://${host}///`, apiKeyEnv: 'KEY' }).baseUrl, `http://${host}`);
    assert.equal(sanitizeDecisionProfile(validateDecisionProfile({ ...remote, baseUrl: `http://${host}` }), 'project').warning, undefined);
  }
  assert.equal(validateDecisionProfile({ ...remote, baseUrl: 'http://example.com/' }).baseUrl, 'http://example.com');
});
