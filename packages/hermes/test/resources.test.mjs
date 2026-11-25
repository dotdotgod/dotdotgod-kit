import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import test from 'node:test';

test('native package has three generated skills, isolated MCP artifacts and no planning resources', () => {
  const pkg = JSON.parse(readFileSync('package.json'));
  assert.equal(pkg.name, '@dotdotgod/hermes');
  for (const path of ['plugin.yaml', '__init__.py', 'runtime.py', 'proxy.py', 'policy.py', 'impact.py', 'mcp/server.mjs', 'mcp/cli.mjs', 'mcp/bridge.mjs', 'mcp/tools.json', 'LICENSE', 'README.md']) {
    assert.ok(existsSync(path), path);
  }
  assert.ok(pkg.files.includes('impact.py'), 'package.json#files must include impact.py');
  assert.deepEqual(readdirSync('skills').sort(), ['impact-review', 'project-initializer', 'project-load']);
  const tools = JSON.parse(readFileSync('mcp/tools.json'));
  assert.equal(tools.length, 19);
  assert.equal(new Set(tools.map(tool => tool.name)).size, 19);
  assert.ok(tools.every(tool => !tool.name.startsWith('dotdotgod_')));
  const pluginYaml = readFileSync('plugin.yaml', 'utf8');
  const manifest = pluginYaml.split('provides_tools:\n')[1].split('provides_hooks:')[0];
  const names = [...manifest.matchAll(/^  - (.+)$/gm)].map(match => match[1]);
  assert.equal(new Set(names).size, 20);
  assert.deepEqual(names.sort(), [...tools.map(tool => tool.name), 'select_root'].sort());
  const hooksSection = pluginYaml.split('provides_hooks:\n')[1].split('provides_skills:')[0];
  const hooks = [...hooksSection.matchAll(/^  - (.+)$/gm)].map(match => match[1]);
  assert.ok(hooks.includes('post_tool_call'), 'plugin.yaml must declare post_tool_call');
  const policyPy = readFileSync('policy.py', 'utf8');
  assert.ok(!/\bGATE\b|\bdef gate\(|\bdef commands\(/.test(policyPy), 'policy.py must not retain impact-blocking gates');
  const runtimePy = readFileSync('runtime.py', 'utf8');
  assert.ok(!/"action":\s*"block"/.test(runtimePy), 'runtime.py must not block tools');
  assert.equal(tools.find(t => t.name === 'execute').inputSchema.required.includes('commands'), true);
  assert.equal(existsSync('mcp.json'), false, 'no profile-shared MCP declaration');
  assert.equal(existsSync('hooks/runtime.mjs'), false, 'do not bundle Claude-specific hooks');
  for (const skill of readdirSync('skills')) {
    const body = readFileSync(`skills/${skill}/SKILL.md`, 'utf8');
    assert.match(body, /Generated from packages\/shared/);
    assert.match(body, /operator-authorized selected repository/);
  }
});
