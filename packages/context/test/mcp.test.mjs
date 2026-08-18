import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expected = ['execute', 'batch_execute', 'execute_file', 'index', 'search', 'fetch_and_index', 'stats', 'doctor', 'purge', 'dotdotgod_project_load', 'dotdotgod_project_impact', 'dotdotgod_project_initialize'];

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
