import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as config from '../src/memory/config.mjs';

const empty = { commands: [], markdown: { allow: [], deny: [] } };
const command = { effect: 'allow', executable: '/usr/bin/tool', args: ['--help', '', '*', 'a b'], cwd: '/project' };

test('plan policy defaults and serialization use isolated empty lists', () => {
  for (const policy of [config.defaultMemoryConfig().planMode, config.defaultDotdotgodConfigData().planMode, JSON.parse(config.defaultDotdotgodConfigText()).planMode]) assert.deepEqual(policy, empty);
  const first = config.clonePlanModePolicy();
  first.markdown.allow.push('docs/**');
  assert.deepEqual(config.clonePlanModePolicy(), empty);
});

test('plan policy clones exact commands and markdown without legacy fields', () => {
  const raw = { commands: [command], markdown: { allow: ['docs/plan/**'], deny: ['AGENTS.md'] }, writablePaths: 'ignored' };
  const normalized = config.normalizePlanModePolicy(raw);
  assert.deepEqual(normalized, { commands: [command], markdown: raw.markdown });
  normalized.commands[0].args.push('changed');
  normalized.markdown.allow.push('other.md');
  assert.equal(command.args.length, 4);
  assert.equal(raw.markdown.allow.length, 1);
  assert.deepEqual(config.normalizePlanModePolicy({ writablePaths: '../anything' }), empty);
  assert.deepEqual(config.normalizePlanModePolicy({ markdown: { deny: ['AGENTS.md'] } }), { ...empty, markdown: { allow: [], deny: ['AGENTS.md'] } });
});

test('plan policy validator accepts exact strings and user absolute paths only explicitly', () => {
  assert.deepEqual(config.validateMemoryConfigData({ planMode: { commands: [command], markdown: { allow: ['docs/plan/**', 'notes.md'], deny: ['AGENTS.md'] } } }), []);
  const policy = { markdown: { allow: ['/home/user/notes/**'] } };
  assert.deepEqual(config.validatePlanModePolicy(policy, { allowAbsolutePaths: true }), []);
  assert.deepEqual(config.validatePlanModePolicy({ commands: [{ ...command, effect: 'deny', cwd: '/' }] }), []);
  assert.deepEqual(config.validatePlanModePolicy({ markdown: { allow: ['/**'] } }, { allowAbsolutePaths: true }), []);
  assert(config.validateMemoryConfigData({ planMode: policy }).some(error => error.message.includes('planMode.markdown.allow[0]')));
});

test('plan policy validation reports precise malformed fields without discarding rules', () => {
  const cases = [
    [null, 'planMode'], [[], 'planMode'], [{ commands: {} }, 'planMode.commands'],
    [{ commands: [null] }, 'planMode.commands[0]'],
    ...['effect', 'executable', 'args', 'cwd'].map(key => [{ commands: [{ ...command, [key]: null }] }, `planMode.commands[0].${key}`]),
    ...['tool', '/bin/../tool', '/bin//tool', '/bin/tool/', '/bin/*', '/bin/./tool'].map(executable => [{ commands: [{ ...command, executable }] }, 'planMode.commands[0].executable']),
    [{ commands: [{ ...command, args: [1] }] }, 'planMode.commands[0].args'],
    [{ commands: [{ ...command, env: {} }] }, 'planMode.commands[0].env'],
    [{ markdown: [] }, 'planMode.markdown'], [{ markdown: { allow: 'docs/**' } }, 'planMode.markdown.allow'],
    ...['../docs/**', 'docs/../x.md', '**/README.md', 'docs/*.md', 'docs/**/x', 'docs/?', '', '   ', './docs.md', 'docs//x.md', 'C:\\notes\\x.md', 'docs/./x.md'].map(path => [{ markdown: { deny: [path] } }, 'planMode.markdown.deny[0]']),
    [{ surprise: true }, 'planMode.surprise'], [{ markdown: { surprise: [] } }, 'planMode.markdown.surprise'],
  ];
  for (const [policy, field] of cases) assert(config.validateMemoryConfigData({ planMode: policy }).some(error => error.message.includes(`Field "${field}"`)), `${field}: ${JSON.stringify(policy)}`);
  assert.deepEqual(config.validateMemoryConfigData({ planMode: { writablePaths: { anything: true } } }), []);
});

test('read and summary retain valid policy while invalid config preserves CLI fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'plan-policy-'));
  try {
    const policy = { commands: [command], markdown: { allow: ['notes/**'], deny: [] } };
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ planMode: policy }));
    const loaded = config.readMemoryConfig(root);
    assert.deepEqual(loaded.errors, []);
    assert.deepEqual(loaded.planMode, policy);
    const summary = config.memoryConfigSummary(loaded);
    assert.deepEqual(summary.planMode, policy);
    summary.planMode.commands[0].args.push('other');
    assert.equal(loaded.planMode.commands[0].args.length, 4);
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ planMode: { commands: [{ ...command, effect: 'maybe' }] } }));
    const invalid = config.readMemoryConfig(root);
    assert.deepEqual(invalid.planMode, empty);
    assert(invalid.errors.some(error => error.message.includes('planMode.commands[0].effect')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
