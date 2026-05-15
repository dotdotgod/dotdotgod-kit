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
  buildMemoryAreas,
  buildIndex,
  collectIndexFiles,
  extractAnchors,
  extractDotdotgodTraceabilityBlocks,
  extractLinks,
  graphSummary,
  headingToAnchor,
  isKebabCase,
  isReadmeIndexPath,
  isUpperSnakeMarkdown,
  memoryAreaForPath,
  memoryRoleForPath,
  neighborhood,
  readMemoryConfig,
  requiresTraceability,
  retrievalPriorityForPath,
  shouldIndexPath,
  validateTraceabilityBlock,
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
  writeFileSync(join(root, 'docs/spec/FEATURE.md'), '# Feature\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/tool/index.mjs"],\n  "verifiedBy": ["packages/tool/index.test.mjs"],\n  "relatedDocs": ["docs/test/README.md"],\n  "verificationCommands": ["node --test packages/tool/index.test.mjs"]\n}\n```\n');
  mkdirSync(join(root, 'docs/test'), { recursive: true });
  writeFileSync(join(root, 'docs/test/README.md'), '# Tests\n');
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

  it('extracts and validates dotdotgod traceability blocks', () => {
    const root = fixture();
    const content = readFileSync(join(root, 'docs/spec/FEATURE.md'), 'utf8');
    const blocks = extractDotdotgodTraceabilityBlocks(content);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].data.kind, 'spec');
    assert.deepEqual(validateTraceabilityBlock(blocks[0].data, root, join(root, 'docs/spec/FEATURE.md')), []);
    const errors = validateTraceabilityBlock({ kind: 'spec', implementedBy: 'bad', verifiedBy: [], relatedDocs: [], verificationCommands: [] }, root, join(root, 'docs/spec/BAD.md'));
    assert.equal(errors[0].code, 'TRACEABILITY_INVALID_FIELD');
    assert.match(errors[0].message, /Property guidance/);

    const invalid = validateTraceabilityBlock({ kind: 'feature', implementedBy: ['../escape'], verifiedBy: ['missing.test.mjs'], relatedDocs: [], verificationCommands: [''] }, root, join(root, 'docs/spec/BAD.md'));
    assert(invalid.some((error) => error.code === 'TRACEABILITY_INVALID_KIND' && /Property guidance/.test(error.message)));
    assert(invalid.some((error) => error.code === 'TRACEABILITY_INVALID_PATH'));
    assert(invalid.some((error) => error.code === 'TRACEABILITY_MISSING_TARGET'));
    assert(invalid.some((error) => error.code === 'TRACEABILITY_INVALID_COMMAND'));
  });

  it('classifies dotdotgod memory paths for deterministic retrieval hints', () => {
    assert.equal(memoryAreaForPath('AGENTS.md'), 'rules');
    assert.equal(memoryRoleForPath('docs/spec/README.md'), 'behavior-truth');
    assert.equal(memoryAreaForPath('docs/arch/CODE_CONVENTIONS.md'), 'architecture');
    assert.equal(memoryAreaForPath('docs/test/README.md'), 'test');
    assert.equal(memoryAreaForPath('docs/plan/task/README.md'), 'active-plan');
    assert.equal(memoryAreaForPath('docs/archive/README.md'), 'archive-map');
    assert.equal(isReadmeIndexPath('docs/spec/README.md'), true);
    assert(retrievalPriorityForPath('docs/plan/task/README.md') > retrievalPriorityForPath('packages/tool/index.mjs'));
  });

  it('loads optional memory area config for shared/local and fresh/stale policy', () => {
    const root = fixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      memory: {
        areas: [
          { id: 'docs-shared', label: 'Shared Docs', paths: ['docs/spec/**'], scope: 'shared', freshness: 'fresh', role: 'behavior-truth', priority: 80, includeBodiesByDefault: true },
          { id: 'local-history', label: 'Local History', paths: ['docs/archive/**'], scope: 'local', freshness: 'stale', role: 'historical-memory-body', priority: 10, includeBodiesByDefault: false },
        ],
      },
    }, null, 2));
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.equal(memoryAreaForPath('docs/spec/FEATURE.md', config), 'docs-shared');
    assert.equal(memoryAreaForPath('docs/archive/OLD.md', config), 'local-history');
    assert.equal(shouldIndexPath('docs/archive/OLD.md', config), false);
    assert.equal(shouldIndexPath('docs/spec/FEATURE.md', config), true);
  });

  it('loads configurable traceability scope with array path settings', () => {
    const root = fixture();
    assert.equal(requiresTraceability('docs/spec/FEATURE.md'), true);
    assert.equal(requiresTraceability('docs/spec/README.md'), false);
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      traceability: {
        required: ['docs/product/**', 'docs/requirements/**'],
        exclude: ['**/README.md', 'docs/product/DRAFT.md'],
      },
    }, null, 2));
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.deepEqual(config.traceability.required, ['docs/product/**', 'docs/requirements/**']);
    assert.equal(requiresTraceability('docs/product/FEATURE.md', config), true);
    assert.equal(requiresTraceability('docs/requirements/REQ.md', config), true);
    assert.equal(requiresTraceability('docs/product/README.md', config), false);
    assert.equal(requiresTraceability('docs/product/DRAFT.md', config), false);
    assert.equal(requiresTraceability('docs/spec/FEATURE.md', config), false);
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
    assert.equal(summary.byType.memory_area >= 1, true);
    assert.equal(summary.byRelation.imports >= 1, true);
    assert.equal(summary.byRelation.exports >= 1, true);
    assert.equal(summary.byRelation.handles_command >= 1, true);
    assert.equal(summary.byRelation.includes_resource >= 1, true);
    assert.equal(summary.byRelation.routes_to >= 1, true);
    assert.equal(summary.byRelation.belongs_to_area >= 1, true);
    assert.equal(summary.byType.test >= 1, true);
    assert(index.graph.nodes.some((node) => node.id === 'command:load'));
    assert(index.graph.nodes.some((node) => node.id === 'memory_area:spec' && node.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'file:docs/spec/README.md' && node.memoryArea === 'spec' && node.retrieval?.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'export:packages/tool/index.mjs#run'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:packages/tool/index.mjs' && edge.target === 'command:load' && edge.relation === 'handles_command' && edge.confidence === 'EXTRACTED'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/README.md' && edge.target === 'file:docs/spec/README.md' && edge.relation === 'routes_to' && edge.confidence === 'CURATED_INDEX'));
    assert(index.graph.edges.some((edge) => edge.source === 'test:packages/tool/index.test.mjs' && edge.relation === 'tests' && edge.confidence === 'INFERRED'));
    assert(!index.graph.nodes.some((node) => node.id === 'symbol:packages/tool/index.mjs#hidden'));
    const related = neighborhood(index, 'packages/tool/index.mjs');
    assert(related.some((node) => node.id === 'file:packages/tool/index.mjs'));
    assert(related.length <= 25);
    const impact = buildImpactReport(index, 'packages/tool/index.mjs');
    assert(impact.groups.commands.items.some((item) => item.id === 'command:load'));
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    assert(impact.related.some((item) => item.id === 'file:packages/tool/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert(impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/FEATURE.md'));
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    const communities = buildCommunities(index, { communities: 3, items: 3 });
    assert(communities.total > 0);
    assert(['leiden', 'deterministic-domain-grouping'].includes(communities.method));
    assert.equal(typeof communities.fallback, 'boolean');
    const memoryAreas = buildMemoryAreas(index, { items: 2 });
    assert(memoryAreas.areas.some((area) => area.area === 'spec' && area.role === 'behavior-truth' && area.files.includes('docs/spec/README.md')));
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
