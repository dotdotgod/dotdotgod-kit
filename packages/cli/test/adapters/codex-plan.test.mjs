import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setupCodexPlan } from '../../src/adapters/codex-plan.mjs';

const native = readFileSync(new URL('../../assets/adapters/codex/NATIVE_PLAN.md', import.meta.url), 'utf8');

function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-codex-plan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const homeDir = join(dir, 'home');
  const cwd = join(dir, 'project with spaces');
  const CODEX_HOME = join(homeDir, '.codex');
  const codex = join(dir, 'fake codex');
  const catalog = join(dir, 'chosen catalog.json');
  const term = join(dir, 'term');
  mkdirSync(CODEX_HOME, { recursive: true });
  mkdirSync(cwd);
  writeFileSync(join(CODEX_HOME, 'config.toml'), 'model_provider = "keep"\n');
  writeFileSync(catalog, JSON.stringify({ models: [{ slug: 'chosen', priority: 7, model_messages: {
    instructions_template: 'keep', collaboration_modes: { default: 'keep default', plan: native },
  } }] }));
  writeFileSync(codex, `#!${process.execPath}\n` + String.raw`
const { createInterface } = require('node:readline');
const { unlinkSync, writeFileSync } = require('node:fs');
const { VERSION, CONFIG, RPC, TERM } = process.env;
if (process.argv[2] === '--version') {
  if (RPC === 'spawn-error') unlinkSync(process.argv[1]);
  console.log('codex-cli ' + (VERSION || '0.163.0'));
  return;
}
if (process.argv.slice(2).join(' ') !== 'app-server --stdio') process.exit(2);
if (RPC === 'timeout') {
  process.on('SIGTERM', () => { writeFileSync(TERM, 'SIGTERM'); process.exit(0); });
  process.stdin.resume();
  return;
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);
  if (!message.id) return;
  if (RPC === 'malformed') { console.log('{SENTINEL_SECRET'); return; }
  if (RPC === 'error') { console.log(JSON.stringify({ id: message.id, error: { message: 'SENTINEL_SECRET' } })); return; }
  console.log(JSON.stringify({ id: message.id, result: message.method === 'config/read' ? { config: JSON.parse(CONFIG || '{}') } : {} }));
});
`, { mode: 0o700 });
  const env = { PATH: '/usr/bin:/bin', HOME: homeDir, CODEX_HOME, TMPDIR: dir, TERM: term };
  return { dir, ctx: { cwd, homeDir, env, coreVersion: '0.11.0' }, options: { root: cwd, catalog, codex }, term };
}

function failure(code) {
  return (error) => {
    assert.equal(error.code, code);
    assert.doesNotMatch(JSON.stringify(error) + error.message, /SENTINEL_SECRET/);
    return true;
  };
}

