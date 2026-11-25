import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAntigravityHook } from '../src/hooks-antigravity.mjs';
import { ImpactState } from '../src/impact-state.mjs';

const hookModuleUrl = pathToFileURL(fileURLToPath(new URL('../src/hooks-antigravity.mjs', import.meta.url))).href;
const SESSION = 'dca893d7-4f3d-4118-bc60-d96bfe9b4d84';

function makeTempDir(prefix = 'ddg-ag-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function initWorkspace(dir, config = { documentation: { root: 'docs' } }) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'dotdotgod.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.ts'), 'export const a = 1;\n');
  writeFileSync(join(dir, 'src/b.ts'), 'export const b = 2;\n');
  return dir;
}

test('AG-01: never falls back to process.cwd(), isolates uninitialized repos, rejects invalid sessions, enforces segment boundaries', (t) => {
  const base = makeTempDir('ddg-ag01-');
  t.after(() => rmSync(base, { recursive: true, force: true }));

  const parentInit = initWorkspace(join(base, 'parent'));
  const uninitChild = join(parentInit, 'uninit-child');
  mkdirSync(join(uninitChild, 'src'), { recursive: true });
  writeFileSync(join(uninitChild, 'src/x.ts'), 'export const x = 1;\n');

  // 1. Missing workspacePaths and cwd must NEVER fall back to process.cwd() (even though repo cwd is initialized).
  const noWsOut = runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    toolCall: { name: 'write_file', args: { Path: 'src/a.ts' } },
    error: '',
  });
  assert.deepEqual(noWsOut, {});
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION }), {});

  // 2. Uninitialized workspace in workspacePaths creates no .dotdotgod/ and does not walk up to parentInit.
  const uninitOut = runAntigravityHook('posttooluse', {
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
    assert.deepEqual(runAntigravityHook('posttooluse', {
      conversationId: badId,
      workspacePaths: [ws],
      toolCall: { name: 'write_file', args: { Path: join(ws, 'src/a.ts') } },
      error: '',
    }), {});
  }
  assert.equal(existsSync(join(ws, '.dotdotgod')), false);

  // 4. Segment boundary: sibling /app-v2 must not match /app.
  const sibling = initWorkspace(join(base, 'app-v2'));
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'write_file', args: { Path: join(sibling, 'src/a.ts') } },
    error: '',
  });
  assert.equal(new ImpactState(ws, SESSION).status().count, 0);
  assert.equal(existsSync(join(sibling, '.dotdotgod')), false);

  // 5. Fallback to findInitializedRoot(input.cwd) when workspacePaths is omitted.
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    cwd: join(ws, 'src'),
    toolCall: { name: 'edit_file', args: { path: 'b.ts' } },
    error: '',
  });
  assert.deepEqual(new ImpactState(ws, SESSION).status().pending, [{ path: 'src/b.ts' }]);
});

test('AG-02: CLI + App/IDE edit tools, PreInvocation 1-time claim & re-edit reset, MCP allowlist & failure retention, error masking', (t) => {
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
    assert.deepEqual(runAntigravityHook('posttooluse', {
      conversationId: SESSION,
      workspacePaths: [ws],
      toolCall,
      error: '',
    }), {});
  }
  assert.equal(new ImpactState(ws, SESSION).status().count, 5);

  // PreInvocation emits 1-time injectSteps via claimUnnotified
  const firstPre = runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(firstPre.injectSteps?.length, 1);
  const text = firstPre.injectSteps[0].systemMessage.systemMessage;
  assert.match(text, /\[DOTDOTGOD IMPACT PENDING — ADVISORY\]/);
  assert.match(text, /does not block/);
  assert.match(text, /src\/a\.ts/);
  assert.match(text, /src\/e\.ts/);

  // Second PreInvocation returns {} (no duplicate trajectory spam)
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Failed edit with isError: true (no top-level error) must NOT mark or reset
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'edit_file', args: { Path: join(ws, 'src/a.ts') } },
    isError: true,
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Successful re-edit resets notified = 0 -> next PreInvocation re-notifies
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: { name: 'edit_file', args: { Path: join(ws, 'src/a.ts') } },
    error: '',
  });
  const rePre = runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(rePre.injectSteps?.length, 1);
  assert.match(rePre.injectSteps[0].systemMessage.systemMessage, /src\/a\.ts/);

  // Failed project_impact (isError: true WITHOUT top-level error, and top-level error) MUST retain pending
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    toolCall: {
      name: 'call_mcp_tool',
      args: { ServerName: 'dotdotgod_context', ToolName: 'project_impact', Arguments: { paths: ['src/a.ts'] } },
    },
    isError: true,
  });
  runAntigravityHook('posttooluse', {
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
    runAntigravityHook('posttooluse', { conversationId: SESSION, workspacePaths: [ws], toolCall, error: '' });
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
    assert.deepEqual(runAntigravityHook('posttooluse', {
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
  const script = `import { hookMain } from ${JSON.stringify(hookModuleUrl)}; hookMain('preinvocation');`;
  const captured = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `
      import { spawnSync } from 'node:child_process';
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(script)}], {
        input: ${JSON.stringify(payload)},
        env: { ...process.env, HOME: ${JSON.stringify(fakeHome)} },
        encoding: 'utf8',
      });
      process.stdout.write(JSON.stringify({ status: r.status, stdout: r.stdout, stderr: r.stderr }));
    `],
    { encoding: 'utf8' },
  );
  const res = JSON.parse(captured);
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '{}\n');
  assert.equal(res.stdout.includes(fakeHome), false);
  assert.equal(res.stderr.includes(fakeHome), false);
  assert.equal(res.stderr.trim().split('\n').length, 1);
  assert.ok(res.stderr.trim().length <= 240);
});

