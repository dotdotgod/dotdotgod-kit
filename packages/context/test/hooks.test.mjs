import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runner = `import { hookMain } from './src/hooks.mjs'; hookMain(process.argv[1]);`;
function hook(event, input = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', runner, event], {
    cwd: new URL('..', import.meta.url), input: JSON.stringify(input), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function payload(root, event, extra = {}) {
  return hook(event, { cwd: root, session_id: 'test', ...extra });
}

const bash = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
const load = { tool_name: 'mcp__dotdotgod_project_load', tool_input: {} };

test('hooks gate load and fingerprinted impact without recursion', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-test-'));
  try {
    const started = payload(root, 'sessionstart');
    assert.match(started.hookSpecificOutput.additionalContext, /project memory/i);
    assert.equal(payload(root, 'pretooluse', bash).hookSpecificOutput.permissionDecision, 'deny');
    assert.deepEqual(payload(root, 'pretooluse', load), {});
    payload(root, 'posttooluse', load);

    const file = join(root, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    payload(root, 'posttooluse', { tool_name: 'Write', tool_input: { file_path: file } });
    const deniedImpact = payload(root, 'pretooluse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } });
    assert.equal(deniedImpact.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(deniedImpact.hookSpecificOutput.permissionDecisionReason, /project_impact/);
    const impact = { tool_name: 'mcp__dotdotgod_project_impact', tool_input: { paths: [file] } };
    assert.deepEqual(payload(root, 'pretooluse', impact), {});
    payload(root, 'posttooluse', impact);
    assert.deepEqual(payload(root, 'pretooluse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } }), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hooks share load state across nested event working directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-nested-'));
  const nested = join(root, 'packages', 'app');
  mkdirSync(nested, { recursive: true });
  try {
    payload(root, 'sessionstart');
    assert.equal(payload(root, 'pretooluse', bash).hookSpecificOutput.permissionDecision, 'deny');
    hook('posttooluse', { cwd: nested, session_id: 'test', ...load });
    assert.deepEqual(payload(root, 'pretooluse', bash), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('declared project root overrides transient hook cwd and supports missing cwd', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-declared-'));
  const nested = join(root, 'nested');
  mkdirSync(nested);
  try {
    hook('sessionstart', { project_dir: root, cwd: nested, session_id: 'declared' });
    assert.equal(hook('pretooluse', { project_dir: root, cwd: nested, session_id: 'declared', ...bash }).hookSpecificOutput.permissionDecision, 'deny');
    hook('posttooluse', { project_dir: root, session_id: 'declared', ...load });
    assert.deepEqual(hook('pretooluse', { project_dir: root, session_id: 'declared', ...bash }), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hook state remains isolated between projects with the same session id', () => {
  const rootA = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-a-'));
  const rootB = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-b-'));
  try {
    payload(rootA, 'sessionstart');
    payload(rootB, 'sessionstart');
    payload(rootA, 'posttooluse', load);
    assert.deepEqual(payload(rootA, 'pretooluse', bash), {});
    assert.equal(payload(rootB, 'pretooluse', bash).hookSpecificOutput.permissionDecision, 'deny');
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});

test('impact fingerprints resolve against the canonical project root', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-impact-root-'));
  const nested = join(root, 'nested');
  mkdirSync(nested);
  try {
    hook('sessionstart', { project_dir: root, cwd: nested, session_id: 'impact' });
    hook('posttooluse', { project_dir: root, session_id: 'impact', ...load });
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
    hook('posttooluse', { project_dir: root, cwd: nested, session_id: 'impact', tool_name: 'Write', tool_input: { file_path: 'source.ts' } });
    const verify = { tool_name: 'Bash', tool_input: { command: 'pnpm test' } };
    assert.match(hook('pretooluse', { project_dir: root, session_id: 'impact', ...verify }).hookSpecificOutput.permissionDecisionReason, /project_impact/);
    hook('posttooluse', { project_dir: root, cwd: nested, session_id: 'impact', tool_name: 'mcp__dotdotgod_project_impact', tool_input: { paths: ['source.ts'] } });
    assert.deepEqual(hook('pretooluse', { project_dir: root, session_id: 'impact', ...verify }), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unrelated or unidentified hook inputs fail open', () => {
  const rootA = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-known-'));
  const rootB = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-unrelated-'));
  try {
    payload(rootA, 'sessionstart');
    assert.deepEqual(payload(rootB, 'pretooluse', bash), {});
    assert.equal(payload(rootA, 'pretooluse', bash).hookSpecificOutput.permissionDecision, 'deny');
    assert.deepEqual(hook('pretooluse', { session_id: 'unknown', ...bash }), {});
  } finally {
    rmSync(rootA, { recursive: true, force: true });
    rmSync(rootB, { recursive: true, force: true });
  }
});
