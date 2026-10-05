import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const hook = new URL('../../../.husky/pre-push', import.meta.url);
test('pre-push validates docs once, retains cache/package gates and fails closed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pre-push-'));
  try {
    const commands = ['pnpm run verify', 'node packages/cli/bin/dotdotgod.mjs index . --json',
      'node packages/cli/bin/dotdotgod.mjs status . --json', 'pnpm run pack:dry-run:packages'];
    for (const name of ['pnpm', 'node']) writeFileSync(join(root, name),
      `#!/bin/sh\necho "${name} $*" >> "$CALL_LOG"\n[ "${name} $*" != "$FAIL_COMMAND" ]\n`, { mode: 0o755 });
    const log = join(root, 'calls.log');
    for (const failAt of [-1, 0, 1, 2, 3]) {
      writeFileSync(log, '');
      const result = spawnSync('/bin/sh', [hook.pathname], { env: {
        ...process.env, PATH: root, CALL_LOG: log, FAIL_COMMAND: commands[failAt] ?? '',
      } });
      assert.equal(result.status, failAt === -1 ? 0 : 1);
      assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n'),
        commands.slice(0, failAt === -1 ? commands.length : failAt + 1));
    }
    const workspace = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url)));
    const cli = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
    assert.match(cli.scripts.verify, /validate.*--include-local-memory/);
    assert.match(workspace.scripts.verify, /pnpm -r --if-present run verify/);
    assert.match(workspace.scripts['verify:cache'], /validate.*&&.*index.*&&.*status/);
    assert.doesNotMatch(readFileSync(hook, 'utf8'), /verify:cache|\bvalidate\b/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
