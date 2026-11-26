import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test, { after } from 'node:test';
import { promisify } from 'node:util';
import {
  extractHookSessionId,
  formatHookError,
  isInitializedProject,
  selectWorkspaceForPath,
} from '../src/hook-state.mjs';
import { ImpactState } from '../src/impact-state.mjs';

const runner = `import { hookMain } from './src/hooks.mjs'; await hookMain(process.argv[1]);`;
const packageRoot = new URL('..', import.meta.url);
const home = mkdtempSync(join(tmpdir(), 'dotdotgod-hooks-home-'));
after(() => rmSync(home, { recursive: true, force: true }));

function hookOptions(extraEnv = {}) {
  const env = { ...process.env, HOME: home, ...extraEnv };
  if (!Object.hasOwn(extraEnv, 'CLAUDE_PROJECT_DIR')) delete env.CLAUDE_PROJECT_DIR;
  return { cwd: packageRoot, encoding: 'utf8', env };
}

function hookArgs(event) {
  return ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', runner, event];
}

function runHookRaw(event, stdinText, extraEnv = {}) {
  return spawnSync(process.execPath, hookArgs(event), { ...hookOptions(extraEnv), input: stdinText });
}

function hook(event, input = {}, extraEnv = {}, stderr = '') {
  const result = runHookRaw(event, JSON.stringify(input), extraEnv);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, stderr);
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
  for (const bad of ['', '   ', 'default', '../evil', 'a/b', 'bad space', 'x'.repeat(129), 123, null, undefined, {}]) {
    assert.equal(extractHookSessionId({ session_id: bad }), null);
    assert.equal(extractHookSessionId({ sessionId: bad }), null);
    assert.equal(extractHookSessionId({ conversationId: bad }), null);
  }
  assert.equal(extractHookSessionId({ session_id: 'sess_ok-1.2~a' }), 'sess_ok-1.2~a');
  assert.equal(extractHookSessionId({ conversationId: 'conv-123' }), 'conv-123');

  const root = initProject('dotdotgod-hk01-');
  try {
    writeFileSync(join(root, 'source.ts'), 'export const x = 1;\n');
    for (const badId of [undefined, '', 'default', '../evil', 'a'.repeat(129)]) {
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

const loadAdvisory = 'Use project_load when repository context would help; skip it for self-contained work.';
const fullAdvice = 'Recommended project_load with no focus to load the baseline documentation map.';

function contextOutput(hookEventName, additionalContext) {
  return { hookSpecificOutput: { hookEventName, additionalContext } };
}

test('HK-06: SessionStart gives mode-specific guidance without opening impact.sqlite', (t) => {
  const root = initProject('dotdotgod-hk06-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [mode, context] of [
    ['advisory', loadAdvisory], ['manual', ''],
    ['always', `[DOTDOTGOD PROJECT MEMORY — ADVICE] ${fullAdvice}`], ['model', ''],
  ]) {
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ decision: { mode, provider: 'host' } }));
    for (const session_id of ['s1', undefined, 'default']) {
      const input = { cwd: root, session_id };
      const expected = context ? contextOutput('SessionStart', context) : {};
      assert.deepEqual(hook('sessionstart', input), expected);
      assert.equal(existsSync(impactDbPath(root)), false);
    }
  }
  mkdirSync(dirname(impactDbPath(root)), { recursive: true });
  writeFileSync(impactDbPath(root), 'not a SQLite database');
  assert.deepEqual(hook('sessionstart', { cwd: root, session_id: 's1' }), {});
  assert.equal(readFileSync(impactDbPath(root), 'utf8'), 'not a SQLite database');
});

