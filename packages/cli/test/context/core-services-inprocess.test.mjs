import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, truncateSync, watch, writeFileSync } from 'node:fs';
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import * as embedding from '../../src/query/embedding-runtime.mjs';
import * as embeddingCommand from '../../src/commands/embedding.mjs';
import { buildVectorIndex, queryProject } from '../../src/commands/query.mjs';
import { projectEmbeddingStatus, projectImpact, projectInitialize, projectLoad } from '../../src/context/project.mjs';
import { expandReferences } from '../../src/reference/resolve.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-u8-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const localConfig = { embedding: { provider: 'local', model: 'fixture' } };

test('U-8: all six project services run in process without changing process state', async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/README.md'), '# Reference fixture\n');
  const cwd = process.cwd();
  const env = { ...process.env };
  const observing = new AsyncLocalStorage();
  for (const [target, name] of [[process.stdout, 'write'], [process.stderr, 'write'], [console, 'log'], [process, 'exit'], [process, 'chdir'], [childProcess, 'spawn']]) {
    const original = target[name];
    t.mock.method(target, name, function (...args) {
      assert.equal(observing.getStore(), undefined, `service called ${name}`);
      return Reflect.apply(original, this, args);
    });
  }
  syncBuiltinESMExports();
  try {
    await observing.run(true, async () => {
      const before = process.exitCode;
      const loaded = await projectLoad({ root, focus: 'reference' });
      assert.equal(loaded.ok, true);
      assert.match(loaded.documentationTree.join('\n'), /README.md/);
      assert.equal(loaded.query.results[0].path, 'docs/README.md');
      const impact = await projectImpact({ root, paths: ['docs/README.md'] });
      assert.equal(impact.ok, true);
      assert.match(impact.summary, /docs\/README.md/);
      const decision = await projectLoad({ root, readOnly: true, focus: 'reference', refs: ['docs/README.md'] });
      assert.equal(decision.references[0].top.path, 'docs/README.md');
      writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify(localConfig));
      assert.equal((await projectEmbeddingStatus({ root })).location, '~/.dotdotgod/runtime/embedding');
      assert.equal((await projectInitialize({ root })).dryRun, true);
      assert.equal(process.exitCode, before);
      assert.equal(process.cwd(), cwd);
      assert.deepEqual(Object.keys(process.env).sort(), Object.keys(env).sort());
      assert.equal(Object.entries(env).every(([key, value]) => process.env[key] === value), true, 'service changed an environment value');
    });
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('Load without a docs root skips traversal, caches and global embedding configuration', async (t) => {
  const root = fixture(t);
  const home = fixture(t);
  for (const path of ['nested/docs', '.dotdotgod/vectors']) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'nested/docs/README.md'), '# Needle');
  for (const path of ['.dotdotgod/outlines.json', '.dotdotgod/vectors/snapshots.json']) {
    writeFileSync(join(root, path), 'sentinel');
    truncateSync(join(root, path), 64 * 1024 * 1024);
  }
  const globalConfig = join(home, '.dotdotgod/config.json');
  mkdirSync(join(home, '.dotdotgod'));
  writeFileSync(globalConfig, JSON.stringify({ embedding: { provider: 'ollama', model: 'fixture' } }));
  const originalHome = process.env.HOME;
  process.env.HOME = home;
  const read = t.mock.method(fs, 'readFileSync');
  const walk = t.mock.method(fs, 'readdirSync');
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected embedding request'));
  syncBuiltinESMExports();
  try {
    const start = performance.now();
    const empty = await projectLoad({ root });
    const focused = await projectLoad({ root, focus: 'needle' });
    assert.ok(performance.now() - start < 50, 'missing docs guard must return promptly');
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.documentationTree, []);
    assert.equal(empty.query, null);
    assert.equal(focused.ok, true);
    assert.deepEqual(focused.documentationTree, []);
    assert.deepEqual(focused.query.results, []);
    assert.match(focused.query.warnings[0], /Select a repository/);
    assert.equal(focused.vectorUnavailable, undefined);
    assert.equal(walk.mock.callCount(), 0);
    assert.equal(fetch.mock.callCount(), 0);
    assert.ok(read.mock.calls.every(({ arguments: [path] }) => !String(path).includes('.dotdotgod/')));
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('Load honors alternate and empty docs roots but fails closed on invalid config or a symlinked root', async (t) => {
  const root = fixture(t);
  const alternate = join(root, 'guide');
  const config = (path) => writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ documentation: { root: path }, ...localConfig }));
  config('guide');
  mkdirSync(alternate);
  let result = await projectLoad({ root, focus: 'needle' });
  assert.equal(result.ok, true);
  assert.equal(result.documentationRoot, 'guide');
  assert.deepEqual(result.query.results, []);
  assert.doesNotMatch(result.query.warnings[0], /Select a repository/);
  writeFileSync(join(alternate, 'README.md'), '# Needle');
  result = await projectLoad({ root, focus: 'needle' });
  assert.match(result.documentationTree.join('\n'), /README.md/);
  assert.equal(result.query.results[0].path, 'guide/README.md');

  const outside = fixture(t);
  writeFileSync(join(outside, 'ESCAPED.md'), '# Needle');
  symlinkSync(outside, join(root, 'docs'));
  for (const path of ['../outside', 'docs']) {
    config(path);
    const walk = t.mock.method(fs, 'readdirSync');
    syncBuiltinESMExports();
    try {
      result = await projectLoad({ root, focus: 'needle' });
      assert.equal(result.mapUnavailable.code, 'MAP_UNAVAILABLE');
      assert.deepEqual(result.documentationTree, []);
      assert.equal(result.query, null);
      assert.equal(walk.mock.callCount(), 0);
      await assert.rejects(queryProject(root, 'needle', { indexPolicy: 'prepared-only' }), /invalid|symlinks/);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
  }
});

