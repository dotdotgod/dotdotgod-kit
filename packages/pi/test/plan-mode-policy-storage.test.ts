import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs, { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlanPolicy } from '../extensions/plan-mode/policy/storage.ts';
import * as storage from '../extensions/plan-mode/policy/storage.ts';
const { loadPolicyFile } = storage;
import { canonicalPath, markdownDecision } from '../extensions/plan-mode/policy/markdown.ts';

function fixture(t: { after(fn: () => void): void }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'plan-policy-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const empty = (): PlanPolicy => ({ commands: [], markdown: { allow: [], deny: [] } });

test('load validates revisions, policy and project metadata without saving config', t => {
  let raw = '{}';
  let kind = 'file';
  const stat = t.mock.method(fs, 'lstatSync', (path: string) => {
    if (kind === 'missing') throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { isSymbolicLink: () => kind === 'symlink' && path === '/project/config.json' };
  });
  const read = t.mock.method(fs, 'readFileSync', () => raw);
  syncBuiltinESMExports();
  t.after(() => { stat.mock.restore(); read.mock.restore(); syncBuiltinESMExports(); });
  const load = (project = false) => loadPolicyFile('/project/config.json', { allowAbsolutePaths: !project });
  assert.equal('savePolicyFile' in storage, false);
  kind = 'missing'; assert.equal(load().revision, ''); kind = 'file';
  const before = load();
  raw = JSON.stringify({ templates: { custom: true }, planMode: { writablePaths: ['old'] } });
  assert.notEqual(load().revision, before.revision);
  assert.deepEqual(load().data.templates, { custom: true });
  assert.equal(load().error, undefined);
  raw = JSON.stringify({ planMode: { markdown: { allow: ['notes/**'] } } });
  assert.deepEqual(load().policy.markdown.allow, ['notes/**']);
  for (const value of [null, [], { planMode: null }, { planMode: { commands: 'bad' } }, { planMode: { markdown: { allow: [3] } } }, { planMode: { markdown: { deny: ['a/*'] } } }, { planMode: { commands: [{ effect: 'other', executable: '/bin/x', args: [3], cwd: '/' }] } }]) {
    raw = JSON.stringify(value); assert.ok(load().error);
  }
  raw = '{'; assert.ok(load().error);
  raw = JSON.stringify({ documentation: { root: '../outside' } });
  assert.equal(load().error, undefined);
  assert.match(load(true).error ?? '', /documentation.root/);
  raw = JSON.stringify({ memory: { areas: 'bad' } });
  assert.match(load(true).error ?? '', /memory.areas/);
  raw = JSON.stringify({ planMode: { markdown: { allow: ['/absolute/**'] } } });
  assert.equal(load().error, undefined);
  assert.match(load(true).error ?? '', /planMode.markdown.allow/);
  kind = 'symlink'; assert.match(load().error ?? '', /symlink/i);
});

test('canonical Markdown roots, new ancestors, exact grants, deny priority and link escape', t => {
  const root = fixture(t), outside = fixture(t);
  mkdirSync(join(root, 'plans')); symlinkSync(root, join(root, 'alias'));
  const real = canonicalPath(root, '.');
  assert.equal(canonicalPath(root, 'alias/plans/new/deep.md'), join(real, 'plans/new/deep.md'));
  const policy = empty(), roots = ['plans/**'];
  assert.equal(markdownDecision(root, 'plans/new/deep.md', roots, policy), 'allow');
  assert.equal(markdownDecision(root, 'alias/plans/new/deep.md', roots, policy), 'allow');
  assert.equal(markdownDecision(root, 'plans/../extra.md', roots, policy), 'deny');
  assert.equal(markdownDecision(root, 'extra.md', roots, policy), 'approval');
  policy.markdown.allow.push('extra.md');
  assert.equal(markdownDecision(root, 'extra.md', roots, policy), 'allow');
  assert.equal(markdownDecision(root, 'sibling.md', roots, policy), 'approval');
  policy.markdown.deny.push('plans/private/**');
  assert.equal(markdownDecision(root, 'plans/private/a.md', roots, policy), 'deny');
  symlinkSync(outside, join(root, 'plans/escape'));
  assert.equal(markdownDecision(root, 'plans/escape/a.md', roots, policy), 'deny');
  symlinkSync(join(outside, 'missing'), join(root, 'plans/broken'));
  assert.equal(markdownDecision(root, 'plans/broken/a.md', roots, policy), 'deny');
  policy.markdown.allow.push('plans/**');
  for (const path of ['plans/AGENTS.md', 'plans/CLAUDE.md', 'plans/CODEX.md', 'plans/.pi/x.md', 'plans/.git/x.md', 'plans/node_modules/x.md', 'plans/x.ts']) {
    assert.equal(markdownDecision(root, path, roots, policy), 'deny', path);
  }
});