test('HK-07: UserPromptSubmit triages skip then advice or read-only prefetch with a loopback model', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { excerpt } = JSON.parse(JSON.parse(Buffer.concat(chunks)).messages[1].content);
    requests.push(excerpt);
    const load = excerpt === 'hello' ? { action: 'skip', focus: '' } : { action: 'focused', focus: 'Authentication' };
    const content = JSON.stringify({ load, refs: ['docs/spec/AUTH.md'], reason: 'DO NOT INJECT THIS' });
    res.end(JSON.stringify({ message: { content } }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });

  const root = initProject('dotdotgod-hk07-');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'docs/spec'), { recursive: true });
  writeFileSync(join(root, 'docs/spec/AUTH.md'), '# Authentication\nShared auth contract.');
  const run = promisify(execFile);
  async function submit(session_id, fields) {
    const pending = run(process.execPath, hookArgs('userpromptsubmit'), { ...hookOptions(), timeout: 25_000 });
    pending.child.stdin.end(JSON.stringify({ cwd: root, session_id, ...fields }));
    const { stdout, stderr } = await pending;
    assert.equal(stderr, '');
    return JSON.parse(stdout);
  }
  for (const delivery of ['advice', 'prefetch']) {
    const decision = { mode: 'model', provider: 'ollama', model: 'stub', baseUrl: `http://127.0.0.1:${server.address().port}`, delivery };
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ decision }));
    const state = new ImpactState(root, delivery);
    assert.deepEqual(await submit(delivery, { prompt: 'hello', user_prompt: 'ignored' }), {});
    assert.deepEqual(await submit(delivery, { user_prompt: 'hello' }), {});
    assert.equal(state.getLoadState().skipCount, 1);
    if (delivery === 'advice') state.mark(['docs/spec/AUTH.md']);
    const { hookSpecificOutput } = await submit(delivery, { message: 'Check auth' });
    const { additionalContext } = hookSpecificOutput;
    assert.equal(hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.doesNotMatch(additionalContext, /DO NOT INJECT THIS/);
    assert.match(additionalContext, /docs\/spec\/AUTH\.md/);
    if (delivery === 'advice') {
      assert.match(additionalContext, /Recommended project_load focus: "Authentication"/);
      assert.match(additionalContext, /DOTDOTGOD IMPACT PENDING/);
    } else {
      assert.match(additionalContext, /PROJECT MEMORY PREFETCH.*instructionAuthority: "none"/);
      assert.match(additionalContext, /\n(`{3,})text\n[\s\S]*\n\1$/);
      assert.ok(Buffer.byteLength(additionalContext) <= 8192);
      assert.deepEqual(await submit(delivery, { prompt: 'another request' }), {});
    }
    assert.equal(state.getLoadState().loaded, delivery === 'prefetch');
  }
  assert.deepEqual(requests, ['hello', 'Check auth', 'hello', 'Check auth']);
});

test('HK-08: UserPromptSubmit mode always gives full advice once and respects explicit load controls', (t) => {
  const root = initProject('dotdotgod-hk08-', { decision: { mode: 'always' } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { cwd: root, session_id: 's1', prompt: 'Work on this project' };
  assert.deepEqual(hook('userpromptsubmit', { ...input, prompt: '/dd:no-load' }), {});
  assert.equal(existsSync(impactDbPath(root)), false);
  assert.deepEqual(hook('userpromptsubmit', input), contextOutput('UserPromptSubmit', `[DOTDOTGOD PROJECT MEMORY — ADVICE]\n${fullAdvice}`));
  assert.deepEqual(hook('userpromptsubmit', input), {});
  for (const mode of ['advisory', 'manual']) {
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ decision: { mode } }));
    assert.deepEqual(hook('userpromptsubmit', { ...input, session_id: mode, prompt: '/dd:load auth' }), {});
    assert.equal(new ImpactState(root, mode).getLoadState().loaded, true);
  }
});

test('HK-09: non-host model falls back and logs provider_unsupported_on_host once per session', (t) => {
  const root = initProject('dotdotgod-hk09-', { decision: { mode: 'model', provider: 'host' } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { cwd: root, session_id: 's1', prompt: 'Check auth' };
  const warning = 'dotdotgod decision: provider_unsupported_on_host\n';
  assert.deepEqual(hook('userpromptsubmit', input, {}, warning), contextOutput('UserPromptSubmit', loadAdvisory));
  assert.equal(new ImpactState(root, 's1').getLoadState().notified, true);
  assert.deepEqual(hook('userpromptsubmit', { ...input, prompt: 'Check another feature' }), {});
});

test('HK-10: invalid project config fails open without falling through to global model; uninitialized stays silent', (t) => {
  const isolatedHome = mkdtempSync(join(tmpdir(), 'dotdotgod-hk10-home-'));
  const root = initProject('dotdotgod-hk10-');
  const uninit = mkdtempSync(join(tmpdir(), 'dotdotgod-hk10-uninit-'));
  t.after(() => [isolatedHome, root, uninit].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  mkdirSync(join(isolatedHome, '.dotdotgod'));
  writeFileSync(join(isolatedHome, '.dotdotgod/config.json'), JSON.stringify({ decision: { mode: 'model', provider: 'host' } }));
  writeFileSync(join(root, 'dotdotgod.config.json'), '{"decision":{"apiKey":"sk-invalid-sentinel"');
  const env = { HOME: isolatedHome };
  const base = { session_id: 's1', prompt: 'Check auth' };
  for (const event of ['SessionStart', 'UserPromptSubmit']) {
    assert.deepEqual(hook(event, { ...base, cwd: root }, env, 'dotdotgod decision: config_invalid\n'), contextOutput(event, loadAdvisory));
    assert.deepEqual(hook(event, { ...base, cwd: uninit }, env), {});
  }
  assert.equal(existsSync(impactDbPath(root)), false);
  assert.equal(existsSync(impactDbPath(uninit)), false);
});

test('HK-11: PostToolUse marks only successful allowlisted project_load calls as loaded', (t) => {
  const root = initProject('dotdotgod-hk11-', { decision: { mode: 'model', provider: 'host' } });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = { cwd: root, session_id: 's1', tool_name: 'mcp__dotdotgod_context__project_load' };
  const state = new ImpactState(root, 's1');
  assert.deepEqual(hook('posttooluse', { ...input, tool_response: { structuredContent: { ok: false } } }), {});
  assert.deepEqual(hook('posttooluse', { ...input, tool_name: 'mcp__other_server__project_load' }), {});
  assert.equal(state.getLoadState().loaded, false);
  assert.equal(existsSync(impactDbPath(root)), false);
  assert.deepEqual(hook('posttooluse', { ...input, tool_response: { structuredContent: { ok: true } } }), {});
  assert.equal(state.getLoadState().loaded, true);
  assert.deepEqual(hook('userpromptsubmit', { cwd: root, session_id: 's1', prompt: 'Check auth' }), {});
});
