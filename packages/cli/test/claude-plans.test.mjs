import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { prepareClaudePlans, applyClaudePlans } from '../src/claude-plans.mjs';

const cli = new URL('../bin/dotdotgod.mjs', import.meta.url);
function init(root, ...args) {
  const result = spawnSync(process.execPath, [cli.pathname, 'init', root, '--json', ...args], { encoding: 'utf8' });
  return { ...result, value: JSON.parse(result.stdout) };
}

test('Claude native plans are opt-in, merged, dry-run safe and idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-plans-'));
  try {
    assert.equal(init(root).status, 0);
    const path = join(root, '.claude/settings.json');
    assert.equal(existsSync(path), false);
    mkdirSync(join(root, '.claude'));
    const settings = { permissions: { deny: ['Write(./secrets/**)'] }, model: 'keep' };
    writeFileSync(path, JSON.stringify(settings));
    const dry = init(root, '--claude-plans', '--dry-run');
    assert.equal(dry.status, 0);
    assert.equal(dry.value.actions.at(-1).status, 'would_update');
    assert.deepEqual(JSON.parse(readFileSync(path)), settings);
    assert.equal(init(root, '--claude-plans').status, 0);
    assert.deepEqual(JSON.parse(readFileSync(path)), { ...settings, plansDirectory: './docs/plan' });
    const previous = readFileSync(path, 'utf8');
    assert.equal(init(root, '--claude-plans').value.actions.at(-1).status, 'skipped');
    assert.equal(readFileSync(path, 'utf8'), previous);
    writeFileSync(path, '{"plansDirectory":"./custom"}');
    assert.equal(init(root, '--claude-plans').value.actions.at(-1).value, './custom');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('invalid settings and symlinks fail before scaffolding; documentation-root is honored', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-plan-validation-'));
  try {
    mkdirSync(join(root, '.claude'));
    const path = join(root, '.claude/settings.json');
    for (const content of ['{broken', 'null', '[]']) {
      writeFileSync(path, content);
      assert.equal(init(root, '--claude-plans').status, 2);
      assert.equal(existsSync(join(root, 'AGENTS.md')), false);
      assert.equal(readFileSync(path, 'utf8'), content);
    }
    rmSync(path);
    symlinkSync(join(root, 'elsewhere.json'), path);
    assert.equal(init(root, '--claude-plans').status, 2);
    rmSync(path);
    assert.equal(init(root, '--claude-plans', '--documentation-root', 'knowledge').status, 0);
    assert.equal(JSON.parse(readFileSync(path)).plansDirectory, './knowledge/plan');
    rmSync(path);
    assert.equal(init(root, '--claude-plans').status, 0);
    assert.equal(JSON.parse(readFileSync(path)).plansDirectory, './knowledge/plan');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('settings changes between preview and apply are preserved', () => {
  const root = mkdtempSync(join(tmpdir(), 'claude-plan-concurrent-'));
  try {
    mkdirSync(join(root, '.claude'));
    const path = join(root, '.claude/settings.json');
    writeFileSync(path, '{}');
    const prepared = prepareClaudePlans(root, 'docs');
    writeFileSync(path, '{"model":"user edit"}');
    assert.throws(() => applyClaudePlans(prepared, false), /changed during/);
    assert.equal(readFileSync(path, 'utf8'), '{"model":"user edit"}');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