test('U-6: read-only preview, fixed boundary, native template invariants, exclusive confirm', async (t) => {
  const { ctx, options } = fixture(t);
  const before = readFileSync(join(ctx.env.CODEX_HOME, 'config.toml'));
  const preview = await setupCodexPlan(ctx, options);
  assert.equal(preview.dryRun, true);
  assert.match(preview.boundary, /EXECUTION BOUNDARY.*MCP and hooks/s);
  assert.deepEqual(preview.launch, [options.codex, '--no-daemon', '--profile', preview.profile, '--cd', options.root]);
  assert.deepEqual(preview.apply, ['dotdotgod', 'adapter', 'setup-plan', 'codex', options.root,
    '--codex', options.codex, '--catalog', options.catalog, '--confirm']);
  for (const path of [preview.profilePath, join(options.root, 'docs'), join(options.root, '.dotdotgod')]) assert.equal(existsSync(path), false);
  const result = await setupCodexPlan(ctx, { ...options, confirm: true });
  assert.equal(result.dryRun, false);
  assert.equal(statSync(join(options.root, 'docs/plan')).isDirectory(), true);
  for (const path of [result.profilePath, result.catalogPath]) assert.equal(statSync(path).mode & 0o777, 0o600);
  const profile = readFileSync(result.profilePath, 'utf8');
  assert.match(profile, /extends = ":read-only"/);
  assert.ok(profile.includes(`filesystem.${JSON.stringify(options.root)}`));
  assert.match(profile, /"\." = "read"\n"docs\/plan" = "write"/);
  assert.doesNotMatch(profile, /danger-full-access|approval_policy|model_provider|:workspace_roots/);
  const [model] = JSON.parse(readFileSync(result.catalogPath, 'utf8')).models;
  assert.equal(model.priority, 7);
  assert.equal(model.model_messages.instructions_template, 'keep');
  assert.equal(model.model_messages.collaboration_modes.default, 'keep default');
  const plan = model.model_messages.collaboration_modes.plan;
  assert.match(plan, /only permitted project mutation.*docs\/plan/);
  assert.doesNotMatch(plan, /You must not perform \*\*mutating\*\* actions/);
  for (const phrase of ['developer message explicitly ends it', 'request_user_input', '<proposed_plan>', 'Do not confuse it with Plan mode', 'Running formatters', 'without a separate save request', 'Do not use MCP, hooks, subagents, or permission escalation']) assert.ok(plan.includes(phrase), phrase);
  await assert.rejects(setupCodexPlan(ctx, { ...options, confirm: true }), failure('CODEX_PLAN_EXISTS'));
  assert.deepEqual(readFileSync(join(ctx.env.CODEX_HOME, 'config.toml')), before);
});

test('U-6: version, symlink, and launch control checks fail before writing', async (t) => {
  const { ctx, options, dir } = fixture(t);
  await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, VERSION: '0.166.0' } }, { ...options, confirm: true }), failure('CODEX_VERSION_MISMATCH'));
  await assert.rejects(setupCodexPlan(ctx, { ...options, codex: 'hidden\u009b' }), failure('UNSAFE_PATH_CHARS'));
  const link = join(dir, 'link');
  symlinkSync(options.root, link);
  await assert.rejects(setupCodexPlan(ctx, { ...options, root: link }), failure('SYMLINK_REJECTED'));
  await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, CODEX_HOME: link } }, options), failure('SYMLINK_REJECTED'));
  mkdirSync(join(options.root, 'docs'));
  symlinkSync(dir, join(options.root, 'docs/plan'));
  await assert.rejects(setupCodexPlan(ctx, { ...options, confirm: true }), failure('SYMLINK_REJECTED'));
  assert.equal(existsSync(join(options.root, '.dotdotgod')), false);
});

test('U-6: configuration, RPC, and catalog failures never echo raw input', async (t) => {
  const { ctx, options } = fixture(t);
  for (const key of ['sandbox_mode', 'sandbox_workspace_write', 'default_permissions', 'permissions', 'profile', 'include_collaboration_mode_instructions']) {
    const value = key === 'include_collaboration_mode_instructions' ? false : 'SENTINEL_SECRET';
    await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, CONFIG: JSON.stringify({ [key]: value }) } }, options), failure('CODEX_CONFIG_CONFLICT'));
  }
  for (const RPC of ['malformed', 'error']) {
    await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, RPC } }, options), failure('IO_ERROR'));
  }
  for (const input of ['{SENTINEL_SECRET', '{}', '{"models":[null]}', '{"models":[{"slug":"a","model_messages":[]}]}']) {
    writeFileSync(options.catalog, input);
    await assert.rejects(setupCodexPlan(ctx, options), failure('CONFIG_PARSE_ERROR'));
  }
  writeFileSync(options.catalog, JSON.stringify({ models: [{ slug: 'SENTINEL_SECRET', model_messages: { collaboration_modes: { plan: 'SENTINEL_SECRET' } } }] }));
  await assert.rejects(setupCodexPlan(ctx, options), failure('CODEX_CONFIG_CONFLICT'));
});

