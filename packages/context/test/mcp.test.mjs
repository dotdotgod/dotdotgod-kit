import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
