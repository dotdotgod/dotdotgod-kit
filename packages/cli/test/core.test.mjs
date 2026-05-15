import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  CACHE_VERSION,
  buildCommunities,
  buildGraph,
  buildImpactReport,
  buildIndex,
  collectIndexFiles,
  extractAnchors,
  extractLinks,
  graphSummary,
  headingToAnchor,
  isKebabCase,
  isUpperSnakeMarkdown,
  neighborhood,
  shouldIndexPath,
} from '../src/core.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-cli-unit-'));
  mkdirSync(join(root, 'docs/spec'), { recursive: true });
  mkdirSync(join(root, 'docs/plan'), { recursive: true });
  mkdirSync(join(root, 'docs/archive'), { recursive: true });
  mkdirSync(join(root, 'packages/tool/bin'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n');
  writeFileSync(join(root, 'README.md'), '# Fixture\n');
  writeFileSync(join(root, 'docs/README.md'), '# Docs\n[Spec](spec/README.md)\n');
  writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n');
  writeFileSync(join(root, 'docs/plan/README.md'), '# Plans\n');
  writeFileSync(join(root, 'docs/archive/README.md'), '# Archive\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', scripts: { verify: 'node --test' } }, null, 2));
  writeFileSync(join(root, 'packages/tool/package.json'), JSON.stringify({ name: '@fixture/tool', files: ['bin', 'index.mjs'], bin: { tool: './bin/tool.mjs' }, pi: { extensions: ['./extensions'] }, dependencies: { leftpad: '1.0.0' } }, null, 2));
  writeFileSync(join(root, 'packages/tool/index.mjs'), "import fs from 'node:fs';\nexport function run() { return 'plan-mode:enabled'; }\nconst value = 1;\nfunction local() { const hidden = 1; return hidden; }\npi.registerCommand('load', {});\n");
  writeFileSync(join(root, 'packages/tool/index.test.mjs'), "import { run } from './index.mjs';\nexport { run as testRun };\n");
  return root;
}

describe('CLI docs helpers', () => {
  it('validates dotdotgod naming conventions', () => {
    assert.equal(isKebabCase('graph-query'), true);
    assert.equal(isKebabCase('GraphQuery'), false);
    assert.equal(isUpperSnakeMarkdown('README.md'), true);
    assert.equal(isUpperSnakeMarkdown('LOAD_PROJECT.md'), true);
    assert.equal(isUpperSnakeMarkdown('load-project.md'), false);
  });

  it('extracts anchors and local links while ignoring code blocks and external links', () => {
    const md = '# Hello `World`!\n[Local](docs/README.md#hello-world)\n[Web](https://example.com)\n```md\n[Ignored](missing.md)\n```\n# Hello World\n';
    assert.equal(headingToAnchor('Hello `World`!'), 'hello-world');
    assert.deepEqual([...extractAnchors(md)], ['hello-world', 'hello-world-1']);
    assert.deepEqual(extractLinks(md), [{ href: 'docs/README.md#hello-world', line: 2 }]);
  });
});

