import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAntigravityHook } from '../../src/context/hooks-antigravity.mjs';
import { ImpactState } from '../../src/context/impact-state.mjs';

const hookModuleUrl = pathToFileURL(fileURLToPath(new URL('../../src/context/hooks-antigravity.mjs', import.meta.url))).href;
const SESSION = 'dca893d7-4f3d-4118-bc60-d96bfe9b4d84';

function makeTempDir(prefix = 'ddg-ag-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function initWorkspace(dir, config = { documentation: { root: 'docs' } }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'dotdotgod.config.json'), `${JSON.stringify({ decision: { mode: 'advisory' }, ...config }, null, 2)}\n`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src/b.ts'), 'export const b = 2;\n');
  return dir;
}

test('AG-01: never falls back to process.cwd(), isolates uninitialized repos, rejects invalid sessions, enforces segment boundaries', async (t) => {
  const base = makeTempDir('ddg-ag01-');
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const parentInit = initWorkspace(join(base, 'parent'));
  const uninitChild = join(parentInit, 'uninit-child');
  mkdirSync(join(uninitChild, 'src'), { recursive: true });
  writeFileSync(join(uninitChild, 'src/x.ts'), 'export const x = 1;\n');

  // 1. Missing workspacePaths and cwd must NEVER fall back to process.cwd() (even though repo cwd is initialized).
  const noWsOut = await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    toolCall: { name: 'write_file', args: { Path: 'src/a.ts' } },
    error: '',
  });
  assert.deepEqual(noWsOut, {});
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION }), {});

  // 2. Uninitialized workspace in workspacePaths creates no .dotdotgod/ and does not walk up to parentInit.
  const uninitOut = await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [uninitChild],
    cwd: uninitChild,
    toolCall: { name: 'write_file', args: { Path: join(uninitChild, 'src/x.ts') } },
    error: '',
  });
  assert.deepEqual(uninitOut, {});
  assert.equal(existsSync(join(uninitChild, '.dotdotgod')), false);
  assert.equal(existsSync(join(parentInit, '.dotdotgod')), false);

  // 3. Invalid conversationId returns {} and never creates DB.
  const ws = initWorkspace(join(base, 'app'));
  for (const badId of ['', undefined, '../evil', 'a'.repeat(129), 12345]) {
    assert.deepEqual(await runAntigravityHook('posttooluse', {
      conversationId: badId,
      workspacePaths: [ws],
      toolCall: { name: 'write_file', args: { Path: join(ws, 'src/a.ts') } },
      error: '',
    }), {});
  }
  assert.equal(existsSync(join(ws, '.dotdotgod')), false);

  // 4. Segment boundary: sibling /app-v2 must not match /app.
  const sibling = initWorkspace(join(base, 'app-v2'));
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'write_file', args: { Path: join(sibling, 'src/a.ts') } },
    error: '',
  });
  assert.equal(new ImpactState(ws, SESSION).status().count, 0);
  assert.equal(existsSync(join(sibling, '.dotdotgod')), false);

  // 5. Fallback to findInitializedRoot(input.cwd) when workspacePaths is omitted.
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    cwd: join(ws, 'src'),
    toolCall: { name: 'edit_file', args: { path: 'b.ts' } },
    error: '',
  });
  assert.deepEqual(new ImpactState(ws, SESSION).status().pending, [{ path: 'src/b.ts' }]);
});

