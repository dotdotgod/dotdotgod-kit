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
