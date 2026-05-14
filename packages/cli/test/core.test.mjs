import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import {
  buildGraph,
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
  mkdirSync(join(root, 'docs/archive'), { recursive: true });
  mkdirSync(join(root, 'packages/tool/bin'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n');
  writeFileSync(join(root, 'README.md'), '# Fixture\n');
  writeFileSync(join(root, 'docs/README.md'), '# Docs\n[Spec](spec/README.md)\n');
  writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n');
  writeFileSync(join(root, 'docs/archive/README.md'), '# Archive\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture-root', scripts: { verify: 'node --test' } }, null, 2));
  writeFileSync(join(root, 'packages/tool/package.json'), JSON.stringify({ name: '@fixture/tool', bin: { tool: './bin/tool.mjs' }, dependencies: { leftpad: '1.0.0' } }, null, 2));
  writeFileSync(join(root, 'packages/tool/index.mjs'), "import fs from 'node:fs';\nexport function run() { return 'plan-mode:enabled'; }\nconst value = 1;\n");
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
  it('collects curated files and excludes archive bodies', () => {
    const root = fixture();
    writeFileSync(join(root, 'docs/archive/OLD.md'), '# Old\n');
    const files = collectIndexFiles(root).map((file) => file.slice(root.length + 1).replaceAll('\\', '/'));
    assert(files.includes('AGENTS.md'));
    assert(files.includes('docs/archive/README.md'));
    assert(files.includes('packages/tool/index.mjs'));
    assert(!files.includes('docs/archive/OLD.md'));
    assert.equal(shouldIndexPath('node_modules/a/index.js'), false);
  });

  it('builds graph nodes and bounded neighborhoods', () => {
    const root = fixture();
    const index = buildIndex(root);
    const summary = graphSummary(index);
    assert(summary.nodes > 0);
    assert(summary.edges > 0);
    assert.equal(summary.byType.package >= 2, true);
    assert.equal(summary.byRelation.imports >= 1, true);
    const related = neighborhood(index, 'packages/tool/index.mjs');
    assert(related.some((node) => node.id === 'file:packages/tool/index.mjs'));
    assert(related.length <= 25);
  });

  it('can build a graph directly from selected files', () => {
    const root = fixture();
    const graph = buildGraph(root, [join(root, 'docs/README.md'), join(root, 'packages/tool/package.json')]);
    assert(graph.nodes.some((node) => node.type === 'heading' && node.title === 'Docs'));
    assert(graph.edges.some((edge) => edge.relation === 'declares_package'));
  });
});
