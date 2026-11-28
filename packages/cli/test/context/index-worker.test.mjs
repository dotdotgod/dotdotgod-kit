import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { BackgroundIndexWorker } from '../../src/context/index-worker.mjs';
import { runDoctor } from '../../src/context/doctor.mjs';
import { ImpactState } from '../../src/context/impact-state.mjs';
import { projectLoad } from '../../src/context/project.mjs';
import { getStatus } from '../../src/index/cache.mjs';
import { embeddingProfileIdentity } from '../../src/query/embedding-config.mjs';
import { HNSW_THRESHOLD } from '../../src/query/hnsw-index.mjs';
import { profileFingerprint } from '../../src/query/store.mjs';
import { incrementalIndexStatus, indexPath, openReadOnly, openWriter, workerLease } from '../../src/storage/index-store.mjs';

const embedding = { provider: 'openai-compatible', model: 'index-worker-fixture', baseUrl: 'https://provider.invalid/v1' };
const profile = profileFingerprint(embeddingProfileIdentity(embedding));
const compactStatus = incrementalIndexStatus;
const docPath = 'docs/README.md';
const codePath = 'src/math.ts';
const pathIn = (text) => /Path: ([^\n]+)/.exec(text)?.[1];
const response = (texts) => Response.json({ data: texts.map((_, index) => ({ index, embedding: [1, 0] })) });

async function until(read, description, timeout = 6500) {
  const started = performance.now();
  do {
    const result = read();
    if (result) return result;
    await sleep(10);
  } while (performance.now() - started < timeout);
  assert.fail(`Timed out: ${description}`);
}

function fixtures(t) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), 'ddg-background-test-')));
  const home = join(temp, 'home');
  mkdirSync(home);
  const workers = [];
  const clients = [];
  t.after(async () => {
    await Promise.all([...clients.map((client) => client.close()), ...workers.map((worker) => worker.close())]);
    rmSync(temp, { recursive: true, force: true });
  });
  const file = (root, path, text) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  };
  const config = (root, data) => file(root, 'dotdotgod.config.json', JSON.stringify(data));
  let roots = 0;
  return {
    temp, home, file, config, clients,
    root({ initialized = true, docs = true, data = { embedding } } = {}) {
      const root = join(temp, `repo-${++roots}`);
      mkdirSync(root);
      if (initialized) config(root, data);
      if (docs) file(root, docPath, '# Fixture\n\nInitialNeedle.');
      return root;
    },
    worker(root, options) {
      const worker = new BackgroundIndexWorker(root, { home, tier1Ms: 15, tier2Ms: 35, retryMs: 55, leaseTtlMs: 1000, renewMs: 150, ...options });
      workers.push(worker);
      worker.start();
      return worker;
    },
  };
}

function read(root, fn) {
  const store = openReadOnly(root);
  if (!store) return undefined;
  try { return fn(store); } finally { store.close(); }
}

function watched() {
  const handles = [];
  return {
    handles,
    watch() {
      const watcher = Object.assign(new EventEmitter(), { closed: false, close() { this.closed = true; } });
      handles.push(watcher);
      return watcher;
    },
  };
}

const hasTerm = (root, term) => read(root, (store) => store.sql('SELECT 1 FROM chunks_fts WHERE chunks_fts MATCH ? LIMIT 1').get(term));

test('ineligible, invalid, watch-disabled and symlink-docs roots do not watch, open SQLite, run Git or embed', async (t) => {
  const f = fixtures(t);
  const umbrella = f.root({ docs: false, initialized: false });
  mkdirSync(join(umbrella, '.dotdotgod'));
  const global = join(f.home, '.dotdotgod/config.json');
  f.file(f.home, '.dotdotgod/config.json', JSON.stringify({ embedding }));
  const badDocs = f.root({ docs: false });
  symlinkSync(join(f.root(), 'docs'), join(badDocs, 'docs'), 'dir');
  const roots = [umbrella, f.root({ docs: false }), f.root({ initialized: false }), badDocs,
    f.root({ data: { embedding, indexing: { watch: false } } }), f.root({ data: { indexing: { watch: 1 } } })];
  const io = t.mock.fn(() => { throw new Error('unexpected background I/O'); });
  // No lease timer means the worker never reaches the catch-up/Git path.
  for (const root of roots) {
    const worker = f.worker(root, { watch: io, resolveEmbedder: io });
    assert.equal(worker.leaseTimer, undefined);
    await worker.close();
    assert.equal(existsSync(indexPath(root)), false);
  }
  assert.equal(io.mock.callCount(), 0);
  assert.ok(existsSync(global));
});

