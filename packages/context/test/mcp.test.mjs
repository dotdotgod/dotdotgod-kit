import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PHASE3_TOOL_INPUT_SCHEMAS } from '../src/index.mjs';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expected = ['execute', 'batch_execute', 'execute_file', 'index', 'search', 'fetch_and_index', 'session_resume', 'ingestion_job_start', 'ingestion_job_status', 'ingestion_job_cancel', 'context_heal', 'stats', 'doctor', 'purge', 'dotdotgod_project_load', 'dotdotgod_project_impact', 'dotdotgod_project_initialize'];

test('stdio server lists the complete tool surface and calls doctor', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-mcp-test-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve('bin/server.mjs')],
    cwd: resolve('.'),
    env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), expected.sort());
    for (const [name, schema] of Object.entries(PHASE3_TOOL_INPUT_SCHEMAS)) {
      assert.deepEqual(listed.tools.find((tool) => tool.name === name)?.inputSchema, schema, `${name} schema must match shared adapter contract`);
    }
    assert.equal(existsSync(join(root, '.dotdotgod')), false);
    const result = await client.callTool({ name: 'doctor', arguments: {} });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent.ok, true);
    assert.equal(existsSync(join(root, '.dotdotgod')), false);

    const docs = join(root, 'docs');
    mkdirSync(docs);
    writeFileSync(join(docs, 'a.md'), '# Alpha\npublic-mcp-directory-needle');
    writeFileSync(join(docs, 'skip.txt'), 'must-not-be-indexed');
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
      arguments: {
        executable: process.execPath,
        args: ['-e', "console.log(process.env.MCP_ENV_OVERRIDE); console.log(process.env.NODE_OPTIONS ?? 'reserved-filtered')"],
        shell: false,
        env: { MCP_ENV_OVERRIDE: 'visible' },
      },
    });
    assert.equal(executed.isError, undefined);
    assert.match(executed.structuredContent.stdout, /visible/);
    assert.match(executed.structuredContent.stdout, /reserved-filtered/);
    assert.equal(executed.structuredContent.environmentPolicy.mode, 'inherit-filtered-v1');
    const reservedOverride = await client.callTool({ name: 'execute', arguments: { executable: process.execPath, args: ['-e', '0'], env: { NODE_OPTIONS: 'forbidden' } } });
    assert.equal(reservedOverride.isError, true);
    assert.match(reservedOverride.structuredContent.error, /reserved by the execution policy/);

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
      assert.equal(escaped.isError, true);
      assert.match(escaped.structuredContent.error, /escapes project root/);

      const linkedFile = join(root, 'linked-secret.txt');
      symlinkSync(outsideFile, linkedFile);
      const symlinkEscape = await client.callTool({
        name: 'index',
        arguments: { path: linkedFile },
      });
      assert.equal(symlinkEscape.isError, true);
      assert.match(symlinkEscape.structuredContent.error, /escapes project root/);
    } finally {
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }
});
