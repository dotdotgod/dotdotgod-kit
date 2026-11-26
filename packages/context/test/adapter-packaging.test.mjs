import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const expectedTools = [
  'execute', 'execute_file', 'index', 'search', 'fetch_and_index',
  'session_resume', 'ingestion_job_start', 'ingestion_job_status', 'ingestion_job_cancel',
  'context_heal', 'stats', 'doctor', 'purge', 'project_load',
  'embedding_status', 'embedding_install',
  'project_impact', 'project_initialize',
  'impact_status',
];
const blockedCommands = ['npm', 'npx', 'pnpm', 'yarn', 'bun', 'curl', 'wget'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

function isolatedEnvironment(root, project, stubBin) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(NODE_PATH|NODE_OPTIONS|npm_|NPM_|pnpm_|PNPM_|YARN_|BUN_|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/u.test(name)) delete env[name];
  }
  return {
    ...env,
    HOME: join(root, 'home'),
    PATH: `${stubBin}${delimiter}${env.PATH ?? ''}`,
    npm_config_offline: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
    DOTDOTGOD_PROJECT_ROOT: project,
    CLAUDE_PROJECT_DIR: project,
  };
}

function createNetworkStubs(root) {
  const bin = join(root, 'blocked-bin');
  mkdirSync(bin, { recursive: true });
  for (const command of blockedCommands) {
    const path = join(bin, command);
    writeFileSync(path, `#!/bin/sh\necho "unexpected runtime command: ${command}" >&2\nexit 97\n`);
    chmodSync(path, 0o755);
  }
  return bin;
}

function walk(root, visit, directory = root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    visit(path, entry);
    if (entry.isDirectory()) walk(root, visit, path);
  }
}

function auditExtractedPackage(packageRoot) {
  const canonicalRoot = realpathSync(packageRoot);
  const checkout = realpathSync(workspace);
  walk(packageRoot, (path, entry) => {
    if (entry.isSymbolicLink()) {
      const target = readlinkSync(path);
      assert.equal(isAbsolute(target), false, `absolute symlink in packed adapter: ${relative(packageRoot, path)} -> ${target}`);
      assert.equal(existsSync(path), true, `broken symlink in packed adapter: ${relative(packageRoot, path)} -> ${target}`);
      const resolved = realpathSync(path);
      assert.ok(resolved === canonicalRoot || resolved.startsWith(`${canonicalRoot}${sep}`), `escaping symlink in packed adapter: ${relative(packageRoot, path)} -> ${resolved}`);
    }
    if (!entry.isFile()) return;
    const relativePath = relative(packageRoot, path);
    if (!(relativePath.endsWith('package.json') || relativePath.endsWith('.map') || relativePath.endsWith('.mjs') || relativePath.endsWith('.js'))) return;
    if (statSync(path).size > 20 * 1024 * 1024 && !relativePath.endsWith('.map')) return;
    const text = readFileSync(path, 'utf8');
    assert.equal(text.includes(checkout), false, `packed file leaks checkout path: ${relativePath}`);
    if (relativePath.endsWith('package.json')) assert.doesNotMatch(text, /"(?:file|link):[^"\n]+"/u, `local dependency in ${relativePath}`);
    if (relativePath.endsWith('.map')) assert.doesNotMatch(text, /(?:\.\.\/){3,}|\/Users\/|\/home\/|[A-Za-z]:\\/u, `source map leaks workspace paths: ${relativePath}`);
  });
}

function assertNoAncestorNodeModules(path) {
  for (let current = resolve(path); ; current = dirname(current)) {
    assert.equal(existsSync(join(current, 'node_modules')), false, `isolation ancestor contains node_modules: ${current}`);
    const parent = dirname(current);
    if (parent === current) break;
  }
}

function packAndExtract(adapter, root) {
  const destination = join(root, 'pack');
  const extraction = join(root, 'extracted');
  mkdirSync(destination, { recursive: true });
  mkdirSync(extraction, { recursive: true });
  const packed = run('pnpm', ['--dir', join(workspace, 'packages', adapter), 'pack', '--pack-destination', destination], { cwd: workspace });
  assert.equal(packed.status, 0, `pnpm pack failed for ${adapter}:\n${packed.stdout}\n${packed.stderr}`);
  const tarballs = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
  assert.equal(tarballs.length, 1, `expected one ${adapter} tarball, found ${tarballs.join(', ')}`);
  const tarball = join(destination, tarballs[0]);
  const extracted = run('tar', ['-xzf', tarball, '-C', extraction], { cwd: root });
  assert.equal(extracted.status, 0, `tar extraction failed for ${adapter}: ${extracted.stderr}`);
  const packageRoot = join(extraction, 'package');
  assert.equal(existsSync(packageRoot), true);
  return { packageRoot, tarball };
}