test('backgroundEmbeddings false runs Tier 1, and exhausted watches gracefully fall back to hooks', async (t) => {
  const f = fixtures(t);
  const root = f.root({ data: { embedding, indexing: { backgroundEmbeddings: false } } });
  const resolveEmbedder = t.mock.fn(() => { throw new Error('embedding must stay disabled'); });
  const watch = t.mock.fn(() => { throw Object.assign(new Error('fixture watch exhaustion'), { code: 'ENOSPC' }); });
  const worker = f.worker(root, { watch, resolveEmbedder });
  await until(() => hasTerm(root, 'initialneedle'), 'initial Tier 1 FTS update');
  const source = 'export function HookObserved() { return 1; }';
  f.file(root, codePath, source);
  const impact = new ImpactState(root, 'fixture-session');
  impact.mark([join(root, codePath), codePath]);
  assert.deepEqual(read(root, (store) => store.sql('SELECT path,reason FROM dirty_queue').all().map(({ path, reason }) => [path, reason])), [[codePath, 'hook']]);
  await until(() => read(root, (store) => store.symbols(codePath).some(({ name }) => name === 'HookObserved')), 'hook-driven symbol update');
  assert.equal(compactStatus(root).vectorsCount, 0);
  assert.equal(watch.mock.callCount(), 1);
  assert.equal(resolveEmbedder.mock.callCount(), 0);
  await worker.close();
  assert.equal(compactStatus(root).workerLease, null);
});

test('watch create/edit/delete drives FTS and docs-first bounded vectors with shared HNSW insert and tombstone', { timeout: 20_000 }, async (t) => {
  const f = fixtures(t);
  const root = f.root();
  f.file(root, codePath, 'export function InitialSymbol() { return 1; }');
  for (let i = 0; i < 17; i++) f.file(root, `docs/D${i}.md`, `# Fixture ${i}\n\nSynthetic passage ${i}.`);
  const batches = [];
  const queryCalls = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    const { input } = JSON.parse(init.body);
    const paths = input.map(pathIn);
    if (paths[0]) batches.push(paths);
    else queryCalls.push(input.length);
    return response(input);
  });
  const seed = openWriter(root);
  seed.upsertVectorBatch(profile, 2, Array.from({ length: HNSW_THRESHOLD - 1 }, (_, i) => ({ fingerprint: `seed-${i}`, vector: [1, 0] })));
  seed.close();
  const worker = f.worker(root, { leaseTtlMs: 15_000, watch, tier2Ms: 100 });
  await until(() => compactStatus(root).hnswActiveNodes === HNSW_THRESHOLD + 18, 'initial HNSW build and incremental nodes', 12_000);
  assert.deepEqual(batches.map((batch) => batch.length), [16, 2, 1]);
  assert.ok(batches.slice(0, 2).flat().every((path) => path.startsWith('docs/')));
  assert.deepEqual(batches[2], [codePath]);
  f.file(root, '.dotdotgod/vectors/build.lock', '{}');
  const started = performance.now();
  const [loaded, lexical] = await Promise.all([projectLoad({ root, focus: 'InitialSymbol' }), projectLoad({ root, focus: 'InitialNeedle' })]);
  const loadedMs = performance.now() - started;
  assert.ok(loaded.query.results.some(({ path }) => path === codePath));
  assert.ok(lexical.query.results.some(({ path }) => path === docPath));
  assert.deepEqual(queryCalls, [1, 1]);
  assert.ok(existsSync(join(root, '.dotdotgod/vectors/build.lock')));
  t.diagnostic(`prepared Load: 2 requests in ${loadedMs.toFixed(2)} ms, 0 ms build-lock wait (sentinel held throughout)`);

  const edit = performance.now();
  f.file(root, codePath, 'export function RevisedSymbol() { return 12; }');
  f.file(root, 'docs/NEW.md', '# AddedNeedle\n\nSynthetic addition.');
  await until(() => hasTerm(root, 'revisedsymbol') && hasTerm(root, 'addedneedle'), 'watch-driven FTS changes');
  const tier1 = performance.now() - edit;
  await until(() => read(root, (store) => {
    const [chunk] = store.chunks(codePath);
    return chunk && store.vector(profile, chunk.fingerprint)?.committed;
  }), 'watch-driven vector change');
  t.diagnostic(`watch edit/create: Tier 1 ${tier1.toFixed(2)} ms, Tier 2 ${(performance.now() - edit).toFixed(2)} ms (injected debounce)`);
  assert.deepEqual(read(root, (store) => store.symbols(codePath).map(({ name }) => name)), ['RevisedSymbol']);
  rmSync(join(root, codePath));
  await until(() => compactStatus(root).hnswTombstones >= 2 && !hasTerm(root, 'revisedsymbol'), 'watch-driven deletion and HNSW tombstones');
  assert.equal(read(root, (store) => store.chunks(codePath).length), 0);
  const watchHandles = [...worker.watchers];
  await worker.close();
  assert.ok(watchHandles.length > 0);
  assert.equal(worker.watchers.length, 0);
  assert.equal(worker.leaseTimer.hasRef(), false);
  assert.equal(worker.tier1Timer.hasRef(), false);
  assert.equal(compactStatus(root).workerLease, null);
});