test('Load only offers local runtime installation when a committed snapshot is ready', async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs/README.md'), '# Needle');
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify(localConfig));
  let runtimeProbes = 0;
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@huggingface/transformers') {
      runtimeProbes += 1;
      throw Object.assign(new Error('fixture module missing'), { code: 'ERR_MODULE_NOT_FOUND' });
    }
    return next(specifier, context);
  } });
  t.after(() => hooks.deregister());
  const cold = await projectLoad({ root, focus: 'needle' });
  assert.deepEqual(cold.query.results[0].retrieval, ['keyword']);
  assert.match(cold.query.warnings[0], /Prepared snapshot not ready \(missing\)/);
  assert.equal(cold.vectorUnavailable, undefined);
  assert.equal(runtimeProbes, 0);
  assert.equal(existsSync(join(root, '.dotdotgod')), false);
  await buildVectorIndex(root, { profile: localConfig.embedding, embed: (texts) => texts.map(() => [1, 0]) });
  const warm = await projectLoad({ root, focus: 'needle' });
  assert.deepEqual(warm.query.results[0].retrieval, ['keyword']);
  assert.ok(runtimeProbes > 0);
  assert.equal(warm.vectorUnavailable.code, 'EMBEDDING_RUNTIME_MISSING');
  assert.equal(warm.vectorUnavailable.recovery.requiresConfirmation, true);
});

test('public project impact rejects NUL-containing paths before writing an index', async (t) => {
  const root = fixture(t);
  writeFileSync(join(root, 'README.md'), '# Fixture\n');
  await assert.rejects(projectImpact({ root, paths: ['README.md', '\u0000'] }), { code: 'INVALID_CHANGED_PATH', message: 'Changed paths must not contain NUL characters.' });
  assert.equal(existsSync(join(root, '.dotdotgod')), false);
});

test('U-8: public initializer defaults to no writes and only accepts literal confirmation', async (t) => {
  const root = fixture(t);
  for (const options of [{}, { dryRun: null }, { confirmWrite: true }]) {
    assert.equal((await projectInitialize({ root, ...options })).dryRun, true);
  }
  for (const confirmWrite of [undefined, false, 'true']) {
    await assert.rejects(projectInitialize({ root, dryRun: false, confirmWrite }), /confirmWrite/);
  }
  assert.deepEqual(readdirSync(root), []);
  const result = await projectInitialize({ root, dryRun: false, confirmWrite: true, projectName: 'fixture' });
  assert.equal(result.dryRun, false);
  assert.equal(existsSync(join(root, 'AGENTS.md')), true);
});

test('U-8: pre-cancelled services preserve the signal reason without writes', async (t) => {
  const root = fixture(t);
  const reason = new Error('fixture cancelled');
  const signal = AbortSignal.abort(reason);
  await assert.rejects(projectLoad({ root, signal }), (error) => error === reason);
  await assert.rejects(queryProject(root, 'fixture', { signal }), (error) => error === reason);
  assert.throws(() => expandReferences(root, '[[fixture]]', { signal }), (error) => error === reason);
  await assert.rejects(projectImpact({ root, signal, paths: ['README.md'] }), (error) => error === reason);
  await assert.rejects(projectInitialize({ root, signal, dryRun: false, confirmWrite: true }), (error) => error === reason);
  assert.deepEqual(readdirSync(root), []);
});

