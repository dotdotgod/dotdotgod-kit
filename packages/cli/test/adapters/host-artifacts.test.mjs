import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { detectClaudeCodeLegacy, renderClaudeCodeFiles } from '../../src/adapters/hosts/claude-code.mjs';
import { detectCodexLegacy, renderCodexFiles } from '../../src/adapters/hosts/codex.mjs';
import { assertNoManagedConflict, createMarkerStore, inspectManagedStatus } from '../../src/adapters/marker-store.mjs';

const pathBinding = { mode: 'path', command: 'dotdotgod' };
const pinned = { mode: 'pinned', nodePath: "/path with space/node's bin", cliEntry: '/stable/cli/bin/dotdotgod.mjs' };
const ctx = { coreVersion: '0.11.0' };
const workflows = ['project-load', 'doc-first-planning', 'project-initializer', 'impact-review'];

test('U-7: Claude and Codex render thin local marketplaces, workflows and direct runtime configurations', () => {
  const readJson = (files, path) => JSON.parse(files.get(path));
  for (const binding of [pinned, pathBinding]) {
    const claude = renderClaudeCodeFiles(binding, ctx);
    const codex = renderCodexFiles(binding, ctx);
    const claudeMarket = readJson(claude, '.claude-plugin/marketplace.json');
    const codexMarket = readJson(codex, '.agents/plugins/marketplace.json');
    assert.equal(claudeMarket.name, 'dotdotgod');
    assert.equal(codexMarket.name, 'dotdotgod');
    assert.deepEqual(claudeMarket.plugins, [{ name: 'dotdotgod', source: './plugin' }]);
    assert.deepEqual(codexMarket.plugins[0].source, { source: 'local', path: './plugins/dotdotgod' });
    const claudePlugin = readJson(claude, 'plugin/.claude-plugin/plugin.json');
    const codexPlugin = readJson(codex, 'plugins/dotdotgod/.codex-plugin/plugin.json');
    assert.equal(claudePlugin.version, ctx.coreVersion);
    assert.equal(codexPlugin.version, ctx.coreVersion);
    assert.equal(codexPlugin.mcpServers, './.mcp.json');
    assert.equal(codexPlugin.hooks, './hooks/hooks.json');
    const expected = binding.mode === 'pinned' ? { command: binding.nodePath, args: [binding.cliEntry, 'mcp'] }
      : { command: 'dotdotgod', args: ['mcp'] };
    assert.deepEqual(claudePlugin.mcpServers, { 'dotdotgod-context': expected });
    assert.deepEqual(readJson(codex, 'plugins/dotdotgod/.mcp.json').mcpServers, claudePlugin.mcpServers);
    for (const [host, files, plugin] of [['claude-code', claude, 'plugin'], ['codex', codex, 'plugins/dotdotgod']]) {
      const { hooks } = readJson(files, `${plugin}/hooks/hooks.json`);
      assert.deepEqual(Object.keys(hooks), ['SessionStart', 'UserPromptSubmit', 'PostToolUse']);
      for (const [event, groups] of Object.entries(hooks)) {
        const cmd = groups[0].hooks[0].command;
        const parsed = spawnSync('/bin/sh', ['-c', `printf '%s\\n' ${cmd}`], { cwd: realpathSync(tmpdir()), encoding: 'utf8' });
        assert.equal(parsed.status, 0);
        assert.deepEqual(parsed.stdout.trimEnd().split('\n'), [expected.command, ...expected.args.slice(0, -1), 'hook', host, event.toLowerCase()]);
      }
      for (const skill of workflows) assert.ok(files.has(`${plugin}/skills/${skill}/SKILL.md`));
      for (const initializer of ['scripts/init_project.sh', 'templates/dotdotgod.config.json']) {
        assert.ok(files.has(`${plugin}/skills/project-initializer/${initializer}`));
      }
      for (const [path, bytes] of files) {
        assert.doesNotMatch(path, /(?:^|\/)(?:mcp\/(?:cli|server)\.mjs|hooks\/runtime\.mjs|document-clarify|config\.toml)$/);
        assert.doesNotMatch(bytes.toString(), /\{\{[A-Z_]+\}\}|mcp\/cli\.mjs|mcp\/server\.mjs/);
      }
    }
    for (const workflow of ['load', 'plan', 'init', 'impact']) assert.ok(claude.has(`plugin/commands/dd/${workflow}.md`));
    assert.match(claude.get('plugin/commands/dd/init.md').toString(), /--claude-plans/);
  }
  const assets = new URL('../../assets/adapters/codex/', import.meta.url);
  assert.match(readFileSync(new URL('CODEX_LICENSE', assets), 'utf8'), /Apache License/);
  assert.match(readFileSync(new URL('CODEX_NOTICE', assets), 'utf8'), /OpenAI/);
});

