import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ContextStore } from '../src/store.mjs';
import { ImpactState } from '../src/impact-state.mjs';
import { RETENTION_MS } from '../src/retention.mjs';
import { DatabaseSync } from 'node:sqlite';
import { IngestionJobRunner } from '../src/jobs.mjs';

test('all scopes expire exactly 24 hours after storage without sliding on reads or restart', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const root = mkdtempSync(join(tmpdir(), 'retention-'));
  let store = new ContextStore(root);
  try {
    for (const scope of ['transient', 'session', 'project']) {
      const result = store.index({ text: 'retained evidence', scope });
      assert.equal(result.expiresAt, Date.now() + RETENTION_MS);
    }
    assert.throws(() => store.index({ text: 'invalid', ttlMs: 0 }), /no longer supported/);
    t.mock.timers.tick(RETENTION_MS - 1);
    assert.equal(store.stats().sources, 3);
    store.close(); store = new ContextStore(root);
    assert.equal(store.stats().sources, 3);
    t.mock.timers.tick(1);
    assert.deepEqual(store.search({ query: '*' }), []);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM chunks').get().n, 0);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('job expiry uses creation, does not revive on completion, and excludes expired queued work', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const root = mkdtempSync(join(tmpdir(), 'retention-jobs-'));
  const store = new ContextStore(root);
  try {
    const job = store.createJob({ kind: 'index', input: { path: 'x' } });
    assert.equal(job.expiresAt, job.createdAt + RETENTION_MS);
    store.claimNextJob();
    t.mock.timers.tick(RETENTION_MS - 1);
    assert.equal(store.finishJob(job.id, 'completed', {}).expiresAt, job.expiresAt);
    const queued = store.createJob({ kind: 'index', input: { path: 'y' } });
    t.mock.timers.tick(1);
    assert.equal(store.getJob(job.id), null);
    assert.equal(store.finishJob(job.id, 'completed', {}), null);
    t.mock.timers.tick(RETENTION_MS);
    assert.equal(store.claimNextJob(), null);
    assert.equal(store.getJob(queued.id), null);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('impact legacy migration grants one fixed day and new revisions renew only on edits', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const root = mkdtempSync(join(tmpdir(), 'retention-impact-'));
  const state = new ImpactState(root, 'host');
  try {
    writeFileSync(join(root, 'x.ts'), 'value');
    state.mark(['x.ts']);
    const db = new DatabaseSync(state.path);
    db.exec('ALTER TABLE pending DROP COLUMN created_at; ALTER TABLE pending DROP COLUMN expires_at;');
    db.close();
    assert.equal(state.status().count, 1);
    t.mock.timers.tick(RETENTION_MS - 1);
    assert.equal(new ImpactState(root, 'host').status().count, 1);
    state.mark(['new.ts']);
    t.mock.timers.tick(1);
    assert.deepEqual(state.status().pending, [{ path: 'new.ts' }]);
    t.mock.timers.tick(RETENTION_MS);
    assert.equal(state.status().count, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('version-three migration expires legacy content/jobs from original creation, not upgrade', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1700000000000 });
  const root = mkdtempSync(join(tmpdir(), 'retention-migration-'));
  let store = new ContextStore(root);
  try {
    store.index({ text: 'old' });
    store.createJob({ kind: 'index', input: { path: 'x' } });
    store.db.exec('DROP INDEX ingestion_jobs_expiry; DROP INDEX sources_expiry; ALTER TABLE ingestion_jobs DROP COLUMN expires_at; DELETE FROM schema_migrations WHERE version = 4; UPDATE sources SET expires_at = NULL;');
    store.close();
    t.mock.timers.tick(RETENTION_MS);
    store = new ContextStore(root);
    assert.equal(store.stats().sources, 0);
    assert.deepEqual(store.listPendingJobs(), []);
  } finally { store.close(); rmSync(root, { recursive: true, force: true }); }
});

test('active job deadline aborts the renderer and late output cannot recreate expired data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'retention-active-'));
  const store = new ContextStore(root);
  let started, release, aborted = false;
  const began = new Promise(resolve => { started = resolve; });
  const runner = new IngestionJobRunner(store, { renderer: async ({ signal }) => {
    started();
    signal.addEventListener('abort', () => { aborted = true; });
    return await new Promise(resolve => { release = resolve; });
  } });
  try {
    const job = runner.enqueue('fetch', { url: 'https://example.com/', browser: true });
    store.db.prepare('UPDATE ingestion_jobs SET expires_at = ? WHERE id = ?').run(Date.now() + 50, job.id);
    await began;
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(aborted, true);
    release({ text: 'late payload', url: 'https://example.com/', contentType: 'text/plain' });
    await runner.close();
    assert.equal(store.getJob(job.id), null);
    assert.equal(store.stats().sources, 0);
  } finally { await runner.close(); store.close(); rmSync(root, { recursive: true, force: true }); }
});