test('U-6: unsafe catalogs preserve file-safety codes without leaking RPC configuration', async (t) => {
  const { ctx, options, dir } = fixture(t);
  const link = join(dir, 'SENTINEL_SECRET link.json');
  symlinkSync(options.catalog, link);
  symlinkSync(options.catalog, join(ctx.env.CODEX_HOME, 'models_cache.json'));
  await assert.rejects(setupCodexPlan(ctx, { ...options, catalog: link }), { code: 'SYMLINK_REJECTED' });
  await assert.rejects(setupCodexPlan(ctx, { ...options, catalog: undefined }), failure('SYMLINK_REJECTED'));
  const linkedConfig = JSON.stringify({ model_catalog_json: link });
  await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, CONFIG: linkedConfig } }, { ...options, catalog: undefined }), failure('SYMLINK_REJECTED'));
  const protectedPath = join(ctx.homeDir, '.dotdotgod/config.json');
  await assert.rejects(setupCodexPlan(ctx, { ...options, catalog: protectedPath }), failure('PATH_OUTSIDE_ROOT'));
  const CONFIG = JSON.stringify({ model_catalog_json: join(dir, 'SENTINEL_SECRET\u009b.json') });
  await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, CONFIG } }, { ...options, catalog: undefined }), failure('UNSAFE_PATH_CHARS'));
  assert.equal(existsSync(join(options.root, 'docs/plan')), false);
});

test('U-6: real app-server spawn ENOENT emits error then close and leaves no timer or abort listener', (t) => {
  const { ctx, options, dir } = fixture(t);
  const module = new URL('../../src/adapters/codex-plan.mjs', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    import cp from 'node:child_process';
    import { getEventListeners } from 'node:events';
    import { syncBuiltinESMExports } from 'node:module';
    const spawn = cp.spawn;
    const events = [];
    const delays = [];
    const active = new Set();
    const set = globalThis.setTimeout;
    const clear = globalThis.clearTimeout;
    let rpcStarted = false;
    globalThis.setTimeout = (fn, ms, ...args) => {
      const timer = set(fn, ms, ...args);
      if (rpcStarted) { active.add(timer); delays.push(ms); }
      return timer;
    };
    globalThis.clearTimeout = (timer) => { active.delete(timer); clear(timer); };
    cp.spawn = (...args) => {
      rpcStarted = true;
      const child = spawn(...args);
      child.on('error', (error) => events.push(error.code));
      child.on('close', () => events.push('close'));
      return child;
    };
    syncBuiltinESMExports();
    const { setupCodexPlan } = await import(${JSON.stringify(module)});
    const signal = new AbortController().signal;
    const before = getEventListeners(signal, 'abort').length;
    await assert.rejects(setupCodexPlan({ ...${JSON.stringify(ctx)}, env: process.env, signal }, ${JSON.stringify(options)}), { code: 'IO_ERROR' });
    assert.deepEqual(events, ['ENOENT', 'close']);
    assert.deepEqual(delays, [15000]);
    assert.equal(active.size, 0);
    assert.equal(getEventListeners(signal, 'abort').length, before);
    console.log(events.join(' -> '));
  `;
  const probe = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: dir, env: { ...ctx.env, RPC: 'spawn-error' }, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL',
  });
  assert.ifError(probe.error);
  assert.equal(probe.status, 0, probe.stderr);
  assert.equal(probe.stdout.trim(), 'ENOENT -> close');
  t.diagnostic('real Node spawn events: ENOENT -> close; RPC timer cleared, no SIGKILL timer armed, abort listeners restored; exited within 5s');
});

test('U-6: 15-second RPC timeout terminates the process with SIGTERM', async (t) => {
  const { ctx, options, term } = fixture(t);
  const start = performance.now();
  await assert.rejects(setupCodexPlan({ ...ctx, env: { ...ctx.env, RPC: 'timeout' } }, options), failure('IO_ERROR'));
  assert.ok(performance.now() - start >= 15000);
  assert.equal(readFileSync(term, 'utf8'), 'SIGTERM');
});