test('single lease elects only one worker, promotes standby after close and recovers dead PID immediately', async (t) => {
  const f = fixtures(t);
  const root = f.root();
  const old = openWriter(root);
  old.setMeta('worker_lease', JSON.stringify({ pid: 2147483647, token: 'dead', expiresAt: Date.now() + 60_000 }));
  old.close();
  const first = watched();
  const second = watched();
  const resolveEmbedder = t.mock.fn(async () => ({ embed: async (texts) => texts.map(() => [1, 0]) }));
  const leader = f.worker(root, { watch: first.watch, resolveEmbedder, leaseTtlMs: 300, renewMs: 50 });
  const standby = f.worker(root, { watch: second.watch, resolveEmbedder, leaseTtlMs: 300, renewMs: 50 });
  assert.notEqual(read(root, workerLease).token, 'dead');
  assert.equal(read(root, workerLease).token, leader.token);
  assert.ok(first.handles.length > 0);
  assert.equal(second.handles.length, 0);
  await until(() => compactStatus(root).vectorsCount === 1, 'leader embedding');
  const closedAt = performance.now();
  await leader.close();
  assert.ok(first.handles.every(({ closed }) => closed));
  await until(() => second.handles.length && read(root, workerLease)?.token === standby.token, 'clean standby promotion');
  t.diagnostic(`standby promotion ${(performance.now() - closedAt).toFixed(2)} ms (injected 300 ms TTL)`);
  await until(() => standby.policy && compactStatus(root).dirtyQueueCount === 0, 'standby catch-up');
  assert.equal(resolveEmbedder.mock.callCount(), 1);
  assert.equal(standby.leaseTimer.hasRef(), false);
  await standby.close();
  assert.ok(second.handles.every(({ closed }) => closed));
  assert.equal(compactStatus(root).workerLease, null);
});

test('hook mark without an index creates only advisory storage; status and doctor never create index files', async (t) => {
  const f = fixtures(t);
  const root = f.root({ data: {} });
  const before = readdirSync(root);
  const empty = getStatus(root).incrementalIndex;
  assert.equal(empty.present, false);
  assert.deepEqual(runDoctor({ root }).incrementalIndex, empty);
  assert.deepEqual(readdirSync(root), before);
  new ImpactState(root, 'fixture-session').mark([docPath]);
  assert.deepEqual(readdirSync(join(root, '.dotdotgod')), ['context']);
  const worker = f.worker(root, { watch: watched().watch });
  await until(() => compactStatus(root).docsChunks === 1, 'telemetry has a committed doc');
  assert.ok(getStatus(root).incrementalIndex.workerLease.active);
  assert.equal(runDoctor({ root }).incrementalIndex.schemaVersion, 1);
  await worker.close();
  const checkpointed = readdirSync(join(root, '.dotdotgod')).sort();
  assert.ok(checkpointed.includes('index.sqlite'));
  assert.ok(!checkpointed.some((file) => /index\.sqlite-(?:wal|shm)/.test(file)));
  const status = getStatus(root).incrementalIndex;
  assert.deepEqual(status, { present: true, schemaVersion: 1, dirtyQueueCount: 0, docsChunks: 1, codeChunks: 0,
    vectorsCount: 0, hnswActiveNodes: 0, hnswTombstones: 0, workerLease: null });
  assert.deepEqual(runDoctor({ root }).incrementalIndex, status);
  assert.deepEqual(readdirSync(join(root, '.dotdotgod')).sort(), checkpointed);
});

