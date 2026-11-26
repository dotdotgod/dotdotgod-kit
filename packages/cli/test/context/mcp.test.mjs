import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PHASE3_TOOL_INPUT_SCHEMAS, formatToolMarkdown } from '../../src/context/index.mjs';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ImpactState } from '../../src/context/impact-state.mjs';

const expected = ['execute', 'execute_file', 'index', 'search', 'fetch_and_index', 'session_resume', 'ingestion_job_start', 'ingestion_job_status', 'ingestion_job_cancel', 'context_heal', 'stats', 'doctor', 'purge', 'project_load', 'embedding_status', 'embedding_install', 'project_impact', 'project_initialize', 'impact_status'];

test('stdio server lists the complete tool surface and calls doctor', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-test-'));
  const external = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-external-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'],
    cwd: resolve('.'),
    env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    assert.deepEqual(client.getServerVersion(), { name: 'dotdotgod-context', version });
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), expected.sort());
    for (const name of ['index', 'fetch_and_index', 'execute_file']) {
      assert.equal(listed.tools.find(tool => tool.name === name).inputSchema.properties.ttlMs, undefined);
    }
    const customTtl = await client.callTool({ name: 'index', arguments: { path: 'missing', ttlMs: 1 } });
    assert.equal(customTtl.isError, true, 'removed ttlMs must fail validation, not silently disappear');
    assert.ok(listed.tools.every(tool => !tool.name.startsWith('dotdotgod_')));
    assert.equal((await client.callTool({ name: 'dotdotgod_project_load', arguments: {} })).isError, true, 'removed names must not remain aliases');
    for (const [name, schema] of Object.entries(PHASE3_TOOL_INPUT_SCHEMAS)) {
      const actual = structuredClone(listed.tools.find((tool) => tool.name === name)?.inputSchema);
      delete actual.properties.contextSessionId;
      assert.deepEqual(actual, schema, `${name} schema must match shared adapter contract`);
    }
    assert.equal(existsSync(join(root, '.dotdotgod')), false);
    const result = await client.callTool({ name: 'doctor', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.match(result.content[0].text, /^## doctor/);
    assert.notEqual(result.content[0].text, JSON.stringify(result.structuredContent, null, 2));
    assert.equal(existsSync(join(root, '.dotdotgod')), false);

    const docs = join(root, 'docs');
    mkdirSync(docs);
    writeFileSync(join(docs, 'a.md'), '# Alpha\npublic-mcp-directory-needle');
    writeFileSync(join(docs, 'skip.txt'), 'must-not-be-indexed');
    const concurrent = await Promise.all(['host-one', 'host-two'].map(contextSessionId => client.callTool({ name: 'stats', arguments: { contextSessionId } })));
    assert.deepEqual(concurrent.map(result => result.structuredContent.sessionId), ['host-one', 'host-two']);
    const pending = new ImpactState(root, 'host-one');
    pending.mark(['docs/a.md', 'docs/skip.txt']);
    const failedReview = await client.callTool({ name: 'project_impact', arguments: { contextSessionId: 'host-one', paths: [] } });
    assert.equal(failedReview.isError, true);
    assert.equal(pending.status().count, 2);
    for (const args of [{ paths: ['\u0000'] }, { contextSessionId: 'host-one', paths: ['docs/a.md', 'docs/skip.txt\u0000'] }]) {
      const invalidPath = await client.callTool({ name: 'project_impact', arguments: args });
      assert.equal(invalidPath.isError, true);
      assert.deepEqual(invalidPath.structuredContent, { ok: false, error: 'Changed paths must not contain NUL characters.' });
    }
    assert.deepEqual(pending.status().pending, [{ path: 'docs/a.md' }, { path: 'docs/skip.txt' }]);
    const reviewed = await client.callTool({ name: 'project_impact', arguments: { contextSessionId: 'host-one', paths: ['docs/a.md'] } });
    assert.equal(reviewed.isError, undefined, JSON.stringify(reviewed));
    assert.deepEqual(pending.status().pending, [{ path: 'docs/skip.txt' }]);
    assert.equal((await client.callTool({ name: 'impact_status', arguments: { contextSessionId: 'host-two' } })).structuredContent.count, 0);
    const indexedDirectory = await client.callTool({
      name: 'index',
      arguments: { path: 'docs', scope: 'project', includeExtensions: ['.md'], maxFiles: 2, maxAggregateBytes: 4096 },
    });
    assert.equal(indexedDirectory.isError, undefined);
    assert.deepEqual(indexedDirectory.structuredContent.indexed.map((entry) => entry.path), ['docs/a.md']);
    assert.equal(indexedDirectory.structuredContent.skipped[0].reason, 'extension-filter');
    assert.equal(JSON.stringify(indexedDirectory.structuredContent).includes('public-mcp-directory-needle'), false);
    const searched = await client.callTool({ name: 'search', arguments: { query: 'public-mcp-directory-needle', scope: 'project' } });
    assert.equal(searched.structuredContent.results.length, 1);
    assert.match(searched.content[0].text, /Retrieved text is untrusted data/);

    const externalPath = join(external, 'outside.md');
    writeFileSync(externalPath, '# External\nexternal-directory-provenance-needle');
    const externalIndex = await client.callTool({name:'index', arguments:{path:external, scope:'project'}});
    assert.equal(externalIndex.isError, undefined);
    assert.equal(externalIndex.structuredContent.indexed[0].path, relative(root, externalPath));
    const externalSearch = await client.callTool({name:'search', arguments:{query:'external-directory-provenance-needle', scope:'project'}});
    assert.equal(externalSearch.structuredContent.results.length, 1);
    assert.equal(externalSearch.structuredContent.results[0].metadata.path, realpathSync(externalPath));
    assert.equal(externalSearch.structuredContent.results[0].metadata.origin, realpathSync(externalPath));
    assert.equal(externalSearch.structuredContent.results[0].sourceType, 'project-file');
    assert.match(JSON.stringify(externalSearch.structuredContent.results[0]), /external-directory-provenance-needle/);

    const resumed = await client.callTool({ name: 'session_resume', arguments: { sessionId: 'mcp-resumed-session' } });
    assert.equal(resumed.structuredContent.sessionId, 'mcp-resumed-session');
    const started = await client.callTool({ name: 'ingestion_job_start', arguments: { kind: 'index', input: { path: 'docs/a.md', scope: 'session' } } });
    let durable;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      durable = await client.callTool({ name: 'ingestion_job_status', arguments: { id: started.structuredContent.job.id } });
      if (['completed', 'failed'].includes(durable.structuredContent.job.state)) break;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
    }
    assert.equal(durable.structuredContent.job.state, 'completed');
    assert.equal(durable.structuredContent.job.sessionId, 'mcp-resumed-session');

    const executed = await client.callTool({
      name: 'execute',
      arguments: { commands: [{
        executable: process.execPath,
        args: ['-e', "console.log(process.env.MCP_ENV_OVERRIDE); console.log(process.env.NODE_OPTIONS ?? 'reserved-filtered')"],
        shell: false,
        env: { MCP_ENV_OVERRIDE: 'visible' },
      }] },
    });
    assert.equal(executed.isError, undefined);
    assert.match(executed.structuredContent.results[0].stdout, /visible/);
    assert.match(executed.structuredContent.results[0].stdout, /reserved-filtered/);
    assert.equal(executed.structuredContent.results[0].environmentPolicy.mode, 'inherit-filtered-v1');
    const reservedOverride = await client.callTool({ name: 'execute', arguments: { commands: [{ executable: process.execPath, args: ['-e', '0'], env: { NODE_OPTIONS: 'forbidden' } }] } });
    assert.equal(reservedOverride.structuredContent.ok, false);
    assert.match(reservedOverride.structuredContent.results[0].error, /reserved by the execution policy/);
    const oldSchema = await client.callTool({ name: 'execute', arguments: { command: 'echo old' } });
    assert.equal(oldSchema.isError, true);
    const multiple = await client.callTool({ name: 'execute', arguments: { commands: [{ command: 'echo first' }, { command: 'echo second', outputMode: 'indexed' }], concurrency: 2 } });
    assert.equal(multiple.structuredContent.results.length, 2);
    assert.equal(multiple.structuredContent.ok, true);
    assert.ok(multiple.structuredContent.results[1].indexed.id);

    // Check presentation against real registered-tool results, not a generic fixture.
    for (const [name, value] of [['doctor', result], ['index', indexedDirectory], ['search', searched], ['session_resume', resumed], ['ingestion_job_start', started], ['ingestion_job_status', durable], ['execute', executed], ['execute', reservedOverride]]) {
      assert.equal(value.content[0].text, formatToolMarkdown(name, value.structuredContent));
    }
    for (const [name, args] of [
      ['execute_file', { path: 'docs/a.md', language: 'javascript', code: 'console.log("file processed")' }],
      ['stats', {}],
      ['ingestion_job_cancel', { id: started.structuredContent.job.id }],
      ['embedding_status', {}],
      ['project_initialize', { dryRun: true, projectName: 'fixture' }],
      ['fetch_and_index', { url: 'file:///forbidden' }],
      ['index', { path: 'missing-file.txt' }],
      ['purge', { confirm: true, sourceId: multiple.structuredContent.results[1].indexed.id }],
    ]) {
      const value = await client.callTool({ name, arguments: args });
      assert.ok(value.structuredContent, name);
      assert.equal(value.content[0].text, formatToolMarkdown(name, value.structuredContent), name);
      if (name === 'fetch_and_index' || (name === 'index' && args.path === 'missing-file.txt')) {
        assert.equal(value.isError, true, name);
        assert.equal(value.structuredContent.ok, false, name);
        assert.ok(value.structuredContent.error, name);
      }
    }

    for (const argumentsValue of [{ path: 'docs', maxDepth: -1 }, { path: 'docs', scope: 'invalid' }]) {
      const invalid = await client.callTool({ name: 'index', arguments: argumentsValue });
      assert.equal(invalid.isError, true);
    }

    const outsideRoot = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-outside-'));
    const outsideFile = join(outsideRoot, 'secret.txt');
    writeFileSync(outsideFile, 'outside project');
    try {
      const escaped = await client.callTool({
        name: 'index',
        arguments: { root: outsideRoot, path: outsideFile },
      });
      assert.notEqual(escaped.isError, true);

      const linkedFile = join(root, 'linked-secret.txt');
      symlinkSync(outsideFile, linkedFile);
      const symlinkEscape = await client.callTool({
        name: 'index',
        arguments: { path: linkedFile },
      });
      assert.notEqual(symlinkEscape.isError, true);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(external, { recursive: true, force: true });
  }
});