test('AG-02: CLI + App/IDE edit tools, PreInvocation 1-time claim & re-edit reset, MCP allowlist & failure retention, error masking', async (t) => {
  const base = makeTempDir('ddg-ag02-');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ws = initWorkspace(join(base, 'repo'));
  writeFileSync(join(ws, 'src/c.ts'), 'export const c = 3;\n');
  writeFileSync(join(ws, 'src/d.ts'), 'export const d = 4;\n');
  writeFileSync(join(ws, 'src/e.ts'), 'export const e = 5;\n');

  // CLI tools (Path) + App/IDE tools (TargetFile)
  const edits = [
    { name: 'write_file', args: { Path: join(ws, 'src/a.ts') } },
    { name: 'edit_file', args: { Path: join(ws, 'src/b.ts') } },
    { name: 'write_to_file', args: { TargetFile: join(ws, 'src/c.ts') } },
    { name: 'replace_file_content', args: { TargetFile: join(ws, 'src/d.ts') } },
    { name: 'multi_replace_file_content', args: { TargetFile: join(ws, 'src/e.ts') } },
  ];
  for (const toolCall of edits) {
    assert.deepEqual(await runAntigravityHook('posttooluse', {
      conversationId: SESSION,
      workspacePaths: [ws],
      toolCall,
      error: '',
    }), {});
  }
  assert.equal(new ImpactState(ws, SESSION).status().count, 5);

  // PreInvocation emits 1-time injectSteps via claimUnnotified
  const firstPre = await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(firstPre.injectSteps?.length, 1);
  const text = firstPre.injectSteps[0].systemMessage.systemMessage;
  assert.match(text, /\[DOTDOTGOD IMPACT PENDING — ADVISORY\]/);
  assert.match(text, /does not block/);
  assert.match(text, /src\/a\.ts/);
  assert.match(text, /src\/e\.ts/);

  // Second PreInvocation returns {} (no duplicate trajectory spam)
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Failed edit with isError: true (no top-level error) must NOT mark or reset
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'edit_file', args: { Path: join(ws, 'src/a.ts') } },
    isError: true,
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Successful re-edit resets notified = 0 -> next PreInvocation re-notifies
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'edit_file', args: { Path: join(ws, 'src/a.ts') } },
    error: '',
  });
  const rePre = await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(rePre.injectSteps?.length, 1);
  assert.match(rePre.injectSteps[0].systemMessage.systemMessage, /src\/a\.ts/);

  // Failed project_impact (isError: true WITHOUT top-level error, and top-level error) MUST retain pending
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: {
      name: 'call_mcp_tool',
      args: { ServerName: 'dotdotgod_context', ToolName: 'project_impact', Arguments: { paths: ['src/a.ts'] } },
    },
    isError: true,
  });
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: {
      name: 'call_mcp_tool',
      args: { ServerName: 'dotdotgod_context', ToolName: 'project_impact', Arguments: { paths: ['src/b.ts'] } },
    },
    error: 'Probe simulated MCP isError failure',
  });
  assert.equal(new ImpactState(ws, SESSION).status().count, 5);

  // Third-party MCP server / prefix MUST be rejected (no clearance)
  for (const toolCall of [
    { name: 'call_mcp_tool', args: { ServerName: 'other_context', ToolName: 'project_impact', Arguments: { paths: ['src/a.ts'] } } },
    { name: 'mcp__other_context__project_impact', args: { paths: ['src/a.ts'] } },
    { name: 'other_context__project_impact', args: { paths: ['src/a.ts'] } },
  ]) {
    await runAntigravityHook('posttooluse', { conversationId: SESSION, workspacePaths: [ws], toolCall, error: '' });
  }
  assert.equal(new ImpactState(ws, SESSION).status().count, 5);

  // Allowed MCP forms clear exact paths: call_mcp_tool (dotdotgod_context & dotdotgod-context) + 3 direct prefixes
  const clearances = [
    { name: 'call_mcp_tool', args: { ServerName: 'dotdotgod_context', ToolName: 'project_impact', Arguments: { paths: ['src/a.ts'] } } },
    { name: 'call_mcp_tool', args: { ServerName: 'dotdotgod-context', ToolName: 'project_impact', Arguments: { paths: ['b.ts'], root: join(ws, 'src') } } },
    { name: 'mcp__dotdotgod_context__project_impact', args: { paths: ['src/c.ts'] } },
    { name: 'dotdotgod_context__project_impact', args: { paths: ['src/d.ts'] } },
    { name: 'mcp__dotdotgod-context__project_impact', args: { paths: ['src/e.ts'] } },
  ];
  for (const toolCall of clearances) {
    assert.deepEqual(await runAntigravityHook('posttooluse', {
      conversationId: SESSION,
      workspacePaths: [ws],
      toolCall,
      error: '',
    }), {});
  }
  assert.equal(new ImpactState(ws, SESSION).status().count, 0);

  // DB error on PreInvocation via hookMain never leaks raw error.message or $HOME in stdout/injectSteps
  const brokenWs = initWorkspace(join(base, 'broken'));
  mkdirSync(join(brokenWs, '.dotdotgod/context/impact.sqlite'), { recursive: true });
  const fakeHome = base;
  const payload = JSON.stringify({ conversationId: SESSION, workspacePaths: [brokenWs] });
  const script = `import { hookMain } from ${JSON.stringify(hookModuleUrl)}; await hookMain('preinvocation');`;
  const res = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], {
    input: payload,
    env: { ...process.env, HOME: fakeHome },
    encoding: 'utf8',
  });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '{}\n');
  assert.equal(res.stdout.includes(fakeHome), false);
  assert.equal(res.stderr.includes(fakeHome), false);
  assert.equal(res.stderr.trim().split('\n').length, 1);
  assert.ok(res.stderr.trim().length <= 240);
});