test('429 retries with exponential delays; auth and missing runtime stop without stopping Tier 1', async (t) => {
  const f = fixtures(t);
  const attempts = [];
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    attempts.push(performance.now());
    if (attempts.length <= 2) return new Response(null, { status: 429 });
    return response(JSON.parse(init.body).input);
  });
  const root = f.root();
  const worker = f.worker(root, { watch: watched().watch });
  await until(() => compactStatus(root).vectorsCount === 1, 'success after two rate limits');
  assert.equal(attempts.length, 3);
  assert.ok(attempts[1] - attempts[0] >= 50);
  assert.ok(attempts[2] - attempts[1] >= 105);
  t.diagnostic(`429 backoff intervals: ${(attempts[1] - attempts[0]).toFixed(2)} ms, ${(attempts[2] - attempts[1]).toFixed(2)} ms`);
  await worker.close();
  for (const failure of [401, 403, 'Optional local embedding runtime is not installed']) {
    const blocked = f.root();
    const resolver = t.mock.fn(async () => { throw Object.assign(new Error(typeof failure === 'string' ? failure : 'fixture auth failure'), { status: failure }); });
    const candidate = f.worker(blocked, { watch: watched().watch, resolveEmbedder: resolver });
    await until(() => candidate.fatalEmbedding, 'fatal failure disables Tier 2');
    f.file(blocked, codePath, 'export function StillUpdates() {}');
    new ImpactState(blocked, 'fixture-session').mark([codePath]);
    await until(() => hasTerm(blocked, 'stillupdates'), 'Tier 1 survives fatal Tier 2 error');
    await sleep(85);
    assert.equal(resolver.mock.callCount(), 1);
    assert.equal(compactStatus(blocked).vectorsCount, 0);
    await candidate.close();
  }
});

test('the request and publish boundaries revoke held work across ignore change and lease loss', async (t) => {
  const f = fixtures(t);
  const root = f.root();
  f.file(root, 'docs/secrets.md', '# SecretLikeFixture');
  const started = Promise.withResolvers();
  const held = Promise.withResolvers();
  const observed = [];
  let fetchSignal;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const { input } = JSON.parse(init.body);
    observed.push(input.map(pathIn));
    if (observed.length !== 1) return response(input);
    fetchSignal = init.signal;
    started.resolve();
    await held.promise;
    // A token-limit retry would split this request; the fresh ignore policy must block that outbound call.
    return new Response('maximum context length', { status: 400 });
  });
  const watch = watched();
  f.file(root, 'docs/SECOND.md', '# HeldFixture');
  const worker = f.worker(root, { watch: watch.watch, leaseTtlMs: 2000 });
  try {
    await Promise.race([started.promise, sleep(1500).then(() => assert.fail('request did not start'))]);
    assert.ok(fetchSignal instanceof AbortSignal);
    f.file(root, '.gitignore', 'docs/README.md\ndocs/SECOND.md\n');
    held.resolve();
    await until(() => !worker.tier2Pending, 'batch rejected before split retry');
    assert.equal(observed.length, 1);
    assert.ok(observed.flat().every((path) => path === docPath || path === 'docs/SECOND.md'));
    assert.equal(compactStatus(root).vectorsCount, 0);
  } finally { held.resolve(); await worker.close(); }

  const secondRoot = f.root();
  const secondStarted = Promise.withResolvers();
  const secondHeld = Promise.withResolvers();
  const late = f.worker(secondRoot, { watch: watch.watch, leaseTtlMs: 2000, resolveEmbedder: async () => ({ embed: async () => {
    secondStarted.resolve();
    await secondHeld.promise;
    return [[1, 0]];
  } }) });
  try {
    await Promise.race([secondStarted.promise, sleep(1500).then(() => assert.fail('held batch did not start'))]);
    const writer = openWriter(secondRoot);
    writer.transaction(() => writer.setMeta('worker_lease', JSON.stringify({ pid: process.pid, token: 'successor', expiresAt: Date.now() + 30_000 })));
    writer.close();
    secondHeld.resolve();
    await until(() => !late.tier2Pending, 'held write discarded after takeover');
    assert.equal(compactStatus(secondRoot).vectorsCount, 0);
  } finally { secondHeld.resolve(); await late.close(); }
  assert.equal(read(secondRoot, workerLease).token, 'successor');
});

