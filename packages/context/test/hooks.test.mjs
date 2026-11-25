import assert from 'node:assert/strict';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  extractHookSessionId,
  formatHookError,
  isInitializedProject,
  selectWorkspaceForPath,
} from '../src/hook-state.mjs';
import { ImpactState } from '../src/impact-state.mjs';

const runner = `import { hookMain } from './src/hooks.mjs'; hookMain(process.argv[1]);`;
const packageRoot = new URL('..', import.meta.url);

function runHookRaw(event, stdinText, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  if (!Object.hasOwn(extraEnv, 'CLAUDE_PROJECT_DIR')) delete env.CLAUDE_PROJECT_DIR;
  return spawnSync(process.execPath, ['--input-type=module', '-e', runner, event], {
    cwd: packageRoot,
    input: stdinText,
    encoding: 'utf8',
    env,
  });
}

function hook(event, input = {}, extraEnv = {}) {
  const result = runHookRaw(event, JSON.stringify(input), extraEnv);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function initProject(prefix, config = {}) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify(config));
  return root;
}

function impactDbPath(root) {
  return join(root, '.dotdotgod', 'context', 'impact.sqlite');
}

test('HK-01: extractHookSessionId rejects invalid session IDs without default fallback or DB creation', () => {
  for (const bad of ['', '   ', '../evil', 'a/b', 'bad space', 'x'.repeat(129), 123, null, undefined, {}]) {
    assert.equal(extractHookSessionId({ session_id: bad }), null);
    assert.equal(extractHookSessionId({ sessionId: bad }), null);
    assert.equal(extractHookSessionId({ conversationId: bad }), null);
  }
  assert.equal(extractHookSessionId({ session_id: 'sess_ok-1.2~a' }), 'sess_ok-1.2~a');
  assert.equal(extractHookSessionId({ conversationId: 'conv-123' }), 'conv-123');

  const root = initProject('dotdotgod-hk01-');
  try {
    writeFileSync(join(root, 'source.ts'), 'export const x = 1;\n');
    for (const badId of [undefined, '', '../evil', 'a'.repeat(129)]) {
      const base = badId === undefined ? { cwd: root } : { cwd: root, session_id: badId };
      assert.deepEqual(hook('posttooluse', { ...base, tool_name: 'Write', tool_input: { file_path: join(root, 'source.ts') } }), {});
      assert.deepEqual(hook('userpromptsubmit', base), {});
    }
    assert.equal(existsSync(impactDbPath(root)), false, 'invalid session IDs must not create impact.sqlite');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('HK-02: isInitializedProject rejects symlinks and selectWorkspaceForPath enforces segment boundaries', () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-hk02-'));
  try {
    const externalCfg = join(root, 'real.config.json');
    const externalDir = join(root, 'real-dotdotgod');
    writeFileSync(externalCfg, '{}');
    mkdirSync(externalDir);

    const symlinkCfgRepo = join(root, 'symlink-cfg');
    mkdirSync(symlinkCfgRepo);
    symlinkSync(externalCfg, join(symlinkCfgRepo, 'dotdotgod.config.json'));
    assert.equal(isInitializedProject(symlinkCfgRepo), false);

    const symlinkDirRepo = join(root, 'symlink-dir');
    mkdirSync(symlinkDirRepo);
    symlinkSync(externalDir, join(symlinkDirRepo, '.dotdotgod'));
    assert.equal(isInitializedProject(symlinkDirRepo), false);

    assert.deepEqual(
      hook('posttooluse', { cwd: symlinkCfgRepo, session_id: 'sym', tool_name: 'Write', tool_input: { file_path: join(symlinkCfgRepo, 'a.ts') } }),
      {},
    );
    assert.equal(existsSync(impactDbPath(symlinkCfgRepo)), false);

    const realDirRepo = join(root, 'real-dir-repo');
    mkdirSync(join(realDirRepo, '.dotdotgod'), { recursive: true });
    assert.equal(isInitializedProject(realDirRepo), true);

    const app = join(root, 'app');
    const appSub = join(app, 'sub');
    const appV2 = join(root, 'app-v2');
    mkdirSync(appSub, { recursive: true });
    mkdirSync(appV2, { recursive: true });
    assert.equal(selectWorkspaceForPath([app], join(appV2, 'file.ts')), null);
    assert.equal(selectWorkspaceForPath([app, appSub], join(appSub, 'file.ts')), appSub);
    assert.equal(selectWorkspaceForPath([app, appSub], join(app, 'file.ts')), app);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('HK-03: formatHookError masks $HOME, strips newlines/ANSI, caps at 240 chars, and hookMain fails open', () => {
  const home = homedir();
  const noisy = new Error(`\x1B[31mboom\x1B[0m at ${home}/secret/file.ts\r\nline2\t${'z'.repeat(300)}`);
  const formatted = formatHookError(noisy);
  assert.equal(formatted.includes(home), false);
  assert.equal(formatted.includes('~/secret/file.ts'), true);
  assert.doesNotMatch(formatted, /[\r\n\x1B]/);
  assert.ok(formatted.length <= 240);
  assert.ok(formatted.endsWith('...'));

  for (const badStdin of ['{not valid json', '["array-not-object"]']) {
    const res = runHookRaw('posttooluse', badStdin);
    assert.equal(res.status, 0);
    assert.equal(res.stdout, '{}\n');
    assert.match(res.stderr, /^dotdotgod hook error: .+\n$/);
    assert.ok(res.stderr.trimEnd().length <= 240);
  }
});

test('HK-04: Claude Code & Codex full advisory loop is non-blocking, tracks apply_patch and docRoot, and honors root resolution', () => {
  const uninit = mkdtempSync(join(tmpdir(), 'dotdotgod-hk04-uninit-'));
  const root = initProject('dotdotgod-hk04-init-', { documentation: { root: 'knowledge' } });
  const nested = join(root, 'packages', 'app');
  mkdirSync(nested, { recursive: true });
  try {
    // Uninitialized repo stays completely silent and creates no DB.
    assert.deepEqual(hook('sessionstart', { cwd: uninit, session_id: 's1' }), {});
    assert.deepEqual(hook('posttooluse', { cwd: uninit, session_id: 's1', tool_name: 'Write', tool_input: { file_path: join(uninit, 'a.ts') } }), {});
    assert.deepEqual(hook('userpromptsubmit', { cwd: uninit, session_id: 's1' }), {});
    assert.equal(existsSync(impactDbPath(uninit)), false);

    // SessionStart gives optional non-blocking advice without writing DB.
    const started = hook('sessionstart', { cwd: nested, session_id: 's1' });
    assert.equal(started.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(started.hookSpecificOutput.additionalContext, /project_load/);
    assert.doesNotMatch(started.hookSpecificOutput.additionalContext, /must|required|before substantive/i);
    assert.equal(existsSync(impactDbPath(root)), false);

    // UserPromptSubmit with no pending is a read-only no-op and does not create DB.
    assert.deepEqual(hook('userpromptsubmit', { cwd: nested, session_id: 's1' }), {});
    assert.equal(existsSync(impactDbPath(root)), false);

    // Custom documentation.root excludes plan/archive, keeps post.
    for (const ignored of ['knowledge/plan/task/README.md', 'knowledge/archive/old/README.md', 'node_modules/pkg/index.js']) {
      const target = join(root, ignored);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, 'ignored\n');
      assert.deepEqual(hook('posttooluse', { cwd: nested, session_id: 's1', tool_name: 'Write', tool_input: { file_path: target } }), {});
    }
    assert.equal(existsSync(impactDbPath(root)), false);

    // First tracked edit (0 -> >0) emits 1-time PostToolUse advisory notice (including <docRoot>/post).
    const postDoc = join(root, 'knowledge/post/note/README.md');
    mkdirSync(dirname(postDoc), { recursive: true });
    writeFileSync(postDoc, '# Post\n');
    const firstEdit = hook('posttooluse', { cwd: nested, session_id: 's1', tool_name: 'Write', tool_input: { file_path: postDoc } });
    assert.equal(firstEdit.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(firstEdit.hookSpecificOutput.additionalContext, /knowledge\/post\/note\/README\.md/);
    assert.match(firstEdit.hookSpecificOutput.additionalContext, /does not block/i);

    // Second edit (>0 -> >0) records path silently without repeating PostToolUse advisory.
    const srcA = join(root, 'src/a.ts');
    const srcB = join(root, 'src/b.ts');
    mkdirSync(dirname(srcA), { recursive: true });
    writeFileSync(srcA, 'export const a = 1;\n');
    writeFileSync(srcB, 'export const b = 2;\n');
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '@@',
      '+export const a = 1;',
      '*** Add File: src/b.ts',
      '+export const b = 2;',
      '*** End Patch',
    ].join('\n');
    assert.deepEqual(hook('posttooluse', { cwd: nested, session_id: 's1', tool_name: 'apply_patch', tool_input: { patch } }), {});

    // MultiEdit also tracked cleanly.
    const srcC = join(root, 'src/c.ts');
    writeFileSync(srcC, 'export const c = 3;\n');
    assert.deepEqual(hook('posttooluse', { project_dir: root, session_id: 's1', tool_name: 'MultiEdit', tool_input: { file_path: 'src/c.ts', edits: [] } }), {});

    // UserPromptSubmit emits per-turn advisory across multiple turns (read-only, includes all 4 paths).
    for (let turn = 0; turn < 2; turn += 1) {
      const promptAdvice = hook('userpromptsubmit', { session_id: 's1' }, { CLAUDE_PROJECT_DIR: root });
      assert.equal(promptAdvice.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      for (const expectedPath of ['knowledge/post/note/README.md', 'src/a.ts', 'src/b.ts', 'src/c.ts']) {
        assert.match(promptAdvice.hookSpecificOutput.additionalContext, new RegExp(expectedPath.replaceAll('/', '\\/')));
      }
      assert.match(promptAdvice.hookSpecificOutput.additionalContext, /does not block/i);
    }

    // PreToolUse ALWAYS returns {} and NEVER denies any command or tool.
    for (const tool_name of ['Bash', 'Shell', 'local_shell', 'exec_command', 'Edit', 'Write', 'apply_patch']) {
      const pre = hook('pretooluse', { cwd: root, session_id: 's1', tool_name, tool_input: { command: 'pnpm test && git commit -m "x"', file_path: srcA } });
      assert.deepEqual(pre, {});
    }

    // Different session sees empty pending.
    assert.deepEqual(hook('userpromptsubmit', { cwd: root, session_id: 'other-session' }), {});
  } finally {
    rmSync(uninit, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('HK-05: failed project_impact retains pending, succeeded clears, third-party MCP and legacy runtime JSON are ignored', () => {
  const root = initProject('dotdotgod-hk05-');
  try {
    // Seed legacy .dotdotgod/context/runtime/s1.json with loadRequired + pending: must be completely ignored.
    const legacyPath = join(root, '.dotdotgod', 'context', 'runtime', 's1.json');
    mkdirSync(dirname(legacyPath), { recursive: true });
    const legacyContent = JSON.stringify({ loadRequired: true, pending: { [join(root, 'legacy.ts')]: true } });
    writeFileSync(legacyPath, legacyContent);
    assert.deepEqual(hook('userpromptsubmit', { cwd: root, session_id: 's1' }), {});
    assert.deepEqual(hook('pretooluse', { cwd: root, session_id: 's1', tool_name: 'Bash', tool_input: { command: 'pnpm test' } }), {});
    assert.equal(readFileSync(legacyPath, 'utf8'), legacyContent, 'legacy runtime JSON must not be mutated');

    // Failed Write does NOT mark pending.
    const fileA = join(root, 'src/a.ts');
    const fileB = join(root, 'src/b.ts');
    mkdirSync(dirname(fileA), { recursive: true });
    writeFileSync(fileA, 'export const a = 1;\n');
    writeFileSync(fileB, 'export const b = 2;\n');
    assert.deepEqual(
      hook('posttooluse', { cwd: root, session_id: 's1', tool_name: 'Write', tool_input: { file_path: fileA }, tool_response: { isError: true } }),
      {},
    );
    assert.equal(new ImpactState(root, 's1').status().count, 0);

    // Mark both files via apply_patch raw string input.
    const rawPatch = '*** Begin Patch\n*** Update File: src/a.ts\n*** Update File: src/b.ts\n*** End Patch';
    const marked = hook('posttooluse', { cwd: root, session_id: 's1', tool_name: 'apply_patch', tool_input: rawPatch });
    assert.equal(marked.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.equal(new ImpactState(root, 's1').status().count, 2);

    // Third-party MCP tool and unprefixed bare tool name cannot clear pending.
    for (const untrusted of ['mcp__other_server__project_impact', 'project_impact']) {
      assert.deepEqual(
        hook('posttooluse', { cwd: root, session_id: 's1', tool_name: untrusted, tool_input: { paths: ['src/a.ts', 'src/b.ts'] } }),
        {},
      );
    }
    assert.equal(new ImpactState(root, 's1').status().count, 2);

    // Failed dotdotgod project_impact retains pending across all failure shapes.
    const failurePayloads = [
      { tool_response: { ok: false, error: 'cli failed' } },
      { tool_response: { isError: true } },
      { tool_response: { is_error: true } },
      { tool_response: { status: 'failed' } },
      { tool_response: { structuredContent: { ok: false } } },
      { error: 'top-level error' },
    ];
    for (const failExtra of failurePayloads) {
      assert.deepEqual(
        hook('posttooluse', {
          cwd: root,
          session_id: 's1',
          tool_name: 'mcp__dotdotgod_context__project_impact',
          tool_input: { paths: ['src/a.ts', 'src/b.ts'] },
          ...failExtra,
        }),
        {},
      );
      assert.equal(new ImpactState(root, 's1').status().count, 2);
    }

    // Succeeded dotdotgod project_impact clears requested path using official prefixes.
    assert.deepEqual(
      hook('posttooluse', {
        cwd: root,
        session_id: 's1',
        tool_name: 'mcp__plugin_dotdotgod_dotdotgod-context__project_impact',
        tool_input: { paths: ['src/a.ts'] },
        tool_response: { ok: true },
      }),
      {},
    );
    assert.deepEqual(new ImpactState(root, 's1').status().pending, [{ path: 'src/b.ts' }]);

    assert.deepEqual(
      hook('posttooluse', {
        cwd: root,
        session_id: 's1',
        tool_name: 'mcp__dotdotgod-context__project_impact',
        tool_input: { paths: [fileB] },
      }),
      {},
    );
    assert.equal(new ImpactState(root, 's1').status().count, 0);
    assert.deepEqual(hook('userpromptsubmit', { cwd: root, session_id: 's1' }), {});

    // Re-edit after clear transitions 0 -> >0 and emits PostToolUse advisory again.
    writeFileSync(fileA, 'export const a = 2;\n');
    const reEdited = hook('posttooluse', { cwd: root, session_id: 's1', tool_name: 'Edit', tool_input: { path: fileA } });
    assert.equal(reEdited.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(reEdited.hookSpecificOutput.additionalContext, /src\/a\.ts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
