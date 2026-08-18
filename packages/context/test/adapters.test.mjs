import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

for (const adapter of ['claude-code', 'codex']) {
  test(`${adapter} MCP wrapper starts outside the plugin directory`, async () => {
    const root = mkdtempSync(join(tmpdir(), `dotdotgod-${adapter}-smoke-`));
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(workspace, 'packages', adapter, 'mcp', 'server.mjs')],
      cwd: root,
      env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: root },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'adapter-smoke', version: '1.0.0' });
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.length, 17);
      const doctor = await client.callTool({ name: 'doctor', arguments: {} });
      assert.equal(doctor.structuredContent.ok, true);
    } finally {
      await client.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
}