function runHook(runtime, event, input, options) {
  return run(process.execPath, [runtime, event], { ...options, input });
}

const execFileAsync = promisify(execFile);
const prefetchFocus = 'packaged triage keyword';

async function configurePrefetch(t, project) {
  const requests = [];
  const content = JSON.stringify({ load: { action: 'focused', focus: prefetchFocus }, refs: [], reason: 'test' });
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));

  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(join(project, 'docs', 'PREFETCH.md'), '# Prefetch fixture\n\nPackaged triage keyword fixture.\n');
  writeFileSync(join(project, 'dotdotgod.config.json'), JSON.stringify({
    version: 1, documentation: { root: 'docs' },
    decision: { mode: 'model', delivery: 'prefetch', provider: 'openai-compatible', model: 'stub', baseUrl: `http://127.0.0.1:${server.address().port}` },
  }));
  return requests;
}

async function runPackedAsync(args, input, options) {
  const result = execFileAsync(process.execPath, args, { ...options, timeout: 30_000 });
  result.child.stdin.end(JSON.stringify(input));
  const { stdout, stderr } = await result;
  assert.doesNotMatch(stderr, /dotdotgod decision:|dotdotgod hook error:/u);
  return JSON.parse(stdout);
}

function assertPrefetch(text, requests) {
  assert.deepEqual(requests, ['POST /chat/completions']);
  assert.match(text, /PREFETCH — UNTRUSTED DATA/u);
  assert.match(text, /Packaged triage keyword fixture\./u);
}

function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function assertClaudeMcpHookMatchers(packageRoot) {
  const config = JSON.parse(readFileSync(join(packageRoot, 'hooks', 'hooks.json'), 'utf8'));
  const pluginQualifiedImpact = 'mcp__plugin_dotdotgod_dotdotgod-context__project_impact';
  assert.equal(config.hooks.PreToolUse, undefined, 'PreToolUse must be removed for advisory impact');
  assert.ok(Array.isArray(config.hooks.UserPromptSubmit) && config.hooks.UserPromptSubmit.length > 0, 'UserPromptSubmit must be configured');
  const matcher = config.hooks.PostToolUse?.[0]?.matcher;
  assert.equal(typeof matcher, 'string', 'PostToolUse must declare a matcher');
  assert.match(matcher, /(?:^|\|)mcp__\.\*(?:\||$)/u, 'PostToolUse must use Claude\'s documented MCP wildcard form');
  assert.equal(new RegExp(matcher, 'u').test(pluginQualifiedImpact), true, 'PostToolUse must dispatch plugin-qualified impact tools');
}

