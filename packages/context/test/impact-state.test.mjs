import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ImpactState, impactReminder, withImpactReview } from '../src/impact-state.mjs';

test('advisory impact persists, isolates sessions, retains failures and concurrent edits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'impact-state-'));
  try {
    const state = new ImpactState(root, 'one');
    assert.equal(state.status().count, 0);
    writeFileSync(join(root, 'a.ts'), 'first');
    writeFileSync(join(root, 'b.ts'), 'second');
    state.mark(['a.ts', 'b.ts', 'a.ts', '../outside', 'docs/plan/task/README.md', '.dotdotgod/cache']);
    assert.equal(state.status().count, 2);
    assert.equal(new ImpactState(root, 'two').status().count, 0);
    assert.match(impactReminder(state.status()), /does not block/);
    await withImpactReview(root, 'one', ['a.ts'], async () => ({ ok: false }));
    assert.equal(state.status().count, 2);
    await assert.rejects(withImpactReview(root, 'one', ['a.ts'], async () => { throw Error('failure'); }));
    await withImpactReview(root, 'one', ['a.ts'], async () => { state.mark(['a.ts']); return { ok: true }; });
    assert.equal(state.status().count, 2, 'same-content edit advances revision');
    await withImpactReview(root, 'one', ['a.ts'], async () => { writeFileSync(join(root, 'a.ts'), 'later'); return { ok: true }; });
    assert.equal(state.status().count, 2, 'external changes survive review');
    state.mark(['a.ts']);
    await withImpactReview(root, 'one', ['a.ts'], async () => ({ ok: true }));
    assert.deepEqual(new ImpactState(root, 'one').status().pending, [{ path: 'b.ts' }]);
    symlinkSync(tmpdir(), join(root, 'external'));
    state.mark(['external/secret.ts']);
    assert.equal(state.status().count, 1);
    for (let i = 0; i < 60; i++) state.mark([`file${i}.ts`]);
    assert.equal(state.status().count, 61, 'never silently evict pending paths');
    assert.equal(state.status().truncated, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cancellation retains pending even if the reviewer returns success after abort', async () => {
  const root = mkdtempSync(join(tmpdir(), 'impact-cancel-'));
  try {
    writeFileSync(join(root, 'a.ts'), 'value');
    const state = new ImpactState(root, 'cancelled');
    state.mark(['a.ts']);
    const controller = new AbortController();
    await assert.rejects(withImpactReview(root, 'cancelled', ['a.ts'], async () => {
      controller.abort();
      return { ok: true };
    }, controller.signal), { name: 'AbortError' });
    assert.equal(state.status().count, 1);
    let called = false;
    await assert.rejects(withImpactReview(root, 'cancelled', ['a.ts'], async () => {
      called = true;
      return { ok: true };
    }, controller.signal), { name: 'AbortError' });
    assert.equal(called, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('IS-01..IS-05: v2 schema, WAL, read-only path, becameNonEmpty, clearPaths, claimUnnotified concurrency, plan_notices', async () => {
  const { existsSync } = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const { spawn } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'impact-v2-'));
  try {
    // Missing DB read-only status creates nothing
    const emptyState = new ImpactState(root, 'sess-a');
    assert.deepEqual(emptyState.status(), { ok: true, count: 0, pending: [], truncated: false });
    assert.equal(existsSync(emptyState.path), false);
    assert.equal(emptyState.claimPlanNotice(), false);
    assert.equal(emptyState.claimUnnotified().count, 0);
    assert.equal(existsSync(emptyState.path), false);

    // mark() returns { becameNonEmpty }
    writeFileSync(join(root, 'a.ts'), '1');
    writeFileSync(join(root, 'b.ts'), '2');
    assert.deepEqual(emptyState.mark(['docs/plan/t/README.md']), { becameNonEmpty: false });
    assert.equal(existsSync(emptyState.path), false);
    assert.deepEqual(emptyState.mark(['a.ts']), { becameNonEmpty: true });
    assert.deepEqual(emptyState.mark(['b.ts']), { becameNonEmpty: false });

    // v2 schema: WAL, pending.notified, plan_notices exact 5 columns, no pending(expires_at) index
    const db = new DatabaseSync(emptyState.path);
    try {
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
      const pendingCols = db.prepare('PRAGMA table_info(pending)').all().map((c) => c.name);
      assert.ok(pendingCols.includes('notified'));
      const planCols = db.prepare('PRAGMA table_info(plan_notices)').all().map((c) => c.name);
      assert.deepEqual(planCols, ['session', 'fingerprint', 'notified', 'created_at', 'expires_at']);
      const indexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='pending' AND sql IS NOT NULL").all();
      assert.equal(indexes.some((idx) => /expires_at/.test(idx.sql)), false);
    } finally {
      db.close();
    }

    // clearPaths() isolates sessions
    const other = new ImpactState(root, 'sess-b');
    other.mark(['a.ts']);
    assert.equal(emptyState.clearPaths(['a.ts']), 1);
    assert.deepEqual(emptyState.status().pending, [{ path: 'b.ts' }]);
    assert.deepEqual(other.status().pending, [{ path: 'a.ts' }]);

    // claimUnnotified() marks notified=1 once and re-edit resets to 0
    const firstClaim = emptyState.claimUnnotified();
    assert.deepEqual(firstClaim, { ok: true, count: 1, pending: [{ path: 'b.ts' }], truncated: false });
    assert.equal(emptyState.claimUnnotified().count, 0);
    emptyState.mark(['b.ts']);
    assert.equal(emptyState.claimUnnotified().count, 1);

    // 2-process concurrency on claimUnnotified(): disjoint claimed sets whose union equals all marked paths
    const conc = new ImpactState(root, 'sess-conc');
    const concPaths = Array.from({ length: 12 }, (_, i) => `c${i}.ts`);
    for (const p of concPaths) writeFileSync(join(root, p), p);
    conc.mark(concPaths);
    const modUrl = new URL('../src/impact-state.mjs', import.meta.url).href;
    const workerCode = `import { ImpactState } from ${JSON.stringify(modUrl)}; const r = new ImpactState(${JSON.stringify(root)}, 'sess-conc').claimUnnotified(); console.log(JSON.stringify(r.pending.map(x => x.path)));`;
    const runWorker = () => new Promise((res, rej) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', workerCode], { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = ''; let err = '';
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('close', (code) => (code === 0 ? res(JSON.parse(out.trim())) : rej(new Error(err || `exit ${code}`))));
    });
    const [r1, r2] = await Promise.all([runWorker(), runWorker()]);
    const overlap = r1.filter((p) => r2.includes(p));
    assert.deepEqual(overlap, []);
    assert.deepEqual([...r1, ...r2].sort(), [...concPaths].sort());

    // plan_notices: unchanged hash suppresses re-notify, changed hash resets, clearPlanNotice clears
    emptyState.recordPlanNotice('hash-1');
    assert.equal(emptyState.claimPlanNotice(), true);
    assert.equal(emptyState.claimPlanNotice(), false);
    emptyState.recordPlanNotice('hash-1');
    assert.equal(emptyState.claimPlanNotice(), false, 'unchanged hash must not re-notify');
    emptyState.recordPlanNotice('hash-2');
    assert.equal(emptyState.claimPlanNotice(), true, 'changed hash resets notified');
    emptyState.recordPlanNotice('hash-3');
    assert.equal(emptyState.clearPlanNotice(), true);
    assert.equal(emptyState.claimPlanNotice(), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