test('close aborts the actual remote fetch and holds the lease until pending work stops', async (t) => {
  const f = fixtures(t);
  const root = f.root();
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    signal = init.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  const w = watched();
  const worker = f.worker(root, { watch: w.watch });
  await until(() => signal, 'active remote fetch signal');
  await worker.close();
  assert.equal(signal.aborted, true);
  assert.equal(compactStatus(root).vectorsCount, 0);
  assert.equal(compactStatus(root).workerLease, null);
  assert.ok(w.handles.every((watcher) => watcher.closed));
  assert.equal(worker.tier2Pending, null);
});

test('in-memory catalog does not start background maintenance in an eligible root', async (t) => {
  const root = fixtures(t).root({ data: {} });
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const { listServerTools } = await import('../../src/context/server.mjs');
    const tools = await listServerTools();
    assert.ok(tools.some(({ name }) => name === 'project_load'));
    await sleep(100);
    assert.equal(existsSync(indexPath(root)), false);
  } finally { process.chdir(cwd); }
});

test('stdio serves requests during maintenance, revokes the old root and fails closed on empty or failed negotiation', { timeout: 15_000 }, async (t) => {
  const f = fixtures(t);
  const initial = f.root({ data: {} });
  const next = f.root({ data: {} });
  for (let i = 0; i < 128; i++) f.file(initial, `docs/D${i}.md`, '# Synthetic fixture');
  let selected = initial;
  let fail = false;
  const client = new Client({ name: 'fixture', version: '1' }, { capabilities: { roots: { listChanged: true } } });
  f.clients.push(client);
  client.setRequestHandler(ListRootsRequestSchema, () => {
    if (fail) throw new Error('fixture root negotiation failure');
    return { roots: selected ? [{ uri: pathToFileURL(selected).href }] : [] };
  });
  const { DOTDOTGOD_PROJECT_ROOT: _, ...env } = process.env;
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'], cwd: f.temp,
    env: { ...env, HOME: f.home }, stderr: 'pipe' });
  await client.connect(transport);
  await until(() => compactStatus(initial).workerLease?.active, 'selected root activation');
  const started = performance.now();
  const ghost = await client.callTool({ name: 'project_load', arguments: { focus: 'InitialNeedle' } });
  assert.equal(ghost.structuredContent.ok, true);
  assert.ok(compactStatus(initial).docsChunks < 129, 'request completed before the catch-up drained');
  t.diagnostic(`stdio Load during 129-file catch-up: ${(performance.now() - started).toFixed(2)} ms`);
  assert.equal(existsSync(indexPath(f.temp)), false);

  selected = undefined;
  await client.sendRootsListChanged();
  await until(() => compactStatus(initial).workerLease === null, 'empty roots releases the old lease');
  assert.equal((await client.callTool({ name: 'doctor', arguments: {} })).structuredContent.root, initial);
  fail = true;
  await client.sendRootsListChanged();
  await client.callTool({ name: 'doctor', arguments: {} });
  await sleep(250);
  assert.equal(compactStatus(initial).workerLease, null);

  fail = false;
  selected = next;
  await client.sendRootsListChanged();
  await until(() => compactStatus(next).workerLease?.active, 'worker starts on the new root');
  await until(() => hasTerm(next, 'initialneedle'), 'new root indexed');
  assert.equal(compactStatus(initial).workerLease, null);
  await client.close();
  assert.equal(compactStatus(next).workerLease, null);
});