test('U-8: cancellation in a vector batch is not downgraded to keyword results or published', { timeout: 3000 }, async (t) => {
  const root = fixture(t);
  const docs = join(root, 'docs');
  mkdirSync(docs);
  writeFileSync(join(docs, 'README.md'), '# fixture\n');
  const controller = new AbortController();
  const started = Promise.withResolvers();
  const result = queryProject(root, 'fixture', { scope: 'docs', signal: controller.signal, embed: () => {
    started.resolve();
    return new Promise(() => {});
  } });
  await started.promise;
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(existsSync(join(root, '.dotdotgod/index.sqlite')), false);
  assert.equal(existsSync(join(root, '.dotdotgod/vectors/snapshots.json')), false);
  assert.equal(existsSync(join(root, '.dotdotgod/vectors/build.lock')), false);
});

test('U-8: only local native inference spawns a private child, reused across batches and closed on abort', { timeout: 10_000 }, async (t) => {
  const root = fixture(t);
  mkdirSync(join(root, 'docs'));
  for (let i = 0; i < 20; i += 1) writeFileSync(join(root, `docs/FIXTURE_${i}.md`), `# Fixture ${i}\n`);
  const runtime = join(root, 'fake-transformers.mjs');
  writeFileSync(runtime, `
    import { appendFileSync, writeFileSync } from 'node:fs';
    if (!process.send) throw new Error('Expected inference IPC child');
    process.env.FIXTURE_NATIVE_SIDE_EFFECT = 'child-only';
    process.chdir(import.meta.dirname);
    process.stdout.write('not JSON-RPC');
    console.log('native stdout');
    console.error('native stderr');
    process.exitCode = 42;
    export const env = {};
    export async function pipeline(task, name) {
      appendFileSync('calls', 'pipeline\\n');
      let batches = 0;
      return async (texts) => {
        appendFileSync('calls', 'batch\\n');
        if (name === 'blocking' && ++batches === 2) {
          writeFileSync('blocked', '');
          await new Promise(() => {});
        }
        return { tolist: () => texts.map(() => [1, 0]) };
      };
    }
  `);
  let missing = true;
  const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier !== '@huggingface/transformers') return next(specifier, context);
    if (missing) throw Object.assign(new Error('fixture module missing'), { code: 'ERR_MODULE_NOT_FOUND' });
    return { url: pathToFileURL(runtime).href, shortCircuit: true };
  } });
  const spawn = childProcess.spawn;
  let closed = 0;
  const tracked = t.mock.method(childProcess, 'spawn', (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.match(args[0], /\/query\/local-inference\.mjs$/);
    assert.equal(options.shell, false);
    assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
    const child = spawn(command, args, options);
    child.once('close', () => { closed += 1; });
    return child;
  });
  syncBuiltinESMExports();
  const envBefore = Object.hasOwn(process.env, 'FIXTURE_NATIVE_SIDE_EFFECT');
  const cwd = process.cwd();
  const exitCode = process.exitCode;
  const options = { profile: localConfig.embedding, scope: 'docs', home: join(root, 'missing-home') };
  try {
    assert.equal((await queryProject(root, 'fixture', { ...options, search: 'keyword' })).ok, true);
    const fallback = await queryProject(root, 'fixture', options);
    assert.match(fallback.warnings[0], /Optional local embedding runtime is not installed/);
    assert.equal(tracked.mock.callCount(), 0);
    missing = false;
    const result = await queryProject(root, 'fixture', { ...options, search: 'vector' });
    assert.ok(result.results.some((item) => item.retrieval.includes('vector')));
    assert.equal(readFileSync(join(root, 'calls'), 'utf8'), 'pipeline\nbatch\nbatch\nbatch\n');
    assert.equal(closed, 1);
    const vectors = join(root, '.dotdotgod/vectors');
    const database = join(root, '.dotdotgod/index.sqlite');
    const beforeAbort = readFileSync(database);
    rmSync(vectors, { recursive: true });
    const controller = new AbortController();
    const watcher = watch(root, (_event, filename) => { if (filename === 'blocked') controller.abort(); });
    try {
      await assert.rejects(queryProject(root, 'fixture', { ...options, profile: { ...options.profile, model: 'blocking' }, signal: controller.signal }), { name: 'AbortError' });
    } finally { watcher.close(); }
    assert.equal(existsSync(join(root, 'blocked')), true);
    assert.deepEqual(readdirSync(vectors), []);
    assert.deepEqual(readFileSync(database), beforeAbort);
    assert.equal(tracked.mock.callCount(), 2);
    assert.equal(closed, 2);
    assert.equal(Object.hasOwn(process.env, 'FIXTURE_NATIVE_SIDE_EFFECT'), envBefore);
    assert.equal(process.cwd(), cwd);
    assert.equal(process.exitCode, exitCode);
  } finally {
    hooks.deregister();
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('U-8: async installation requires confirmation, masks location and suppresses npm diagnostics', async (t) => {
  const root = fixture(t);
  const home = join(root, 'home');
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify(localConfig));
  const spawnImpl = (command, argv, options) => {
    assert.equal(command, 'npm');
    assert.equal(options.shell, false);
    assert.equal(argv.at(-1), '@huggingface/transformers@4.2.0');
    const child = new EventEmitter();
    queueMicrotask(() => {
      child.emit('error', new Error('raw npm secret'));
      child.emit('close', 1);
    });
    return child;
  };
  await assert.rejects(embedding.installEmbeddingRuntimeAsync({ home, confirm: 'true', spawnImpl }), /explicit confirmation/);
  assert.equal(existsSync(home), false);
  assert.equal(embeddingCommand.getEmbeddingStatus(root, { home }).location, '~/.dotdotgod/runtime/embedding');
  await assert.rejects(embedding.installEmbeddingRuntimeAsync({ home, confirm: true, spawnImpl }), {
    name: 'DotdotgodServiceError', message: 'Embedding runtime installation failed.',
  });
  const runtime = embedding.embeddingRuntimeRoot({ home });
  assert.equal(existsSync(join(runtime, '.installing')), false);
  const installed = await embedding.installEmbeddingRuntimeAsync({ home, confirm: true, spawnImpl: () => {
    const pkg = join(runtime, 'node_modules/@huggingface/transformers');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), '{"version":"4.2.0","main":"index.js"}');
    writeFileSync(join(pkg, 'index.js'), '');
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0));
    return child;
  } });
  assert.equal(installed.installed, true);
  assert.equal(installed.location, '~/.dotdotgod/runtime/embedding');
  assert.equal(existsSync(join(runtime, '.installing')), false);
});