test('U-7: Claude legacy cache and Codex development symlink block without following or mutating them', (t) => {
  const homeDir = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-hosts-'));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const cwd = homeDir;
  const CODEX_HOME = join(homeDir, 'codex override');
  const context = { ...ctx, cwd, homeDir, env: { CODEX_HOME } };
  const claude = createMarkerStore(context, { host: 'claude-code', scope: 'user' });
  const codex = createMarkerStore(context, { host: 'codex', scope: 'user' });
  for (const [store, detect] of [[claude, detectClaudeCodeLegacy], [codex, detectCodexLegacy]]) {
    assert.equal(detect(store), false);
  }
  const claudeServer = join(homeDir, '.claude/plugins/cache/dotdotgod/dotdotgod/old/mcp/server.mjs');
  mkdirSync(dirname(claudeServer), { recursive: true });
  writeFileSync(claudeServer, 'legacy');
  mkdirSync(dirname(codex.installDir), { recursive: true });
  writeFileSync(join(CODEX_HOME, 'config.toml'), 'untouched');
  symlinkSync(join(homeDir, 'dangling'), join(CODEX_HOME, 'plugins/dotdotgod'));
  for (const [store, detect] of [[claude, detectClaudeCodeLegacy], [codex, detectCodexLegacy]]) {
    const legacy = detect(store);
    assert.equal(legacy, true);
    assert.equal(inspectManagedStatus(store, { legacy }).status, 'legacy-coexist');
    assert.throws(() => assertNoManagedConflict(store, { legacy }), { code: 'LEGACY_COEXIST_CONFLICT' });
  }
  assert.equal(readFileSync(claudeServer, 'utf8'), 'legacy');
  assert.equal(readFileSync(join(CODEX_HOME, 'config.toml'), 'utf8'), 'untouched');
});

test('U-7: unrelated Claude and Codex cache paths do not shadow ownership conflicts', (t) => {
  const homeDir = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-hosts-'));
  t.after(() => rmSync(homeDir, { recursive: true, force: true }));
  const CODEX_HOME = join(homeDir, 'codex');
  const context = { ...ctx, cwd: homeDir, homeDir, env: { CODEX_HOME } };
  const claude = createMarkerStore(context, { host: 'claude-code', scope: 'user' });
  const codex = createMarkerStore(context, { host: 'codex', scope: 'user' });
  const absent = join(homeDir, 'never-traverse');
  symlinkSync(absent, join(homeDir, '.claude'));
  assert.equal(detectClaudeCodeLegacy(claude), false);
  assert.equal(readlinkSync(join(homeDir, '.claude')), absent);
  rmSync(join(homeDir, '.claude'));
  const claudeCache = join(homeDir, '.claude/plugins/cache/market/dotdotgod/old');
  mkdirSync(claudeCache, { recursive: true });
  writeFileSync(join(claudeCache, 'mcp'), 'not a directory');
  assert.equal(detectClaudeCodeLegacy(claude), false);

  mkdirSync(dirname(codex.installDir), { recursive: true });
  const plugins = dirname(codex.installDir);
  writeFileSync(join(plugins, 'dotdotgod'), 'not a plugin');
  writeFileSync(codex.installDir, 'unmanaged');
  symlinkSync(absent, join(plugins, 'cache'));
  assert.equal(detectCodexLegacy(codex), false);
  assert.throws(() => assertNoManagedConflict(codex), { code: 'UNMANAGED_CONFLICT' });
  assert.equal(readFileSync(codex.installDir, 'utf8'), 'unmanaged');
  assert.equal(readlinkSync(join(plugins, 'cache')), absent);
  rmSync(codex.installDir);
  symlinkSync(absent, codex.installDir);
  assert.equal(detectCodexLegacy(codex), false);
  assert.throws(() => assertNoManagedConflict(codex), { code: 'SYMLINK_REJECTED' });
  assert.ok(lstatSync(codex.installDir).isSymbolicLink());

  rmSync(codex.installDir);
  rmSync(join(plugins, 'cache'));
  const cachedVersion = join(plugins, 'cache/dotdotgod/dotdotgod/old');
  mkdirSync(join(cachedVersion, 'mcp'), { recursive: true });
  writeFileSync(join(cachedVersion, 'mcp/server.mjs'), 'known layout');
  assert.equal(detectCodexLegacy(codex), true);
});