test('AG-03: C-2 /plan trigger, negative vectors, 2 MiB boundary, symlink/dir/FIFO guards, DB privacy, workspace plan clear', async (t) => {
  const base = makeTempDir('ddg-ag03-');
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const ws = initWorkspace(join(base, 'repo'), { documentation: { root: 'knowledge' } });
  const artDir = join(base, 'artifacts');
  const evilDir = join(base, 'artifacts-evil');
  mkdirSync(join(artDir, 'sub'), { recursive: true });
  mkdirSync(evilDir, { recursive: true });

  const planFile = join(artDir, 'implementation_plan.md');
  writeFileSync(planFile, '# Plan v1\n');
  writeFileSync(join(ws, 'implementation_plan.md'), '# Workspace file\n');
  writeFileSync(join(evilDir, 'implementation_plan.md'), '# Evil sibling\n');
  writeFileSync(join(artDir, 'sub/implementation_plan.md'), '# Nested\n');
  writeFileSync(join(artDir, 'notes.md'), '# Other artifact\n');

  // Negative vectors: Read/read_file/view_file, sibling, nested, other file, workspace implementation_plan.md
  const ignoredCalls = [
    { name: 'Read', args: { Path: planFile } },
    { name: 'read_file', args: { Path: planFile } },
    { name: 'view_file', args: { Path: planFile } },
    { name: 'write_file', args: { Path: join(evilDir, 'implementation_plan.md') } },
    { name: 'write_file', args: { Path: join(artDir, 'sub/implementation_plan.md') } },
    { name: 'write_file', args: { Path: join(artDir, 'notes.md') } },
  ];
  for (const toolCall of ignoredCalls) {
    assert.deepEqual(await runAntigravityHook('posttooluse', {
      conversationId: SESSION,
      workspacePaths: [ws],
      artifactDirectoryPath: artDir,
      toolCall,
      error: '',
    }), {});
  }
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Workspace implementation_plan.md is a normal workspace edit, NOT a C-2 plan sync notice
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: join(ws, 'implementation_plan.md') } },
    error: '',
  });
  const wsPlanPre = await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(wsPlanPre.injectSteps?.length, 1);
  assert.match(wsPlanPre.injectSteps[0].systemMessage.systemMessage, /\[DOTDOTGOD IMPACT PENDING — ADVISORY\]/);
  assert.doesNotMatch(wsPlanPre.injectSteps[0].systemMessage.systemMessage, /PLAN SYNC/);
  new ImpactState(ws, SESSION).clearPaths(['implementation_plan.md']);

  // Valid C-2 write trigger on exact <artifactDirectoryPath>/implementation_plan.md
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.equal(existsSync(join(ws, 'knowledge/plan')), false, 'hook must never write workspace files');

  const pre1 = await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.deepEqual(Object.keys(pre1), ['injectSteps']);
  assert.equal(pre1.injectSteps.length, 1);
  assert.equal('decision' in pre1, false);
  assert.equal('permissionOverrides' in pre1, false);
  assert.equal('overwrite' in pre1, false);
  assert.equal('terminationBehavior' in pre1, false);
  const notice = pre1.injectSteps[0].systemMessage.systemMessage;
  assert.match(notice, /\[DOTDOTGOD PLAN SYNC — ADVISORY\]/);
  assert.match(notice, /knowledge\/plan\/<task-slug>\/README\.md/);
  assert.match(notice, /knowledge\/plan\/README\.md/);

  // DB privacy: plan_notices rows contain no $HOME or artifactDirectoryPath
  const db = new DatabaseSync(join(ws, '.dotdotgod/context/impact.sqlite'));
  try {
    const rows = db.prepare('SELECT * FROM plan_notices').all();
    assert.equal(rows.length, 1);
    const serialized = JSON.stringify(rows);
    assert.equal(serialized.includes(homedir()), false);
    assert.equal(serialized.includes(artDir), false);
  } finally {
    db.close();
  }

  // Unchanged save does NOT re-notify
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'edit_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Updated save DOES re-notify, and writing <docRoot>/plan/**/*.md clears it without marking impact
  writeFileSync(planFile, '# Plan v2\n');
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_to_file', args: { TargetFile: planFile } },
    error: '',
  });
  mkdirSync(join(ws, 'knowledge/plan/task-1'), { recursive: true });
  writeFileSync(join(ws, 'knowledge/plan/task-1/README.MD'), '# Saved plan\n');
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: join(ws, 'knowledge/plan/task-1/README.MD') } },
    error: '',
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
  assert.equal(new ImpactState(ws, SESSION).status().count, 0);

  // Size boundary: exact 2 MiB passes; 2 MiB + 1B rejects
  const exact2MiB = Buffer.alloc(2 * 1024 * 1024, 0x61);
  writeFileSync(planFile, exact2MiB);
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  const pre2MiB = await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(pre2MiB.injectSteps?.length, 1);

  const over2MiB = Buffer.alloc(2 * 1024 * 1024 + 1, 0x62);
  writeFileSync(planFile, over2MiB);
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Symlink rejected
  const outsideTarget = join(base, 'outside.md');
  writeFileSync(outsideTarget, '# Secret\n');
  rmSync(planFile, { force: true });
  symlinkSync(outsideTarget, planFile);
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Directory rejected
  rmSync(planFile, { force: true });
  mkdirSync(planFile);
  await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
});

