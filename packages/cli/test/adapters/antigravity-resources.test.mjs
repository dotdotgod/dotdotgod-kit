import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { detectAntigravityLegacy, renderAntigravityFiles } from '../../src/adapters/hosts/antigravity.mjs';
import { assertNoManagedConflict, createMarkerStore } from '../../src/adapters/marker-store.mjs';

const coreVersion = '0.11.0';
const binding = { mode: 'pinned', nodePath: realpathSync(process.execPath),
  cliEntry: fileURLToPath(new URL('../../bin/dotdotgod.mjs', import.meta.url)) };

function fixture(t) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-antigravity-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin' };
  for (const key of ['HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR']) {
    env[key] = join(root, key);
    mkdirSync(env[key]);
  }
  env.TMP = env.TEMP = env.TMPDIR;
  return createMarkerStore({ cwd: root, homeDir: env.HOME, env, coreVersion }, { host: 'antigravity', scope: 'user' });
}

test('AP-01: rendered Antigravity manifest, MCP, hooks, rules and skills', () => {
  const files = renderAntigravityFiles(binding, { coreVersion });
  const read = (path) => files.get(path).toString();
  const manifest = JSON.parse(read('plugin.json'));
  assert.equal(manifest.$schema, 'https://antigravity.google/schemas/v1/plugin.json');
  assert.equal(manifest.name, 'dotdotgod');
  assert.equal(manifest.displayName, 'dotdotgod');
  assert.equal(manifest.version, coreVersion);
  assert.equal(manifest.license, 'Elastic-2.0');
  assert.equal(manifest.logo, 'assets/logo.svg');
  assert.equal(manifest.suggestedPrompts.length, 3);
  assert.ok(manifest.description.length <= 160 && manifest.author.name && manifest.keywords.length);
  assert.match(manifest.homepage, /^https:\/\//);
  assert.match(manifest.repository.url, /^https:\/\//);
  assert.deepEqual(JSON.parse(read('mcp_config.json')), { mcpServers: { context: { command: binding.nodePath, args: [binding.cliEntry, 'mcp'] } } });
  const hooks = JSON.parse(read('hooks.json'));
  assert.deepEqual(Object.keys(hooks), ['dotdotgod']);
  assert.deepEqual(Object.keys(hooks.dotdotgod).sort(), ['PostToolUse', 'PreInvocation']);
  const pre = hooks.dotdotgod.PreInvocation[0];
  const post = hooks.dotdotgod.PostToolUse[0];
  assert.equal(pre.timeout, 25);
  assert.equal(post.hooks[0].timeout, 10);
  const matcher = new RegExp(`^(?:${post.matcher})$`);
  for (const name of ['write_file', 'edit_file', 'write_to_file', 'replace_file_content', 'multi_replace_file_content', 'call_mcp_tool',
    'mcp__dotdotgod_context__project_load', 'dotdotgod_context__project_load', 'mcp__dotdotgod-context__project_load']) assert.match(name, matcher);
  assert.match(pre.command, /^'\/.*' '\/.*' 'hook' 'antigravity' 'preinvocation'$/);
  assert.match(post.hooks[0].command, /^'\/.*' '\/.*' 'hook' 'antigravity' 'posttooluse'$/);
  const pathFiles = renderAntigravityFiles({ mode: 'path', command: 'dotdotgod' }, { coreVersion });
  assert.equal(JSON.parse(pathFiles.get('hooks.json')).dotdotgod.PreInvocation[0].command, "'dotdotgod' 'hook' 'antigravity' 'preinvocation'");
  assert.deepEqual(JSON.parse(pathFiles.get('mcp_config.json')), { mcpServers: { context: { command: 'dotdotgod', args: ['mcp'] } } });

  const rules = read('rules/AGENTS.md');
  assert.ok(rules.trimEnd().split('\n').length <= 25);
  for (const pattern of [/dotdotgod\.config\.json/, /\.dotdotgod\//, /uninitialized/i, /never block/i, /implementation_plan\.md/,
    /native file write tools/i, /never bypass/i, /explicit user confirmation/i, /instructionAuthority:\s*"none"/, /untrusted data/i]) assert.match(rules, pattern);
  for (const workflow of ['load', 'init', 'impact']) {
    assert.match(rules, new RegExp(`/dd-${workflow}.*dd:${workflow}`));
    assert.ok(files.has(`skills/dd-${workflow}/SKILL.md`));
  }
  const loadRules = rules.split('\n').filter((line) => line.includes('`project_load`'));
  assert.equal(loadRules.length, 1);
  assert.match(loadRules[0], /initialized repositor.*\bproject_load\b.*before substantive work.*`decision\.mode`.*`manual`.*`\/dd:no-load`/i);
  assert.equal(files.has('skills/doc-first-planning/SKILL.md'), false);
  assert.ok(files.has('skills/dd-init/scripts/init_project.sh'));
  const readme = read('README.md');
  for (const text of ['>=22.5.0', '/dd-load', '/dd-init', '/dd-impact', 'dd:load', 'sessionBound: false', 'implementation_plan.md', 'document-clarify', '--with-skills']) {
    assert.ok(readme.includes(text), text);
  }
  for (const [path, bytes] of files) {
    assert.doesNotMatch(path, /^(?:mcp\/|scripts\/)/);
    assert.doesNotMatch(bytes.toString(), /\{\{[A-Z_]+\}\}|\$\{PLUGIN_ROOT\}|@dotdotgod\/skills|hook-runtime\.mjs/);
  }
  const svg = read('assets/logo.svg');
  assert.ok(Buffer.byteLength(svg) <= 16 * 1024);
  for (const color of ['#D6F0B0', '#BCE08E', '#1F2E1A']) assert.ok(svg.includes(color), color);
  assert.doesNotMatch(svg.replace('xmlns="http://www.w3.org/2000/svg"', ''), /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|<script|<foreignObject|\son[a-z]+\s*=|https?:\/\/|javascript:|data:/i);
});

test('AP-01: pinned installed-layout fixture passes agy strict validation (zero findings)', (t) => {
  const store = fixture(t);
  for (const [rel, bytes] of renderAntigravityFiles(binding, { coreVersion })) {
    const path = join(store.installDir, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes, { flag: 'wx' });
  }
  const probe = spawnSync('agy', ['plugin', 'validate', '--strict', '--json', store.installDir], {
    cwd: store.ctx.cwd, env: store.ctx.env, encoding: 'utf8', timeout: 15000,
  });
  if (probe.error?.code === 'ENOENT' && process.env.DOTDOTGOD_REQUIRE_AGY !== '1') return t.skip('agy CLI not installed on PATH');
  assert.ifError(probe.error);
  assert.equal(probe.status, 0, `${probe.stdout}\n${probe.stderr}`);
  assert.equal(probe.stderr, '');
  const report = JSON.parse(probe.stdout);
  assert.equal(report.components.hooks, 1);
  assert.deepEqual(report.findings, []);
  t.diagnostic('agy strict JSON: exit 0, hook component present, findings [] (0 errors, 0 warnings)');
});

test('AP-01: unmanaged target and unrelated nested entries are not misclassified as legacy', (t) => {
  const store = fixture(t);
  const { installDir } = store;
  mkdirSync(dirname(installDir), { recursive: true });
  writeFileSync(installDir, 'unmanaged');
  assert.equal(detectAntigravityLegacy(store), false);
  assert.throws(() => assertNoManagedConflict(store), { code: 'UNMANAGED_CONFLICT' });
  assert.equal(readFileSync(installDir, 'utf8'), 'unmanaged');
  rmSync(installDir);
  mkdirSync(installDir);
  writeFileSync(join(installDir, 'mcp'), 'not a directory');
  const outside = join(store.ctx.cwd, 'other scripts');
  mkdirSync(outside);
  writeFileSync(join(outside, 'hook-runtime.mjs'), 'do not follow');
  symlinkSync(outside, join(installDir, 'scripts'));
  assert.equal(detectAntigravityLegacy(store), false);
  assert.equal(readlinkSync(join(installDir, 'scripts')), outside);
});

test('AP-01: legacy direct-placement bundle and development symlink are both detected', (t) => {
  const store = fixture(t);
  assert.equal(detectAntigravityLegacy(store), false);
  mkdirSync(join(store.installDir, 'mcp'), { recursive: true });
  writeFileSync(join(store.installDir, 'mcp/server.mjs'), 'legacy');
  assert.equal(detectAntigravityLegacy(store), true);
  rmSync(store.installDir, { recursive: true });
  symlinkSync(join(store.ctx.cwd, 'dangling'), store.installDir);
  assert.equal(detectAntigravityLegacy(store), true);
});
