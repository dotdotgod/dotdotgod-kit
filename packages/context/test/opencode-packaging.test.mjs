import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('OpenCode tarball imports and shares durable state with standalone MCP without runtime dependencies', { timeout: 30_000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'opencode-packed-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const pack = spawnSync('pnpm', ['--dir', join(workspace, 'packages/opencode'), 'pack', '--pack-destination', root], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(pack.status, 0, pack.error?.message ?? pack.stderr);
  const tarball = join(root, readdirSync(root).find(name => name.endsWith('.tgz')));
  const extracted = spawnSync('tar', ['-xzf', tarball, '-C', root], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(extracted.status, 0, extracted.stderr);
  const packed = join(root, 'package');
  for (let current = packed; ; current = dirname(current)) {
    assert.equal(existsSync(join(current, 'node_modules')), false, `unexpected ancestor dependency: ${current}`);
    if (dirname(current) === current) break;
  }
  const manifest = JSON.parse(readFileSync(join(packed, 'package.json'), 'utf8'));
  const { createRequire } = await import('node:module');
  const parserApi = createRequire(import.meta.url)(join(packed, 'mcp/parsers/tree-sitter.cjs'));
  await parserApi.Parser.init();
  for (const language of ['typescript', 'tsx']) {
    const parser = new parserApi.Parser();
    parser.setLanguage(await parserApi.Language.load(join(packed, `mcp/parsers/tree-sitter-${language}.wasm`)));
    for (const source of ["const value = original<typeof import('./module')>();", "interface X { records?: import('./module').Record[]; }"]) {
      const tree = parser.parse(source);
      try { assert.equal(tree.rootNode.hasError, false, `${language}: ${source}`); }
      finally { tree.delete(); }
    }
    const broken = parser.parse('function broken( {');
    try { assert.equal(broken.rootNode.hasError, true); }
    finally { broken.delete(); parser.delete(); }
  }
  assert.equal(manifest.dependencies, undefined);
  for (const entry of ['index.js', 'server.js', 'src/index.mjs']) {
    const plugin = (await import(pathToFileURL(join(packed, entry)).href)).default;
    assert.equal(plugin.id, 'dotdotgod');
    assert.equal(typeof plugin.setup, 'function');
  }
  for (const file of ['mcp/server.mjs', 'mcp/cli.mjs', 'mcp/impact-state.mjs', 'mcp/parsers/tree-sitter.cjs', 'commands/load.md', 'skills/project-initializer/scripts/init_project.sh']) {
    assert.equal(existsSync(join(packed, file)), true, file);
  }
  const project = join(root, 'project');
  mkdirSync(join(project, 'docs'), { recursive: true });
  writeFileSync(join(project, 'docs/README.md'), '# Packaged project memory');
  writeFileSync(join(project, 'source.ts'), 'export const value = 1;');
  const { ImpactState } = await import(pathToFileURL(join(packed, 'mcp/impact-state.mjs')).href);
  const state = new ImpactState(project, 'packed-host');
  state.mark(['source.ts']);
  const client = new Client({ name: 'opencode-packed-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(packed, 'mcp/server.mjs')], cwd: project, env: { ...process.env, HOME: root, DOTDOTGOD_PROJECT_ROOT: project }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 19);
    const loaded = await client.callTool({ name: 'project_load', arguments: {} });
    assert.equal(loaded.structuredContent.documentationRoot, 'docs');
    assert.match(loaded.structuredContent.documentationTree.join('\n'), /README.md/);
    const status = await client.callTool({ name: 'impact_status', arguments: { contextSessionId: 'packed-host' } });
    assert.equal(status.structuredContent.count, 1);
    const reviewed = await client.callTool({ name: 'project_impact', arguments: { paths: ['source.ts'], contextSessionId: 'packed-host' } });
    assert.notEqual(reviewed.isError, true, JSON.stringify(reviewed));
    assert.equal(state.status().count, 0);
  } finally { await client.close(); }
  t.diagnostic(`OpenCode tarball: ${statSync(tarball).size} compressed bytes`);
});