test('AG-03: C-2 /plan trigger, negative vectors, 2 MiB boundary, symlink/dir/FIFO guards, DB privacy, workspace plan clear', (t) => {
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
    assert.deepEqual(runAntigravityHook('posttooluse', {
      conversationId: SESSION,
      workspacePaths: [ws],
      artifactDirectoryPath: artDir,
      toolCall,
      error: '',
    }), {});
  }
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Workspace implementation_plan.md is a normal workspace edit, NOT a C-2 plan sync notice
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: join(ws, 'implementation_plan.md') } },
    error: '',
  });
  const wsPlanPre = runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(wsPlanPre.injectSteps?.length, 1);
  assert.match(wsPlanPre.injectSteps[0].systemMessage.systemMessage, /\[DOTDOTGOD IMPACT PENDING — ADVISORY\]/);
  assert.doesNotMatch(wsPlanPre.injectSteps[0].systemMessage.systemMessage, /PLAN SYNC/);
  new ImpactState(ws, SESSION).clearPaths(['implementation_plan.md']);

  // Valid C-2 write trigger on exact <artifactDirectoryPath>/implementation_plan.md
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.equal(existsSync(join(ws, 'knowledge/plan')), false, 'hook must never write workspace files');

  const pre1 = runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
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
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'edit_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Updated save DOES re-notify, and writing <docRoot>/plan/**/*.md clears it without marking impact
  writeFileSync(planFile, '# Plan v2\n');
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_to_file', args: { TargetFile: planFile } },
    error: '',
  });
  mkdirSync(join(ws, 'knowledge/plan/task-1'), { recursive: true });
  writeFileSync(join(ws, 'knowledge/plan/task-1/README.MD'), '# Saved plan\n');
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: join(ws, 'knowledge/plan/task-1/README.MD') } },
    error: '',
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
  assert.equal(new ImpactState(ws, SESSION).status().count, 0);

  // Size boundary: exact 2 MiB passes; 2 MiB + 1B rejects
  const exact2MiB = Buffer.alloc(2 * 1024 * 1024, 0x61);
  writeFileSync(planFile, exact2MiB);
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  const pre2MiB = runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] });
  assert.equal(pre2MiB.injectSteps?.length, 1);

  const over2MiB = Buffer.alloc(2 * 1024 * 1024 + 1, 0x62);
  writeFileSync(planFile, over2MiB);
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Symlink rejected
  const outsideTarget = join(base, 'outside.md');
  writeFileSync(outsideTarget, '# Secret\n');
  rmSync(planFile, { force: true });
  symlinkSync(outsideTarget, planFile);
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});

  // Directory rejected
  rmSync(planFile, { force: true });
  mkdirSync(planFile);
  runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: planFile } },
    error: '',
  });
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
});

test('AG-03 (POSIX): FIFO at artifact implementation_plan.md is rejected non-blocking in < 1s', { skip: process.platform === 'win32' }, (t) => {
  const base = makeTempDir('ddg-ag03-fifo-');
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const ws = initWorkspace(join(base, 'repo'));
  const artDir = join(base, 'artifacts');
  mkdirSync(artDir, { recursive: true });
  const fifoPath = join(artDir, 'implementation_plan.md');
  execFileSync('mkfifo', [fifoPath]);

  const started = Date.now();
  const out = runAntigravityHook('posttooluse', {
    conversationId: SESSION,
    workspacePaths: [ws],
    artifactDirectoryPath: artDir,
    toolCall: { name: 'write_file', args: { Path: fifoPath } },
    error: '',
  });
  const elapsedMs = Date.now() - started;

  assert.deepEqual(out, {});
  assert.ok(elapsedMs < 1000, `FIFO check took ${elapsedMs}ms (expected < 1000ms)`);
  assert.deepEqual(runAntigravityHook('preinvocation', { conversationId: SESSION, workspacePaths: [ws] }), {});
});
