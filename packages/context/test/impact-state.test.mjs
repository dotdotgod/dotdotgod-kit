import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { ImpactState, impactReminder, withImpactReview } from '../src/impact-state.mjs';
import { validateSessionId } from '../src/session.mjs';

function loadFixture(t, session = 'load') {
  const root = mkdtempSync(join(tmpdir(), 'impact-load-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return new ImpactState(root, session);
}

const unloaded = { assessed: false, loaded: false, notified: false, skipCount: 0, lastPromptHash: null };

test('v2 read does not enable WAL or add v3 DDL; first writer migrates additively', (t) => {
  const state = loadFixture(t);
  assert.deepEqual(state.getLoadState(), unloaded);
  assert.equal(existsSync(state.path), false);
  mkdirSync(join(state.root, '.dotdotgod/context'), { recursive: true });
  const legacy = new DatabaseSync(state.path);
  legacy.exec(`CREATE TABLE pending (session TEXT NOT NULL, path TEXT NOT NULL, revision TEXT NOT NULL, fingerprint TEXT, created_at INTEGER, expires_at INTEGER, notified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (session, path));
    CREATE TABLE plan_notices (session TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, notified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  const now = Date.now();
  legacy.prepare('INSERT INTO pending VALUES (?, ?, ?, ?, ?, ?, ?)').run('load', 'a.ts', 'rev', 'fp', now, now + 60000, 0);
  legacy.close();
  const before = readFileSync(state.path);
  assert.deepEqual(state.getLoadState(), unloaded);
  assert.equal(state.status().count, 1);
  assert.deepEqual(readFileSync(state.path), before);
  assert.equal(existsSync(`${state.path}-wal`), false);
  assert.equal(state.claimAdvisedOnce(), true);
  assert.equal(state.claimAdvisedOnce(), false);
  assert.deepEqual(state.getLoadState(), { ...unloaded, assessed: true, notified: true });
  assert.equal(state.status().count, 1);
  assert.equal(existsSync(`${state.path}-wal`), false);
  assert.equal(existsSync(`${state.path}-shm`), false);
  const db = new DatabaseSync(state.path);
  try {
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    const columns = Object.fromEntries(db.prepare('PRAGMA table_info(load_state)').all().map(({ name, ...column }) => [name, column]));
    assert.deepEqual(Object.keys(columns), ['session', 'assessed', 'loaded', 'notified', 'skip_count', 'last_prompt_hash', 'inflight_token', 'inflight_until', 'created_at', 'expires_at']);
    assert.equal(columns.inflight_until.notnull, 1);
    assert.equal(columns.inflight_until.dflt_value, '0');
    for (const change of ['assessed = 2', 'loaded = 2', 'notified = -1', 'skip_count = -1', 'inflight_until = -1', 'expires_at = created_at']) {
      assert.throws(() => db.exec(`UPDATE load_state SET ${change}`), /CHECK constraint failed/);
    }
  } finally { db.close(); }
});

test('lease expiry replaces token without recording a hash, stale CAS fails, and fifth distinct skip is terminal', (t) => {
  const state = loadFixture(t);
  const first = state.beginLoadAssessment('hash-1', 5000);
  assert.equal(first.session, state.sessionId);
  assert.equal(first.skipCount, 0);
  assert.deepEqual(state.getLoadState(), unloaded);
  assert.equal(state.beginLoadAssessment('hash-other', 5000), undefined);
  const db = new DatabaseSync(state.path);
  db.exec('UPDATE load_state SET inflight_until = 0');
  db.close();
  const next = state.beginLoadAssessment('hash-1', 5000);
  assert.notEqual(next.token, first.token);
  assert.equal(state.recordLoadSkip(first.token, 'hash-1').recorded, false);
  assert.equal(state.completeLoadNotified(first.token, 'hash-1'), false);
  assert.equal(state.completeLoadPrefetch(first.token, 'hash-1'), false);
  assert.deepEqual(state.recordLoadSkip(next.token, 'hash-1'), { recorded: true, terminal: false, skipCount: 1 });
  assert.equal(state.beginLoadAssessment('hash-1', 5000), undefined);
  for (let i = 2; i <= 5; i++) {
    const hash = `hash-${i}`;
    const claim = state.beginLoadAssessment(hash, 5000);
    assert.equal(claim.skipCount, i - 1);
    assert.deepEqual(state.recordLoadSkip(claim.token, hash), { recorded: true, terminal: i === 5, skipCount: i });
    assert.equal(state.recordLoadSkip(claim.token, hash).recorded, false);
  }
  assert.deepEqual(state.getLoadState(), { ...unloaded, assessed: true, notified: true, skipCount: 5, lastPromptHash: 'hash-5' });
  assert.equal(state.beginLoadAssessment('hash-6', 5000), undefined);
  assert.equal(state.claimAdvisedOnce(), false);
});

test('write purges all three tables; explicit load clears lease and preserves a live row’s 24h TTL', (t) => {
  const state = loadFixture(t);
  state.mark(['a.ts']);
  state.recordPlanNotice('plan');
  state.beginLoadAssessment('old', 5000);
  const db = new DatabaseSync(state.path);
  try {
    const times = () => db.prepare('SELECT created_at, expires_at FROM load_state').get();
    for (const table of ['pending', 'plan_notices', 'load_state']) db.exec(`UPDATE ${table} SET created_at = 1, expires_at = 2`);
    assert.deepEqual(state.getLoadState(), unloaded);
    assert.equal(times().expires_at, 2, 'read never purges');
    state.markLoaded();
    assert.ok(times().created_at > 2);
    assert.equal(times().expires_at - times().created_at, 86400000);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pending').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM plan_notices').get().n, 0);
    assert.deepEqual(state.getLoadState(), { ...unloaded, assessed: true, notified: true, loaded: true });
    db.exec('UPDATE load_state SET assessed = 0, loaded = 0, notified = 0');
    const { token } = state.beginLoadAssessment('racing', 5000);
    const live = times();
    state.markLoaded();
    state.markLoaded();
    assert.deepEqual(times(), live);
    assert.deepEqual({ ...db.prepare('SELECT inflight_token, inflight_until FROM load_state').get() }, { inflight_token: null, inflight_until: 0 });
    assert.equal(state.completeLoadPrefetch(token, 'racing'), false);
  } finally { db.close(); }
});

test('two processes racing for one SQLite lease elect exactly one claimant', async (t) => {
  const state = loadFixture(t);
  const module = new URL('../src/impact-state.mjs', import.meta.url).href;
  const code = `import { ImpactState } from ${JSON.stringify(module)}; const state = new ImpactState(${JSON.stringify(state.root)}, 'load'); console.log(Boolean(state.beginLoadAssessment('same', 15000)));`;
  const run = () => promisify(execFile)(process.execPath, ['--input-type=module', '-e', code]);
  const children = await Promise.all([run(), run()]);
  assert.deepEqual(children.map(({ stdout }) => stdout.trim()).sort(), ['false', 'true']);
});

test('S-07: reserved default is rejected case-insensitively at the session boundary', (t) => {
  const state = loadFixture(t);
  for (const id of ['default', 'DeFaUlt', 'DEFAULT']) {
    assert.throws(() => validateSessionId(id), /sessionId/);
    assert.throws(() => new ImpactState(state.root, id), /sessionId/);
  }
  assert.equal(validateSessionId('default-1'), 'default-1');
  assert.equal(existsSync(state.path), false);
});

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