test('AG-03 (POSIX): FIFO at artifact implementation_plan.md is rejected non-blocking in < 1s', { skip: process.platform === 'win32' }, async (t) => {
  const base = makeTempDir('ddg-ag03-fifo-');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ws = initWorkspace(join(base, 'repo'));
  const artDir = join(base, 'artifacts');
  mkdirSync(artDir, { recursive: true });
  const fifoPath = join(artDir, 'implementation_plan.md');
  execFileSync('mkfifo', [fifoPath]);

  const started = Date.now();
  const out = await runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: fifoPath } },
    error: '',
  });
  const elapsedMs = Date.now() - started;

  assert.deepEqual(out, {});
  assert.ok(elapsedMs < 1000, `FIFO check took ${elapsedMs}ms (expected < 1000ms)`);
  assert.deepEqual(await runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
});

function loadFixture(t) {
  const base = makeTempDir('ddg-ag-load-');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  return {
    base,
    workspace: (name, decision) => initWorkspace(join(base, name), { decision }),
    pre: (workspacePaths, options) => runAntigravityHook('preinvocation', {
      conversationId: SESSION, workspacePaths, lastUserInput: 'Review authentication', ...options,
    }),
  };
}

function decisionMessage(output) {
  assert.deepEqual(Object.keys(output), ['injectSteps']);
  assert.equal(output.injectSteps.length, 1);
  const { systemMessage: { systemMessage } } = output.injectSteps[0];
  assert.ok(Buffer.byteLength(systemMessage) <= 6144);
  return systemMessage;
}