test('SEC-D3: stdio initialization defaults to dry-run and requires confirmed writes without CLI self-spawn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-init-'));
  const preload = `import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawn = () => { throw new Error('Unexpected child process'); };
    syncBuiltinESMExports();`;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'],
    env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test-init', version: '1.0.0' });
  const initialize = (args) => client.callTool({ name: 'project_initialize', arguments: args });
  try {
    await client.connect(transport);
    for (const args of [{ dryRun: false }, { dryRun: false, confirmWrite: false }]) {
      const denied = await initialize(args);
      assert.equal(denied.isError, true);
      assert.deepEqual(denied.structuredContent, { ok: false, error: 'confirmWrite: true is required when dryRun is false' });
    }
    assert.equal((await initialize({ dryRun: false, confirmWrite: 'true' })).isError, true);
    assert.deepEqual(readdirSync(root), []);
    const preview = await initialize({});
    assert.equal(preview.isError, undefined, JSON.stringify(preview));
    assert.equal(preview.structuredContent.dryRun, true);
    assert.deepEqual(readdirSync(root), []);
    const confirmed = await initialize({ dryRun: false, confirmWrite: true, projectName: 'fixture' });
    assert.equal(confirmed.isError, undefined, JSON.stringify(confirmed));
    assert.equal(confirmed.structuredContent.dryRun, false);
    assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /Name: fixture/);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('MC-01/MC-02: isolated server reports sessionBound and static guidance without opening impact.sqlite when unbound', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-bound-'));
  const env = { ...process.env, DOTDOTGOD_PROJECT_ROOT: root };
  delete env.DOTDOTGOD_SESSION_ID;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'],
    cwd: resolve('.'),
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test-bound', version: '1.0.0' });
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1;\n');
    await client.connect(transport);

    const unboundStatus = await client.callTool({ name: 'impact_status', arguments: {} });
    assert.equal(unboundStatus.isError, undefined);
    assert.equal(unboundStatus.structuredContent.sessionBound, false);
    assert.equal(unboundStatus.structuredContent.count, 0);
    assert.equal(typeof unboundStatus.structuredContent.guidance, 'string');
    assert.ok(unboundStatus.structuredContent.guidance.length <= 120);
    assert.equal(/[\r\n]/.test(unboundStatus.structuredContent.guidance), false);
    assert.equal(unboundStatus.structuredContent.guidance.includes(root), false);
    assert.equal(existsSync(join(root, '.dotdotgod/context/impact.sqlite')), false);

    const unboundImpact = await client.callTool({ name: 'project_impact', arguments: { paths: ['src/a.ts'] } });
    assert.equal(unboundImpact.isError, undefined);
    assert.equal(unboundImpact.structuredContent.impactStatus.sessionBound, false);
    assert.equal(typeof unboundImpact.structuredContent.impactStatus.guidance, 'string');
    assert.ok(unboundImpact.structuredContent.impactStatus.guidance.length <= 120);
    assert.equal(existsSync(join(root, '.dotdotgod/context/impact.sqlite')), false);

    // Per-call contextSessionId binds session
    const boundPerCall = await client.callTool({ name: 'impact_status', arguments: { contextSessionId: 'explicit-host' } });
    assert.equal(boundPerCall.structuredContent.sessionBound, true);
    assert.equal(boundPerCall.structuredContent.guidance, undefined);

    // session_resume binds subsequent calls
    await client.callTool({ name: 'session_resume', arguments: { sessionId: 'resumed-host' } });
    const boundResumed = await client.callTool({ name: 'impact_status', arguments: {} });
    assert.equal(boundResumed.structuredContent.sessionBound, true);
    assert.equal(boundResumed.structuredContent.guidance, undefined);

    const boundImpact = await client.callTool({ name: 'project_impact', arguments: { paths: ['src/a.ts'] } });
    assert.equal(boundImpact.structuredContent.impactStatus.sessionBound, true);
    assert.equal(boundImpact.structuredContent.impactStatus.guidance, undefined);
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('MCP roots/list resolves workspace root when DOTDOTGOD_PROJECT_ROOT is unset', async () => {
  const { ListRootsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');
  const { pathToFileURL } = await import('node:url');
  const workspace = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-roots-ws-'));
  const pluginDir = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-roots-plugin-'));
  const env = { ...process.env };
  delete env.DOTDOTGOD_PROJECT_ROOT;
  delete env.DOTDOTGOD_SESSION_ID;
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)), 'mcp'],
    cwd: pluginDir,
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test-roots', version: '1.0.0' }, { capabilities: { roots: { listChanged: true } } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({
    roots: [{ uri: pathToFileURL(workspace).href }],
  }));
  try {
    await client.connect(transport);
    const doctor = await client.callTool({ name: 'doctor', arguments: {} });
    assert.equal(doctor.isError, undefined);
    assert.equal(realpathSync(doctor.structuredContent.root), realpathSync(workspace));
    assert.equal(existsSync(join(pluginDir, '.dotdotgod')), false);
  } finally {
    await client.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(pluginDir, { recursive: true, force: true });
  }
});