for (const adapter of ['claude-code', 'codex']) {
  test(`${adapter} packed adapter is a standalone advisory hook and MCP runtime`, { timeout: 90_000 }, async (t) => {
    const root = mkdtempSync(join(tmpdir(), `dotdotgod-packed-${adapter}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'dotdotgod.config.json'), JSON.stringify({ version: 1, documentation: { root: 'docs' } }));
    mkdirSync(join(project, 'docs'));
    writeFileSync(join(project, 'docs', 'README.md'), '# Project docs\n\nPackaged focused Load fixture.\n');
    mkdirSync(join(project, 'src'));
    writeFileSync(join(project, 'src', 'service.ts'), '/** Packaged focused project memory. */\nexport class Service {\n/** Packaged focused project memory. */\nrun() { return "implementation_only_marker"; }\n}\n');
    mkdirSync(join(root, 'home'));
    const stubBin = createNetworkStubs(root);
    const env = isolatedEnvironment(root, project, stubBin);
    const { packageRoot, tarball } = packAndExtract(adapter, root);
    assertNoAncestorNodeModules(packageRoot);
    auditExtractedPackage(packageRoot);
    const packedManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(packedManifest.engines.node, '>=22.5.0');
    if (adapter === 'claude-code') assertClaudeMcpHookMatchers(packageRoot);
    else {
      const codexHooks = JSON.parse(readFileSync(join(packageRoot, 'hooks', 'hooks.json'), 'utf8'));
      assert.equal(codexHooks.hooks.PreToolUse, undefined, 'codex PreToolUse must be removed');
      assert.ok(Array.isArray(codexHooks.hooks.UserPromptSubmit) && codexHooks.hooks.UserPromptSubmit.length > 0);
    }

    const runtime = join(packageRoot, 'hooks', 'runtime.mjs');
    const sessionInput = JSON.stringify({ cwd: project, session_id: `packed-${adapter}` });
    const started = runHook(runtime, 'sessionstart', sessionInput, { cwd: project, env });
    assert.equal(started.status, 0, started.stderr);
    assert.doesNotMatch(started.stderr, /ERR_MODULE_NOT_FOUND|package_json_reader/u);
    const lines = started.stdout.trim().split('\n');
    assert.equal(lines.length, 1, `hook must emit one JSON line: ${started.stdout}`);
    const hookOutput = JSON.parse(lines[0]);
    assert.equal(hookOutput.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(hookOutput.hookSpecificOutput.additionalContext, /project_load/u);
    assert.doesNotMatch(hookOutput.hookSpecificOutput.additionalContext, /must|required|before substantive/iu);
    assert.equal(existsSync(join(project, '.dotdotgod', 'context', 'runtime', `packed-${adapter}.json`)), false);
    const substantive = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Bash', tool_input: { command: 'git status --short' } });
    for (const tool_name of ['Bash', 'Edit', 'Write']) {
      const unloaded = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name, tool_input: { command: 'git status --short', file_path: 'source.ts' } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'pretooluse', unloaded, { cwd: project, env }).stdout), {});
    }

    const malformed = runHook(runtime, 'sessionstart', '{bad json', { cwd: project, env });
    assert.equal(malformed.status, 0);
    assert.equal(malformed.stdout, '{}\n');
    assert.match(malformed.stderr, /dotdotgod hook error:/u);
    assert.doesNotMatch(malformed.stderr, /ERR_MODULE_NOT_FOUND|package_json_reader|\n\s+at\s/u);

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(packageRoot, 'mcp', 'server.mjs')],
      cwd: project,
      env,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'packed-adapter-test', version: '1.0.0' });
    try {
      await withTimeout(client.connect(transport), 10_000, `${adapter} MCP initialize`);
      const listed = await withTimeout(client.listTools(), 10_000, `${adapter} MCP listTools`);
      assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...expectedTools].sort());
      const failed = await withTimeout(client.callTool({
        name: 'project_load',
        arguments: { root: '.', focus: 'x'.repeat(501), limit: 3, maxDepth: 2 },
      }), 10_000, `${adapter} rejected project load`);
      assert.equal(failed.isError, true);
      assert.deepEqual(JSON.parse(runHook(runtime, 'pretooluse', substantive, { cwd: project, env }).stdout), {});

      const unrelatedMcp = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'mcp__plugin_other_server__unrelated_tool', tool_input: {} });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', unrelatedMcp, { cwd: project, env }).stdout), {});

      const loaded = await withTimeout(client.callTool({
        name: 'project_load',
        arguments: { root: '.', focus: 'packaged focused project memory', limit: 3, maxDepth: 2 },
      }), 10_000, `${adapter} focused project load`);
      assert.equal(loaded.isError, undefined, JSON.stringify(loaded.structuredContent));
      assert.equal(loaded.structuredContent.ok, true);
      assert.equal(loaded.structuredContent.documentationRoot, 'docs');
      assert.match(loaded.structuredContent.documentationTree.join('\n'), /^docs\/\n  - README.md/m);
      assert.equal(loaded.structuredContent.query.ok, true);
      assert.ok(loaded.structuredContent.query.results.some((result) => result.path === 'docs/README.md' && result.kind === 'document'));
      assert.ok(loaded.structuredContent.query.results.some((result) => result.kind === 'symbol' && result.path === 'src/service.ts'));
      assert.ok(!JSON.stringify(loaded.structuredContent.query.results).includes('implementation_only_marker'));
      assert.equal(loaded.structuredContent.vectorUnavailable, undefined);
      assert.equal(loaded.structuredContent.query.embeddingSource, 'not-used');
      assert.equal(loaded.structuredContent.query.provider, null);
      assert.deepEqual(loaded.structuredContent.query.warnings, []);
      const serializedLoad = JSON.stringify(loaded);
      assert.doesNotMatch(serializedLoad, /ERR_MODULE_NOT_FOUND|plugins\/cache|package_json_reader/u);

      const changedPath = join(project, 'docs', 'README.md');
      const completedWrite = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Write', tool_input: { file_path: changedPath } });
      const writeOut = JSON.parse(runHook(runtime, 'posttooluse', completedWrite, { cwd: project, env }).stdout);
      assert.equal(writeOut.hookSpecificOutput.hookEventName, 'PostToolUse');
      assert.match(writeOut.hookSpecificOutput.additionalContext, /does not block/);
      assert.equal(existsSync(join(project, '.dotdotgod', 'context', 'impact.sqlite')), true);
      assert.equal(existsSync(join(project, '.dotdotgod', 'context', 'runtime')), false);

      const broadVerification = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Bash', tool_input: { command: 'pnpm run verify' } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'pretooluse', broadVerification, { cwd: project, env }).stdout), {});

      const promptOut = JSON.parse(runHook(runtime, 'userpromptsubmit', sessionInput, { cwd: project, env }).stdout);
      assert.equal(promptOut.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
      assert.match(promptOut.hookSpecificOutput.additionalContext, /docs\/README\.md/);

      const failedImpact = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'mcp__plugin_dotdotgod_dotdotgod-context__project_impact', tool_input: { paths: ['docs/README.md'] }, tool_response: { isError: true } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', failedImpact, { cwd: project, env }).stdout), {});
      assert.match(JSON.parse(runHook(runtime, 'userpromptsubmit', sessionInput, { cwd: project, env }).stdout).hookSpecificOutput.additionalContext, /docs\/README\.md/);

      const okImpact = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'mcp__plugin_dotdotgod_dotdotgod-context__project_impact', tool_input: { paths: ['docs/README.md'] }, tool_response: { ok: true } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', okImpact, { cwd: project, env }).stdout), {});
      assert.deepEqual(JSON.parse(runHook(runtime, 'userpromptsubmit', sessionInput, { cwd: project, env }).stdout), {});
    } finally {
      await withTimeout(client.close(), 5_000, `${adapter} MCP close`);
    }

    const requests = await configurePrefetch(t, project);
    const prefetch = await runPackedAsync([runtime, 'userpromptsubmit'], {
      cwd: project, session_id: `prefetch-${adapter}`, prompt: prefetchFocus,
    }, { cwd: project, env });
    assertPrefetch(prefetch.hookSpecificOutput?.additionalContext, requests);

    const cli = run(process.execPath, [join(packageRoot, 'mcp', 'cli.mjs'), '--version'], { cwd: project, env });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /^(?:unknown|\d+\.\d+\.\d+)\s*$/u);

    const compressed = statSync(tarball).size;
    let unpacked = 0;
    walk(packageRoot, (path, entry) => { if (entry.isFile()) unpacked += lstatSync(path).size; });
    t.diagnostic(`${adapter} packed size: ${compressed} bytes compressed, ${unpacked} bytes unpacked`);
  });
}

test('AP-02: antigravity packed adapter is a standalone plugin, hook, and roots-aware MCP runtime', { timeout: 90_000 }, async (t) => {
  const { ListRootsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
  const { pathToFileURL } = await import('node:url');
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-packed-antigravity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const artifactDir = join(root, 'artifacts');
  mkdirSync(join(project, 'src'), { recursive: true });
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(project, 'dotdotgod.config.json'), JSON.stringify({ version: 1, documentation: { root: 'docs' } }));
  writeFileSync(join(project, 'src', 'app.ts'), 'export const v = 1;\n');
  writeFileSync(join(artifactDir, 'implementation_plan.md'), '# Plan\n\nStep 1.\n');
  mkdirSync(join(root, 'home'));
  const stubBin = createNetworkStubs(root);
  const env = isolatedEnvironment(root, project, stubBin);
  delete env.DOTDOTGOD_PROJECT_ROOT;
  delete env.DOTDOTGOD_SESSION_ID;
  const { packageRoot, tarball } = packAndExtract('antigravity', root);
  assertNoAncestorNodeModules(packageRoot);
  auditExtractedPackage(packageRoot);
  const packedManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(packedManifest.engines.node, '>=22.5.0');

  for (const required of ['plugin.json', 'mcp_config.json', 'hooks.json', 'rules/AGENTS.md', 'assets/logo.svg', 'scripts/hook-runtime.mjs', 'mcp/server.mjs', 'mcp/cli.mjs', 'LICENSE']) {
    assert.equal(existsSync(join(packageRoot, required)), true, `missing ${required} in packed @dotdotgod/antigravity`);
  }

  const runtime = join(packageRoot, 'scripts', 'hook-runtime.mjs');
  const convId = 'agy-packed-session-01';
  const editEvent = JSON.stringify({
    conversationId: convId,
    workspacePaths: [project],
    cwd: project,
    artifactDirectoryPath: artifactDir,
    toolCall: { name: 'edit_file', args: { Path: join(project, 'src', 'app.ts') } },
    error: '',
  });
  assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', editEvent, { cwd: packageRoot, env }).stdout), {});

  const preEvent = JSON.stringify({ conversationId: convId, workspacePaths: [project], cwd: project, artifactDirectoryPath: artifactDir });
  const pre1 = JSON.parse(runHook(runtime, 'preinvocation', preEvent, { cwd: packageRoot, env }).stdout);
  assert.equal(pre1.injectSteps.length, 1);
  assert.match(pre1.injectSteps[0].systemMessage.systemMessage, /src\/app\.ts/);
  assert.deepEqual(JSON.parse(runHook(runtime, 'preinvocation', preEvent, { cwd: packageRoot, env }).stdout), {});

  const planEvent = JSON.stringify({
    conversationId: convId,
    workspacePaths: [project],
    cwd: project,
    artifactDirectoryPath: artifactDir,
    toolCall: { name: 'write_file', args: { Path: join(artifactDir, 'implementation_plan.md') } },
    error: '',
  });
  assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', planEvent, { cwd: packageRoot, env }).stdout), {});
  const prePlan = JSON.parse(runHook(runtime, 'preinvocation', preEvent, { cwd: packageRoot, env }).stdout);
  assert.equal(prePlan.injectSteps.length, 1);
  assert.match(prePlan.injectSteps[0].systemMessage.systemMessage, /DOTDOTGOD PLAN SYNC — ADVISORY/);

  const clearEvent = JSON.stringify({
    conversationId: convId,
    workspacePaths: [project],
    cwd: project,
    toolCall: { name: 'call_mcp_tool', args: { ServerName: 'dotdotgod_context', ToolName: 'project_impact', Arguments: { paths: ['src/app.ts'] } } },
    error: '',
  });
  assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', clearEvent, { cwd: packageRoot, env }).stdout), {});

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(packageRoot, 'mcp', 'server.mjs')],
    cwd: packageRoot,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'packed-agy-test', version: '1.0.0' }, { capabilities: { roots: { listChanged: true } } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(project).href }] }));
  try {
    await withTimeout(client.connect(transport), 10_000, 'antigravity MCP initialize');
    const listed = await withTimeout(client.listTools(), 10_000, 'antigravity MCP listTools');
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [...expectedTools].sort());
    const doctor = await withTimeout(client.callTool({ name: 'doctor', arguments: {} }), 10_000, 'antigravity doctor');
    assert.equal(doctor.structuredContent.ok, true);
    assert.equal(realpathSync(doctor.structuredContent.root), realpathSync(project));
    const impactStatus = await withTimeout(client.callTool({ name: 'impact_status', arguments: {} }), 10_000, 'antigravity impact_status');
    assert.equal(impactStatus.structuredContent.sessionBound, false);
    assert.ok(impactStatus.structuredContent.guidance.length <= 120);
  } finally {
    await withTimeout(client.close(), 5_000, 'antigravity MCP close');
  }

  const requests = await configurePrefetch(t, project);
  const prefetch = await runPackedAsync([runtime, 'preinvocation'], {
    conversationId: 'prefetch-antigravity', workspacePaths: [project], cwd: project, lastUserInput: prefetchFocus,
  }, { cwd: packageRoot, env });
  assert.equal(prefetch.injectSteps?.length, 1);
  assertPrefetch(prefetch.injectSteps[0].systemMessage.systemMessage, requests);

  const compressed = statSync(tarball).size;
  let unpacked = 0;
  walk(packageRoot, (path, entry) => { if (entry.isFile()) unpacked += lstatSync(path).size; });
  t.diagnostic(`antigravity packed size: ${compressed} bytes compressed, ${unpacked} bytes unpacked`);
});

test('Hermes packed decision runtime prefetches with its standalone CLI', { timeout: 90_000 }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-packed-hermes-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  mkdirSync(join(root, 'home'));
  const env = isolatedEnvironment(root, project, createNetworkStubs(root));
  const { packageRoot } = packAndExtract('hermes', root);
  assertNoAncestorNodeModules(packageRoot);
  auditExtractedPackage(packageRoot);
  const requests = await configurePrefetch(t, project);
  const result = await runPackedAsync([join(packageRoot, 'mcp', 'decision.mjs')], {
    root: project, rawPrompt: prefetchFocus,
    sessionState: { assessed: false, loaded: false, notified: false, skipCount: 0, lastPromptHash: null },
  }, { cwd: project, env });
  assert.equal(result.ok, true, result.errorLine);
  assert.equal(result.errorLine, null);
  assert.equal(result.state.loaded, true);
  assertPrefetch(result.text, requests);
});
