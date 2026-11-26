import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readText = (rel) => readFileSync(join(pkgRoot, rel), 'utf8');
const readJson = (rel) => JSON.parse(readText(rel));

test('AP-01: plugin.json, package.json, mcp_config.json, and hooks.json match Antigravity contracts', () => {
  const pkg = readJson('package.json');
  const plugin = readJson('plugin.json');
  const mcp = readJson('mcp_config.json');
  const hooks = readJson('hooks.json');

  assert.equal(pkg.name, '@dotdotgod/antigravity');
  assert.equal(pkg.license, 'Elastic-2.0');
  assert.equal(pkg.engines?.node, '>=22.5.0');

  assert.equal(plugin.$schema, 'https://antigravity.google/schemas/v1/plugin.json');
  assert.equal(plugin.name, 'dotdotgod');
  assert.equal(plugin.displayName, 'dotdotgod');
  assert.equal(plugin.version, pkg.version);
  assert.equal(plugin.logo, 'assets/logo.svg');
  assert.equal(plugin.license, 'Elastic-2.0');
  assert.equal(Array.isArray(plugin.suggestedPrompts), true);
  assert.equal(plugin.suggestedPrompts.length, 3);
  assert.ok(plugin.description && plugin.description.length <= 160);
  assert.ok(plugin.author?.name);
  assert.match(plugin.homepage, /^https:\/\//);
  assert.match(plugin.repository?.url ?? '', /^https:\/\//);
  assert.equal(Array.isArray(plugin.keywords) && plugin.keywords.length > 0, true);

  assert.deepEqual(Object.keys(mcp.mcpServers), ['context']);
  assert.deepEqual(mcp.mcpServers.context, {
    command: 'node',
    args: ['${PLUGIN_ROOT}/mcp/server.mjs'],
  });

  assert.deepEqual(Object.keys(hooks), ['dotdotgod']);
  const hookEvents = Object.keys(hooks.dotdotgod).sort();
  assert.deepEqual(hookEvents, ['PostToolUse', 'PreInvocation']);
  assert.equal(hooks.dotdotgod.PostToolUse.length, 1);
  const postGroup = hooks.dotdotgod.PostToolUse[0];
  for (const token of ['write_file', 'edit_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'call_mcp_tool', 'dotdotgod_context']) {
    assert.ok(postGroup.matcher.includes(token), `PostToolUse matcher missing ${token}`);
  }
  const matcher = new RegExp(`^(?:${postGroup.matcher})$`);
  for (const prefix of ['mcp__dotdotgod_context__', 'dotdotgod_context__', 'mcp__dotdotgod-context__']) {
    assert.match(`${prefix}project_load`, matcher);
  }
  assert.equal(postGroup.hooks[0].command, 'node ./scripts/hook-runtime.mjs posttooluse');
  assert.equal(hooks.dotdotgod.PreInvocation.length, 1);
  assert.equal(hooks.dotdotgod.PreInvocation[0].command, 'node ./scripts/hook-runtime.mjs preinvocation');
  assert.equal(hooks.dotdotgod.PreInvocation[0].timeout, 25);
});

test('AP-01: rules/AGENTS.md stays within line budget and declares all four security/activation boundaries', () => {
  const rules = readText('rules/AGENTS.md');
  const lines = rules.trimEnd().split('\n');
  assert.ok(lines.length > 0 && lines.length <= 25, `rules/AGENTS.md has ${lines.length} lines (expected 1..25)`);

  // 1. Repository scope aligned with isInitializedProject
  assert.match(rules, /dotdotgod\.config\.json/);
  assert.match(rules, /\.dotdotgod\//);
  assert.match(rules, /uninitialized/i);
  // 2. Three short skills + dd:* triggers + native /plan + advisory non-blocking
  for (const term of ['/dd-load', 'dd:load', '/dd-init', 'dd:init', '/dd-impact', 'dd:impact', '/plan']) {
    assert.ok(rules.includes(term), `rules/AGENTS.md missing ${term}`);
  }
  assert.equal(existsSync(join(pkgRoot, 'skills/doc-first-planning')), false, 'doc-first-planning skill must not be bundled');
  for (const skillName of ['dd-init', 'dd-load', 'dd-impact']) {
    assert.equal(existsSync(join(pkgRoot, 'skills', skillName, 'SKILL.md')), true, `missing skill ${skillName}`);
  }
  assert.match(rules, /never block/i);
  const workflowRules = rules.split('## Workflows And Plan Sync\n')[1].split('\n## ')[0];
  const loadRules = workflowRules.split('\n').filter((line) => line.includes('`project_load`'));
  assert.equal(loadRules.length, 1);
  assert.match(loadRules[0], /initialized repositor.*\bproject_load\b.*before substantive work.*`decision\.mode`.*`manual`.*`\/dd:no-load`/i);
  // 3. C-2 /plan native write boundary
  assert.match(rules, /implementation_plan\.md/);
  assert.match(rules, /native file write tools/i);
  // 4. Security, approval, and untrusted data boundaries
  assert.match(rules, /never bypass/i);
  assert.match(rules, /explicit user confirmation/i);
  assert.match(rules, /instructionAuthority:\s*"none"/);
  assert.match(rules, /untrusted data/i);
});

test('AP-01: assets/logo.svg meets size, palette, and static SVG security rules', () => {
  const svgPath = join(pkgRoot, 'assets/logo.svg');
  const size = statSync(svgPath).size;
  assert.ok(size > 0 && size <= 16 * 1024, `logo.svg size ${size} exceeds 16 KiB`);
  const svg = readFileSync(svgPath, 'utf8');

  for (const hex of ['#D6F0B0', '#BCE08E', '#1F2E1A']) {
    assert.ok(svg.includes(hex), `logo.svg missing palette color ${hex}`);
  }
  const strippedXmlns = svg.replaceAll('xmlns="http://www.w3.org/2000/svg"', '');
  for (const forbidden of [/<!DOCTYPE/i, /<!ENTITY/i, /<\?xml-stylesheet/i, /<script/i, /<foreignObject/i, /\son[a-z]+\s*=/i, /https?:\/\//i, /javascript:/i, /data:/i]) {
    assert.equal(forbidden.test(strippedXmlns), false, `logo.svg matched forbidden pattern ${forbidden}`);
  }
});

test('AP-01: README.md documents Node >=22.5.0, triggers, C-2 /plan, sessionBound: false, and @dotdotgod/skills without legacy upgrade prose', () => {
  const readme = readText('README.md');
  for (const required of ['>=22.5.0', '/dd-load', '/dd-init', '/dd-impact', 'dd:load', 'sessionBound: false', 'implementation_plan.md', '@dotdotgod/skills']) {
    assert.ok(readme.includes(required), `README.md missing ${required}`);
  }
  assert.doesNotMatch(readme, /upgrading from a bundled copy/i);
});

test('AP-01: agy plugin validate --strict --json succeeds when agy CLI is installed', (t) => {
  const probe = spawnSync('agy', ['plugin', 'validate', '--strict', '--json', pkgRoot], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    t.skip('agy CLI not installed on PATH');
    return;
  }
  const report = JSON.parse(probe.stdout);
  const errors = (report.findings ?? []).filter((f) => f.severity === 'error');
  assert.deepEqual(errors, [], `unexpected agy validate errors: ${JSON.stringify(errors)}`);

  const hasBundledHook = existsSync(join(pkgRoot, 'scripts/hook-runtime.mjs'));
  if (hasBundledHook) {
    assert.equal(probe.status, 0, `agy plugin validate --strict failed: ${probe.stdout}\n${probe.stderr}`);
    const warnings = (report.findings ?? []).filter((f) => f.severity === 'warning');
    assert.deepEqual(warnings, [], `unexpected agy validate warnings: ${JSON.stringify(warnings)}`);
  } else {
    const unexpected = (report.findings ?? []).filter(
      (f) => f.severity === 'warning' && !f.message.includes('./scripts/hook-runtime.mjs'),
    );
    assert.deepEqual(unexpected, [], `unexpected pre-bundle warnings: ${JSON.stringify(unexpected)}`);
  }
});
