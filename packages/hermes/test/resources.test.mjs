import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';

test('native package has four generated skills, isolated MCP artifacts and no planning resources', () => {
  const pkg = JSON.parse(readFileSync('package.json'));
  assert.equal(pkg.name, '@dotdotgod/hermes');
  for (const path of ['plugin.yaml', '__init__.py', 'runtime.py', 'proxy.py', 'policy.py', 'mcp/server.mjs', 'mcp/cli.mjs', 'mcp/bridge.mjs', 'mcp/tools.json', 'LICENSE', 'README.md']) {
    assert.ok(existsSync(path), path);
  }
  assert.deepEqual(readdirSync('skills').sort(), ['document-clarify', 'impact-review', 'project-initializer', 'project-load']);
  const tools = JSON.parse(readFileSync('mcp/tools.json'));
  assert.equal(tools.length, 18);
  assert.equal(tools.find(t => t.name === 'execute').inputSchema.required.includes('commands'), true);
  assert.equal(existsSync('mcp.json'), false, 'no profile-shared MCP declaration');
  assert.equal(existsSync('hooks/runtime.mjs'), false, 'do not bundle Claude-specific hooks');
  for (const skill of readdirSync('skills')) {
    const body = readFileSync(`skills/${skill}/SKILL.md`, 'utf8');
    assert.match(body, /Generated from packages\/shared/);
    assert.match(body, /operator-authorized selected repository/);
  }
});
