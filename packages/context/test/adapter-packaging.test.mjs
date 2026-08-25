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
import { tmpdir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const expectedTools = [
  'execute', 'batch_execute', 'execute_file', 'index', 'search', 'fetch_and_index',
  'session_resume', 'ingestion_job_start', 'ingestion_job_status', 'ingestion_job_cancel',
  'context_heal', 'stats', 'doctor', 'purge', 'dotdotgod_project_load',
  'dotdotgod_embedding_status', 'dotdotgod_embedding_install',
  'dotdotgod_project_impact', 'dotdotgod_project_initialize',
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

function withTimeout(promise, milliseconds, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function assertClaudeMcpHookMatchers(packageRoot) {
  const config = JSON.parse(readFileSync(join(packageRoot, 'hooks', 'hooks.json'), 'utf8'));
  const pluginQualifiedLoad = 'mcp__plugin_dotdotgod_dotdotgod-context__dotdotgod_project_load';
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const matcher = config.hooks[event]?.[0]?.matcher;
    assert.equal(typeof matcher, 'string', `${event} must declare a matcher`);
    assert.match(matcher, /(?:^|\|)mcp__\.\*(?:\||$)/u, `${event} must use Claude's documented MCP wildcard form`);
    assert.equal(new RegExp(matcher, 'u').test(pluginQualifiedLoad), true, `${event} must dispatch plugin-qualified Load tools`);
  }
}

for (const adapter of ['claude-code', 'codex']) {
  test(`${adapter} packed adapter is a standalone hook and MCP runtime`, { timeout: 90_000 }, async (t) => {
    const root = mkdtempSync(join(tmpdir(), `dotdotgod-packed-${adapter}-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const project = join(root, 'project');
    mkdirSync(project);
    mkdirSync(join(project, 'docs'));
    writeFileSync(join(project, 'docs', 'README.md'), '# Project docs\n\nPackaged focused Load fixture.\n');
    mkdirSync(join(root, 'home'));
    const stubBin = createNetworkStubs(root);
    const env = isolatedEnvironment(root, project, stubBin);
    const { packageRoot, tarball } = packAndExtract(adapter, root);
    assertNoAncestorNodeModules(packageRoot);
    auditExtractedPackage(packageRoot);
    const packedManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    assert.equal(packedManifest.engines.node, '>=22.5.0');
    if (adapter === 'claude-code') assertClaudeMcpHookMatchers(packageRoot);

    const runtime = join(packageRoot, 'hooks', 'runtime.mjs');
    const sessionInput = JSON.stringify({ cwd: project, session_id: `packed-${adapter}` });
    const started = runHook(runtime, 'sessionstart', sessionInput, { cwd: project, env });
    assert.equal(started.status, 0, started.stderr);
    assert.doesNotMatch(started.stderr, /ERR_MODULE_NOT_FOUND|package_json_reader/u);
    const lines = started.stdout.trim().split('\n');
    assert.equal(lines.length, 1, `hook must emit one JSON line: ${started.stdout}`);
    const hookOutput = JSON.parse(lines[0]);
    assert.equal(hookOutput.hookSpecificOutput.hookEventName, 'SessionStart');
    assert.match(hookOutput.hookSpecificOutput.additionalContext, /dotdotgod_project_load/u);
    assert.equal(existsSync(join(project, '.dotdotgod', 'context', 'runtime', `packed-${adapter}.json`)), true);
    const substantive = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Bash', tool_input: { command: 'git status --short' } });
    const deniedBeforeLoad = JSON.parse(runHook(runtime, 'pretooluse', substantive, { cwd: project, env }).stdout);
    assert.equal(deniedBeforeLoad.hookSpecificOutput.permissionDecision, 'deny');

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
        name: 'dotdotgod_project_load',
        arguments: { root: '.', focus: 'x'.repeat(501), limit: 3, maxDepth: 2 },
      }), 10_000, `${adapter} rejected project load`);
      assert.equal(failed.isError, true);
      assert.equal(JSON.parse(runHook(runtime, 'pretooluse', substantive, { cwd: project, env }).stdout).hookSpecificOutput.permissionDecision, 'deny');

      const unrelatedMcp = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'mcp__plugin_other_server__unrelated_tool', tool_input: {} });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', unrelatedMcp, { cwd: project, env }).stdout), {});
      assert.equal(JSON.parse(runHook(runtime, 'pretooluse', substantive, { cwd: project, env }).stdout).hookSpecificOutput.permissionDecision, 'deny');

      const loaded = await withTimeout(client.callTool({
        name: 'dotdotgod_project_load',
        arguments: { root: '.', focus: 'packaged focused project memory', limit: 3, maxDepth: 2 },
      }), 10_000, `${adapter} focused project load`);
      assert.equal(loaded.isError, undefined, JSON.stringify(loaded.structuredContent));
      assert.equal(loaded.structuredContent.ok, true);
      assert.ok(loaded.structuredContent.documentationTree.some((line) => line.includes('docs/README.md')));
      assert.equal(loaded.structuredContent.query, null);
      assert.equal(loaded.structuredContent.queryUnavailable.code, 'EMBEDDING_RUNTIME_MISSING');
      assert.equal(loaded.structuredContent.queryUnavailable.recovery.requiresConfirmation, true);
      assert.equal(loaded.structuredContent.queryUnavailable.recovery.installTool, 'dotdotgod_embedding_install');
      const serializedLoad = JSON.stringify(loaded);
      assert.doesNotMatch(serializedLoad, /ERR_MODULE_NOT_FOUND|plugins\/cache|package_json_reader/u);

      const completedLoad = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'mcp__plugin_dotdotgod_dotdotgod-context__dotdotgod_project_load', tool_input: { root: '.', focus: 'packaged focused project memory' } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', completedLoad, { cwd: project, env }).stdout), {});
      assert.deepEqual(JSON.parse(runHook(runtime, 'pretooluse', substantive, { cwd: project, env }).stdout), {});

      const changedPath = join(project, 'docs', 'README.md');
      const completedWrite = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Write', tool_input: { file_path: changedPath } });
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', completedWrite, { cwd: project, env }).stdout), {});
      const broadVerification = JSON.stringify({ cwd: project, session_id: `packed-${adapter}`, tool_name: 'Bash', tool_input: { command: 'pnpm run verify' } });
      assert.equal(JSON.parse(runHook(runtime, 'pretooluse', broadVerification, { cwd: project, env }).stdout).hookSpecificOutput.permissionDecision, 'deny');
      assert.deepEqual(JSON.parse(runHook(runtime, 'posttooluse', unrelatedMcp, { cwd: project, env }).stdout), {});
      assert.equal(JSON.parse(runHook(runtime, 'pretooluse', broadVerification, { cwd: project, env }).stdout).hookSpecificOutput.permissionDecision, 'deny');
    } finally {
      await withTimeout(client.close(), 5_000, `${adapter} MCP close`);
    }

    const cli = run(process.execPath, [join(packageRoot, 'mcp', 'cli.mjs'), '--version'], { cwd: project, env });
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /^(?:unknown|\d+\.\d+\.\d+)\s*$/u);

    const compressed = statSync(tarball).size;
    let unpacked = 0;
    walk(packageRoot, (path, entry) => { if (entry.isFile()) unpacked += lstatSync(path).size; });
    t.diagnostic(`${adapter} packed size: ${compressed} bytes compressed, ${unpacked} bytes unpacked`);
  });
}