function captureStderr(t) {
  const spy = t.mock.method(process.stderr, 'write', () => true);
  return () => spy.mock.calls.map(({ arguments: [line] }) => line);
}

async function decisionServer(t, handler) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test('AG-04: advisory, manual and invalid config add no trajectory step or load state', async (t) => {
  const { workspace, pre } = loadFixture(t);
  const stderr = captureStderr(t);
  for (const mode of ['advisory', 'manual', 'sk-invalid-secret']) {
    const ws = workspace('repo', { mode });
    assert.deepEqual(await pre([ws]), {});
    assert.equal(existsSync(join(ws, '.dotdotgod')), false);
  }
  assert.deepEqual(stderr(), ['dotdotgod decision: config_invalid\n']);
});

test('AG-04: always injects once, even without lastUserInput; opt-out does not consume state', async (t) => {
  const { workspace, pre } = loadFixture(t);
  const ws = workspace('always', { mode: 'always' });
  const state = new ImpactState(ws, SESSION);
  assert.deepEqual(await pre([ws], { lastUserInput: 'hello /dd:no-load' }), {});
  assert.equal(existsSync(state.path), false);
  assert.match(decisionMessage(await pre([ws], { lastUserInput: undefined })), /Recommended project_load.*baseline/);
  assert.equal(state.getLoadState().notified, true);
  assert.deepEqual(await pre([ws]), {});
});

test('AG-04: unsupported host claims once and only fallback always injects', async (t) => {
  const { workspace, pre } = loadFixture(t);
  const stderr = captureStderr(t);
  for (const [index, fallback] of ['advisory', 'manual', 'always'].entries()) {
    const ws = workspace(fallback, { mode: 'model', provider: 'host', fallback });
    const state = new ImpactState(ws, SESSION);
    assert.deepEqual(await pre([ws], { lastUserInput: undefined }), {});
    assert.equal(existsSync(state.path), false);

    const output = await pre([ws]);
    if (fallback === 'always') assert.match(decisionMessage(output), /Recommended project_load.*baseline/);
    else assert.deepEqual(output, {});
    const claim = state.getLoadState();
    assert.equal(claim.notified, true);
    assert.equal(claim.loaded, false);
    assert.deepEqual(await pre([ws]), {});
    assert.deepEqual(state.getLoadState(), claim);
    assert.deepEqual(stderr(), Array(index + 1).fill('dotdotgod decision: provider_unsupported_on_host\n'));
  }
});

