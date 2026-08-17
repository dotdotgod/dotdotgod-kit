import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runner = `import { hookMain } from './src/hooks.mjs'; hookMain(process.argv[1]);`;
function hook(cwd, event, payload) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', runner, event], {
    cwd: new URL('..', import.meta.url), input: JSON.stringify({ cwd, session_id: 'test', ...payload }), encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('hooks gate load and fingerprinted impact without recursion', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hook-test-'));
  try {
    const started = hook(root, 'sessionstart', {});
    assert.match(started.hookSpecificOutput.additionalContext, /project memory/i);
    const deniedLoad = hook(root, 'pretooluse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
    assert.equal(deniedLoad.hookSpecificOutput.permissionDecision, 'deny');
    assert.deepEqual(hook(root, 'pretooluse', { tool_name: 'mcp__dotdotgod_project_load', tool_input: {} }), {});
    hook(root, 'posttooluse', { tool_name: 'mcp__dotdotgod_project_load', tool_input: {} });

    const file = join(root, 'source.ts');
    writeFileSync(file, 'export const value = 1;\n');
    hook(root, 'posttooluse', { tool_name: 'Write', tool_input: { file_path: file } });
    const deniedImpact = hook(root, 'pretooluse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } });
    assert.equal(deniedImpact.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(deniedImpact.hookSpecificOutput.permissionDecisionReason, /project_impact/);
    assert.deepEqual(hook(root, 'pretooluse', { tool_name: 'mcp__dotdotgod_project_impact', tool_input: { paths: [file] } }), {});
    hook(root, 'posttooluse', { tool_name: 'mcp__dotdotgod_project_impact', tool_input: { paths: [file] } });
    assert.deepEqual(hook(root, 'pretooluse', { tool_name: 'Bash', tool_input: { command: 'pnpm test' } }), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});