describe('CLI index and graph helpers', () => {
  it('collects gitignore-aware curated files and excludes archive bodies', () => {
    const root = fixture();
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'tests'), { recursive: true });
    mkdirSync(join(root, 'ignored'), { recursive: true });
    writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\nignored/\n');
    writeFileSync(join(root, 'src/index.py'), 'def main():\n    return 1\n');
    writeFileSync(join(root, 'tests/test_index.py'), 'from src.index import main\n');
    writeFileSync(join(root, 'pyproject.toml'), '[project]\nname = "fixture"\n');
    writeFileSync(join(root, '.env'), 'SECRET=1\n');
    writeFileSync(join(root, '.env.example'), 'SECRET=example\n');
    writeFileSync(join(root, 'ignored/visible.ts'), 'export const ignored = true;\n');
    writeFileSync(join(root, 'docs/archive/OLD.md'), '# Old\n');
    spawnSync('git', ['init'], { cwd: root, stdio: 'ignore' });
    const files = collectIndexFiles(root).map((file) => file.slice(root.length + 1).replaceAll('\\', '/'));
    assert(files.includes('AGENTS.md'));
    assert(files.includes('docs/archive/README.md'));
    assert(files.includes('docs/plan/README.md'));
    assert(files.includes('packages/tool/index.mjs'));
    assert(files.includes('src/index.py'));
    assert(files.includes('tests/test_index.py'));
    assert(files.includes('pyproject.toml'));
    assert(files.includes('.env.example'));
    assert(!files.includes('.env'));
    assert(!files.includes('ignored/visible.ts'));
    assert(!files.includes('docs/archive/OLD.md'));
    assert.equal(shouldIndexPath('node_modules/a/index.js'), false);
    assert.equal(shouldIndexPath('src/main.go'), true);
    assert.equal(shouldIndexPath('crates/app/src/lib.rs'), true);
    assert.equal(shouldIndexPath('Dockerfile'), true);
  });

  it('builds graph nodes and bounded neighborhoods', () => {
    const root = fixture();
    const index = buildIndex(root);
    const summary = graphSummary(index);
    assert.equal(index.schemaVersion, CACHE_VERSION);
    assert.equal(typeof index.incremental.elapsedMs, 'number');
    assert(summary.nodes > 0);
    assert(summary.edges > 0);
    assert.equal(summary.byType.package >= 2, true);
    assert.equal(summary.byRelation.imports >= 1, true);
    assert.equal(summary.byRelation.exports >= 1, true);
    assert.equal(summary.byRelation.handles_command >= 1, true);
    assert.equal(summary.byRelation.includes_resource >= 1, true);
    assert.equal(summary.byType.test >= 1, true);
    assert(index.graph.nodes.some((node) => node.id === 'command:load'));
    assert(index.graph.nodes.some((node) => node.id === 'export:packages/tool/index.mjs#run'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:packages/tool/index.mjs' && edge.target === 'command:load' && edge.relation === 'handles_command' && edge.confidence === 'EXTRACTED'));
    assert(index.graph.edges.some((edge) => edge.source === 'test:packages/tool/index.test.mjs' && edge.relation === 'tests' && edge.confidence === 'INFERRED'));
    assert(!index.graph.nodes.some((node) => node.id === 'symbol:packages/tool/index.mjs#hidden'));
    const related = neighborhood(index, 'packages/tool/index.mjs');
    assert(related.some((node) => node.id === 'file:packages/tool/index.mjs'));
    assert(related.length <= 25);
    const impact = buildImpactReport(index, 'packages/tool/index.mjs');
    assert(impact.groups.commands.items.some((item) => item.id === 'command:load'));
    assert(impact.groups.files.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    assert.equal(impact.groups.docs.items.length, 0);
    const communities = buildCommunities(index, { communities: 3, items: 3 });
    assert(communities.total > 0);
    assert(['leiden', 'deterministic-domain-grouping'].includes(communities.method));
    assert.equal(typeof communities.fallback, 'boolean');
  });

  it('can build a graph directly from selected files', () => {
    const root = fixture();
    const graph = buildGraph(root, [join(root, 'docs/README.md'), join(root, 'packages/tool/package.json')]);
    assert(graph.nodes.some((node) => node.type === 'heading' && node.title === 'Docs'));
    assert(graph.edges.some((edge) => edge.relation === 'declares_package'));
  });

  it('keeps generated Claude Code and Codex load guidance snapshot-first', () => {
    const repoRoot = resolve('..', '..');
    for (const file of [
      'packages/claude-code/commands/dd/load.md',
      'packages/claude-code/skills/project-load/SKILL.md',
      'packages/codex/skills/project-load/SKILL.md',
    ]) {
      const content = readFileSync(join(repoRoot, file), 'utf8');
      assert.match(content, /dotdotgod load-snapshot <root> --json/);
      assert.match(content, /docs\/archive\/README\.md/);
      assert.match(content, /Do not scan archive bodies by default/);
      assert.match(content, /manual README-index fallback/);
    }
  });
});