test('AG-05: model skips duplicate prompts and delivers bounded advice/prefetch only in the active workspace', async (t) => {
  const calls = [];
  const ref = 'docs/spec/AUTH.md';
  const baseUrl = await decisionServer(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { model, messages } = JSON.parse(Buffer.concat(chunks));
    const { excerpt } = JSON.parse(messages[1].content);
    calls.push([req.url, model, excerpt]);
    const load = excerpt === 'hello' ? { action: 'skip', focus: '' }
      : model === 'advice' ? { action: 'focused', focus: 'Authentication ' + '한😀'.repeat(1800) }
        : { action: 'full', focus: '' };
    const content = JSON.stringify({ load, refs: model === 'advice' ? [ref] : [], reason: 'private model reasoning' });
    res.end(JSON.stringify(req.url === '/api/chat' ? { message: { content } } : { choices: [{ message: { content } }] }));
  });
  const { base, workspace, pre } = loadFixture(t);
  const adviceWs = workspace('advice', { mode: 'model', model: 'advice', baseUrl, provider: 'ollama' });
  const prefetchWs = workspace('prefetch', { mode: 'model', model: 'prefetch', baseUrl, provider: 'openai-compatible', delivery: 'prefetch' });
  const workspaces = [prefetchWs, adviceWs];
  for (const ws of workspaces) {
    mkdirSync(join(ws, 'docs/spec'), { recursive: true });
    writeFileSync(join(ws, ref), '# Authentication\n');
  }
  const adviceState = new ImpactState(adviceWs, SESSION);
  const prefetchState = new ImpactState(prefetchWs, SESSION);
  assert.deepEqual(await pre(workspaces), {});
  assert.deepEqual(await pre(workspaces, { cwd: base }), {});
  for (const lastUserInput of [undefined, '', '  \n  ']) {
    assert.deepEqual(await pre(workspaces, { cwd: adviceWs, lastUserInput }), {});
  }
  assert.deepEqual(calls, []);
  assert.equal(existsSync(adviceState.path), false);
  assert.equal(existsSync(prefetchState.path), false);

  for (const [ws, state] of [[adviceWs, adviceState], [prefetchWs, prefetchState]]) {
    const active = { cwd: join(ws, 'src') };
    assert.deepEqual(await pre(workspaces, { ...active, lastUserInput: 'hello' }), {});
    assert.deepEqual(await pre(workspaces, { ...active, lastUserInput: 'hello' }), {});
    assert.equal(state.getLoadState().skipCount, 1);

    const message = decisionMessage(await pre(workspaces, { ...active, lastUserInput: 'check authentication' }));
    assert.match(message, /AUTH\.md/);
    assert.doesNotMatch(message, /private model reasoning|\uFFFD/);
    if (ws === adviceWs) {
      assert.match(message, /Recommended project_load focus: "Authentication /);
      assert.ok(Buffer.byteLength(message) > 6100, 'oversized advice should exercise the byte cap');
      assert.equal(existsSync(prefetchState.path), false);
    } else {
      assert.match(message, /instructionAuthority: "none"/);
      assert.match(message, /\n(`{3,})text\n[\s\S]*\n\1$/);
    }
    assert.equal(state.getLoadState().loaded, ws === prefetchWs);
    assert.deepEqual(await pre(workspaces, { ...active, lastUserInput: 'follow up' }), {});
  }
  assert.deepEqual(calls, [
    ['/api/chat', 'advice', 'hello'],
    ['/api/chat', 'advice', 'check authentication'],
    ['/chat/completions', 'prefetch', 'hello'],
    ['/chat/completions', 'prefetch', 'check authentication'],
  ]);

  adviceState.mark(['src/a.ts']);
  prefetchState.recordPlanNotice('pending-plan');
  const { injectSteps } = await pre(workspaces); // Ambiguous for load, not for impact or plan sync.
  assert.equal(injectSteps.length, 2);
  assert.match(injectSteps[0].systemMessage.systemMessage, /PLAN SYNC/);
  assert.match(injectSteps[1].systemMessage.systemMessage, /IMPACT PENDING/);
  assert.deepEqual(await pre(workspaces), {});
});

test('AG-05: short injected budget times out and keeps advisory fallback silent', { timeout: 4000 }, async (t) => {
  let attempts = 0;
  const baseUrl = await decisionServer(t, (_req, res) => {
    attempts++;
    const content = JSON.stringify({ load: { action: 'full', focus: '' }, refs: [], reason: '' });
    const timer = setTimeout(() => res.end(JSON.stringify({ message: { content } })), 1500);
    res.once('close', () => clearTimeout(timer));
  });
  const { workspace, pre } = loadFixture(t);
  const ws = workspace('slow', { mode: 'model', provider: 'ollama', baseUrl, model: 'slow', timeoutMs: 15_000 });
  const stderr = captureStderr(t);
  assert.deepEqual(await pre([ws], { __testBudgetMs: 250 }), {});
  assert.equal(attempts, 1);
  assert.equal(new ImpactState(ws, SESSION).getLoadState().loaded, false);
  assert.deepEqual(stderr(), ['dotdotgod decision: request_timeout\n']);
  assert.deepEqual(await pre([ws]), {});
  assert.equal(attempts, 1);
});

test('AG-06: only successful allowlisted project_load calls mark the selected initialized workspace', async (t) => {
  const { base, workspace, pre } = loadFixture(t);
  const ws = workspace('repo', { mode: 'always' });
  const other = workspace('other', { mode: 'always' });
  const uninitialized = join(base, 'empty');
  mkdirSync(uninitialized);
  const workspaces = [ws, other, uninitialized];
  const wrapper = { name: 'call_mcp_tool', args: { ServerName: 'dotdotgod_context', ToolName: 'project_load', Arguments: { root: ws } } };
  const direct = { name: 'mcp__dotdotgod_context__project_load' };
  const post = (toolCall, options) => runAntigravityHook('posttooluse', {
    conversationId: SESSION, workspacePaths: workspaces, toolCall, ...options,
  });
  await post(wrapper, { toolResponse: { structuredContent: { ok: false } } });
  await post({ ...wrapper, args: { ...wrapper.args, ServerName: 'external_context' } });
  await post({ name: 'mcp__external_context__project_load', args: { root: ws } });
  await post(direct); // Ambiguous: neither root nor cwd is known.
  await post({ ...direct, args: { root: uninitialized } }, { cwd: ws });
  for (const root of workspaces) assert.equal(existsSync(join(root, '.dotdotgod')), false);

  assert.deepEqual(await post(wrapper, { cwd: other }), {});
  assert.equal(new ImpactState(ws, SESSION).getLoadState().loaded, true);
  assert.equal(existsSync(join(other, '.dotdotgod')), false);
  assert.deepEqual(await pre(workspaces, { cwd: ws }), {});

  assert.deepEqual(await post(direct, { toolResponse: { structuredContent: { ok: true, root: other } } }), {});
  assert.equal(new ImpactState(other, SESSION).getLoadState().loaded, true);
  assert.deepEqual(await pre(workspaces, { cwd: other }), {});

  const alias = { name: 'mcp__dotdotgod-context__project_load' };
  assert.deepEqual(await post(alias, { workspacePaths: [other], conversationId: 'another-session' }), {});
  assert.equal(new ImpactState(other, 'another-session').getLoadState().loaded, true);
});

test('AG-06 (F1): uninitialized workspaces stay silent with a global model profile', async (t) => {
  const { base, pre } = loadFixture(t);
  const home = join(base, 'home');
  const ws = join(base, 'uninitialized');
  mkdirSync(join(home, '.dotdotgod'), { recursive: true });
  mkdirSync(ws);
  const previousHome = process.env.HOME;
  process.env.HOME = home;
  t.after(() => { if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome; });
  writeFileSync(join(home, '.dotdotgod/config.json'), JSON.stringify({
    decision: { mode: 'model', provider: 'host', fallback: 'always' },
  }));
  const stderr = captureStderr(t);
  assert.deepEqual(await pre([ws], { cwd: ws }), {});
  assert.deepEqual(stderr(), []);
  assert.equal(existsSync(join(ws, '.dotdotgod')), false);

  mkdirSync(join(ws, '.dotdotgod'));
  assert.match(decisionMessage(await pre([ws], { cwd: ws })), /Recommended project_load.*baseline/);
  assert.deepEqual(stderr(), ['dotdotgod decision: provider_unsupported_on_host\n']);
});