test('U-8: real spawn ENOENT emits close for both installer and inference, with stable errors', { timeout: 5000 }, async (t) => {
  const root = fixture(t);
  const runtime = join(root, 'transformers.mjs');
  writeFileSync(runtime, 'throw new Error("must not start with missing cwd");');
  const hooks = registerHooks({ resolve(specifier, context, next) {
    return specifier === '@huggingface/transformers' ? { url: pathToFileURL(runtime).href, shortCircuit: true } : next(specifier, context);
  } });
  const spawn = childProcess.spawn;
  const events = [];
  t.mock.method(childProcess, 'spawn', (...args) => {
    const child = spawn(...args);
    assert.equal(child.pid, undefined);
    const sequence = [];
    events.push(sequence);
    child.once('error', (error) => sequence.push(error.code));
    child.once('close', () => sequence.push('close'));
    return child;
  });
  syncBuiltinESMExports();
  try {
    const home = join(root, 'home');
    const activeTimers = () => process.getActiveResourcesInfo().filter((type) => type === 'Timeout').length;
    const before = activeTimers();
    const install = embedding.installEmbeddingRuntimeAsync({ home, confirm: true, npmCommand: join(root, 'missing-npm') });
    const lock = join(embedding.embeddingRuntimeRoot({ home }), '.installing');
    assert.equal(existsSync(lock), true);
    await assert.rejects(install, { name: 'DotdotgodServiceError', code: 'NPM_UNAVAILABLE', message: 'npm is unavailable.' });
    assert.deepEqual(events, [['ENOENT', 'close']]);
    assert.equal(existsSync(lock), false);
    assert.equal(activeTimers(), before, 'installer must clear its deadline after spawn failure');

    await assert.rejects(queryProject(root, 'fixture', { profile: localConfig.embedding, search: 'vector', scope: 'docs', cwd: join(root, 'missing-cwd') }), {
      name: 'DotdotgodServiceError', code: 'QUERY_FAILED', message: 'Local embedding inference helper exited unexpectedly.',
    });
    assert.deepEqual(events, [['ENOENT', 'close'], ['ENOENT', 'close']]);
    assert.equal(existsSync(join(root, '.dotdotgod/vectors')), false);
  } finally {
    hooks.deregister();
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test('U-8: abort waits for npm close before releasing the install lock', async (t) => {
  const home = fixture(t);
  const lock = join(embedding.embeddingRuntimeRoot({ home }), '.installing');
  const controller = new AbortController();
  const reason = new Error('fixture cancelled');
  const child = new EventEmitter();
  const kill = t.mock.fn(() => { child.emit('error', reason); });
  child.kill = kill;
  let settled = false;
  const result = embedding.installEmbeddingRuntimeAsync({ home, confirm: true, signal: controller.signal, spawnImpl: () => child });
  const rejection = assert.rejects(result.finally(() => { settled = true; }), (error) => error === reason);
  assert.equal(existsSync(lock), true);
  controller.abort(reason);
  await new Promise(setImmediate);
  assert.equal(kill.mock.callCount(), 1);
  assert.equal(existsSync(lock), true);
  assert.equal(settled, false);
  child.emit('close', null, 'SIGTERM');
  await rejection;
  assert.equal(existsSync(lock), false);
});
