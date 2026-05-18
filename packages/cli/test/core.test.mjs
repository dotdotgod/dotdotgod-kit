import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  CACHE_VERSION,
  addDeterministicSemanticEdges,
  buildCommunities,
  buildGraph,
  buildImpactReport,
  buildMemoryAreas,
  buildIndex,
  buildCompactImpactReport,
  collectIndexFiles,
  defaultDotdotgodConfigData,
  defaultDotdotgodConfigText,
  defaultMemoryConfig,
  detectCommandGuidance,
  detectPackageManager,
  extractAnchors,
  extractBracketReferences,
  extractFuzzyReferences,
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
  normalizeReferenceAlias,
  readMemoryConfig,
  resolveReferenceCandidates,
  requiresTraceability,
  retrievalPriorityForPath,
  shouldIndexPath,
  validateMemoryConfigData,
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
  writeFileSync(join(root, 'packages/tool/index.mjs'), "const fixture = 'traceability-backed tool implementation';\nvoid fixture;\n");
  writeFileSync(join(root, 'packages/tool/index.test.mjs'), "const fixtureTest = 'traceability-backed verification';\nvoid fixtureTest;\n");
  return root;
}

function writeFixtureFile(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function writeFixtureJson(root, path, value) {
  writeFixtureFile(root, path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeImpactRankingFixture(root) {
  writeFixtureFile(root, 'docs/spec/ROUTE_PLANNER.md', '# Route Planner Tools\n\n## Route Planner Tools\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/route-planner/index.mjs"],\n  "verifiedBy": ["packages/route-planner/route-planner.test.mjs"],\n  "relatedDocs": ["docs/arch/ROUTE_PLANNER_ARCH.md"],\n  "verificationCommands": ["pnpm --filter @fixture/route-planner test"]\n}\n```\n');
  writeFixtureFile(root, 'docs/arch/ROUTE_PLANNER_ARCH.md', '# Route Planner Architecture\n');
  writeFixtureFile(root, 'docs/arch/ROUTE_PLANNER_SEMANTIC.md', '# Route Planner Design Notes\n\nSemantic-only route planner notes.\n');
  writeFixtureFile(root, 'docs/arch/ROUTE_PLANNER_PACKAGE.md', '# Route Planner Package\n');
  writeFixtureFile(root, 'docs/arch/POLICY_AUDITOR_OVERVIEW.md', '# Policy Auditor Overview\n');
  writeFixtureFile(root, 'docs/arch/POLICY_AUDITOR_SCENARIOS.md', '# Policy Auditor Scenarios\n');
  writeFixtureFile(root, 'docs/arch/POLICY_AUDITOR_REFERENCE.md', '# Policy Auditor Reference\n');
  writeFixtureFile(root, 'docs/archive/plan/route-planner-old/README.md', '# Route Planner Archive\n');
  writeFixtureFile(root, 'packages/route-planner/package.json', JSON.stringify({ name: '@fixture/route-planner', files: ['route-planner-assets'], bin: { 'route-planner': './index.mjs' }, dependencies: { 'route-planner-core': '1.0.0' } }, null, 2));
  writeFixtureFile(root, 'packages/route-planner/index.mjs', "const routePlannerFixture = 'traceability-backed route planner implementation';\nvoid routePlannerFixture;\n");
  writeFixtureFile(root, 'packages/route-planner/helper.mjs', "const routePlannerHelper = 'package metadata helper';\nvoid routePlannerHelper;\n");
  writeFixtureFile(root, 'packages/route-planner/neighbor.mjs', "const routePlannerNeighbor = 'package metadata neighbor';\nvoid routePlannerNeighbor;\n");
  writeFixtureFile(root, 'packages/route-planner/route-planner.test.mjs', "const routePlannerTest = 'traceability-backed verification';\nvoid routePlannerTest;\n");
  writeFixtureFile(root, 'packages/policy-auditor/notes.mjs', '// policy auditor notes only; no declarations needed for semantic path matching\n');
}

function semanticEdges(graph, source, relation) {
  return graph.edges.filter((edge) => edge.confidence === 'INFERRED_LEXICAL_SEMANTIC' && (!source || edge.source === source) && (!relation || edge.relation === relation));
}

function itemById(report, id) {
  return report.related.find((item) => item.id === id);
}

function rankOf(report, id) {
  return report.related.findIndex((item) => item.id === id);
}

function cloneConfigWithImpactRanking(impactRanking = {}) {
  const config = defaultMemoryConfig();
  config.impactRanking = {
    ...config.impactRanking,
    ...impactRanking,
    weights: { ...config.impactRanking.weights, ...(impactRanking.weights ?? {}) },
    ppr: { ...config.impactRanking.ppr, ...(impactRanking.ppr ?? {}) },
    relationWeights: { ...config.impactRanking.relationWeights, ...(impactRanking.relationWeights ?? {}) },
    semantic: { ...config.impactRanking.semantic, ...(impactRanking.semantic ?? {}) },
  };
  return config;
}

function fencedBlocks(markdown, language) {
  return [...markdown.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)]
    .filter((match) => match[1].trim().split(/\s+/)[0] === language)
    .map((match) => match[2].trim());
}

function commandStringsFromHookConfig(config) {
  return Object.values(config.hooks ?? {}).flatMap((groups) => groups.flatMap((group) => (group.hooks ?? []).map((hook) => hook.command).filter(Boolean)));
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

  it('extracts prompt references and normalizes aliases', () => {
    assert.deepEqual(extractBracketReferences('Update [[PLAN_MODE]] and [[HOOKS|hook docs]]'), [
      { raw: '[[PLAN_MODE]]', target: 'PLAN_MODE', label: undefined },
      { raw: '[[HOOKS|hook docs]]', target: 'HOOKS', label: 'hook docs' },
    ]);
    assert.equal(normalizeReferenceAlias('Plan Mode.md'), normalizeReferenceAlias('PLAN_MODE'));
    assert.equal(normalizeReferenceAlias('docs/spec/PLAN_MODE.md'), 'docs/spec/planmode');
  });

  it('extracts conservative fuzzy references from natural prompts', () => {
    const root = fixture();
    writeFixtureFile(root, 'docs/spec/PLAN_MODE.md', '# Plan Mode\n');
    writeFixtureFile(root, 'docs/test/HOOKS.md', '# Hooks\n');
    const index = buildIndex(root);

    assert.deepEqual(extractFuzzyReferences('PLAN_MODE 수정하자', index).map((item) => item.target), ['PLAN_MODE']);
    assert(extractFuzzyReferences('Update hooks docs', index).some((item) => item.target === 'HOOKS'));
    assert.deepEqual(extractFuzzyReferences('hello world', index), []);
    assert.deepEqual(extractFuzzyReferences('Update [[PLAN_MODE]] and PLAN_MODE', index, { existingTargets: ['PLAN_MODE'] }), []);
  });

  it('loads configurable fuzzy low-signal reference expansion policy', () => {
    const root = fixture();
    writeFixtureFile(root, 'docs/spec/VERSION.md', '# Version Policy\n');
    writeFixtureFile(root, 'docs/spec/ISSUE.md', '# Issue Policy\n');
    const defaultIndex = buildIndex(root);

    assert(defaultMemoryConfig().referenceExpansion.fuzzy.lowSignal.terms.includes('version'));
    assert.deepEqual(extractFuzzyReferences('Update version docs', defaultIndex), []);

    writeFixtureJson(root, 'dotdotgod.config.json', {
      referenceExpansion: { fuzzy: { lowSignal: { add: ['issue'], remove: ['version'] } } },
    });
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert(!config.referenceExpansion.fuzzy.lowSignal.terms.includes('version'));
    assert(config.referenceExpansion.fuzzy.lowSignal.terms.includes('issue'));

    const configuredIndex = buildIndex(root);
    assert(extractFuzzyReferences('Update version docs', configuredIndex, { memoryConfig: config }).some((item) => item.target === 'VERSION'));
    assert.deepEqual(extractFuzzyReferences('Update issue docs', configuredIndex, { memoryConfig: config }), []);

    const invalid = validateMemoryConfigData({ referenceExpansion: { fuzzy: { lowSignal: { add: ['ok', ''] } } } });
    assert(invalid.some((error) => error.code === 'REFERENCE_EXPANSION_CONFIG_INVALID_LOW_SIGNAL_TERMS'));
  });

  it('resolves references from indexed graph nodes with archive exclusion', () => {
    const root = fixture();
    writeFixtureFile(root, 'docs/spec/PLAN_MODE.md', '# Plan Mode\n\n## Tool Settings\n');
    writeFixtureFile(root, 'docs/archive/plan/plan-mode-old/README.md', '# Plan Mode Archive\n');
    const index = buildIndex(root);
    index.graph.nodes.push({ id: 'file:docs/archive/plan/plan-mode-old/README.md', type: 'file', path: 'docs/archive/plan/plan-mode-old/README.md', retrievalPriority: 20 });

    const planMode = resolveReferenceCandidates(index, 'PLAN_MODE');
    assert.equal(planMode.top.path, 'docs/spec/PLAN_MODE.md');
    assert(planMode.top.score > 90);
    assert(planMode.top.reasons.includes('memory_priority'));

    const heading = resolveReferenceCandidates(index, 'PLAN_MODE#Tool Settings');
    assert.equal(heading.top.type, 'heading');
    assert.equal(heading.top.path, 'docs/spec/PLAN_MODE.md');

    const withoutArchive = resolveReferenceCandidates(index, 'plan mode old');
    assert.equal(withoutArchive.candidates.some((item) => item.path.startsWith('docs/archive/plan/')), false);

    const withArchive = resolveReferenceCandidates(index, 'plan mode old', { includeArchive: true });
    assert.equal(withArchive.candidates.some((item) => item.path.startsWith('docs/archive/plan/')), true);
  });

  it('marks close reference matches as ambiguous and bounds results', () => {
    const root = fixture();
    writeFixtureFile(root, 'docs/spec/HOOKS.md', '# Hooks\n');
    writeFixtureFile(root, 'docs/test/HOOKS.md', '# Hooks\n');
    const index = buildIndex(root);
    const result = resolveReferenceCandidates(index, 'HOOKS', { maxResults: 1 });
    assert.equal(result.candidates.length, 1);
    assert(result.omitted >= 1);
    const ambiguous = resolveReferenceCandidates(index, 'HOOKS', { maxResults: 5 });
    assert.equal(ambiguous.ambiguous, true);
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

  it('serializes the built-in policy as a valid project config template', () => {
    const data = defaultDotdotgodConfigData();
    assert.deepEqual(validateMemoryConfigData(data), []);
    assert(data.memory.areas.some((area) => area.id === 'archive-body' && area.includeBodiesByDefault === false));
    assert.deepEqual(data.traceability.required, ['docs/spec/**']);
    assert.equal(data.validation.markdown.maxLines, 200);
    assert.equal(data.validation.markdown.maxChars, 10000);
    assert.deepEqual(data.validation.markdown.exclude, []);
    assert.equal(data.impactRanking.preset, 'balanced');
    assert.deepEqual(data.referenceExpansion.fuzzy.lowSignal, { add: [], remove: [] });
    assert(JSON.parse(defaultDotdotgodConfigText()).referenceExpansion.fuzzy.lowSignal);

    const root = fixture();
    writeFixtureFile(root, 'dotdotgod.config.json', defaultDotdotgodConfigText());
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.equal(memoryAreaForPath('docs/archive/OLD.md', config), 'archive-body');
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

  it('detects command guidance for local source, project install, and missing CLI projects', () => {
    const local = fixture();
    mkdirSync(join(local, 'packages/cli/bin'), { recursive: true });
    writeFileSync(join(local, 'packages/cli/bin/dotdotgod.mjs'), '#!/usr/bin/env node\n');
    writeFileSync(join(local, 'package.json'), JSON.stringify({ name: 'dotdotgod-workspace', packageManager: 'pnpm@10.0.0', scripts: { verify: 'pnpm run verify' } }, null, 2));
    assert.equal(detectPackageManager(local), 'pnpm');
    assert.deepEqual(detectCommandGuidance(local), {
      source: 'local-source',
      packageManager: 'pnpm',
      install: null,
      validate: 'node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory',
      loadSnapshot: 'node packages/cli/bin/dotdotgod.mjs load-snapshot . --json',
      index: 'node packages/cli/bin/dotdotgod.mjs index . --json',
      status: 'node packages/cli/bin/dotdotgod.mjs status . --json',
      verify: 'pnpm run verify',
    });

    const installed = fixture();
    writeFileSync(join(installed, 'package.json'), JSON.stringify({ name: 'installed', devDependencies: { '@dotdotgod/cli': '^0.1.0' } }, null, 2));
    assert.equal(detectCommandGuidance(installed).source, 'project-install');
    assert.equal(detectCommandGuidance(installed).validate, 'npx dotdotgod validate .');

    const missing = fixture();
    writeFileSync(join(missing, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
    const guidance = detectCommandGuidance(missing);
    assert.equal(guidance.source, 'missing-install');
    assert.equal(guidance.packageManager, 'pnpm');
    assert.equal(guidance.install, 'npm install -D @dotdotgod/cli');
    assert.equal(guidance.loadSnapshot, 'npx dotdotgod load-snapshot . --json');
  });

  it('loads configurable impact ranking policy with preset and partial overrides', () => {
    const root = fixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      impactRanking: {
        preset: 'docs-first',
        weights: { semantic: 7 },
        ppr: { enabled: false },
        semantic: { threshold: 0.4, topKPerFile: 3 },
      },
    }, null, 2));
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.equal(config.impactRanking.preset, 'docs-first');
    assert.equal(config.impactRanking.weights.semantic, 7);
    assert.equal(config.impactRanking.weights.traceability, 35);
    assert.equal(config.impactRanking.ppr.enabled, false);
    assert.equal(config.impactRanking.semantic.threshold, 0.4);
  });

  it('loads configurable markdown validation budgets and exclusions', () => {
    const root = fixture();
    writeFixtureJson(root, 'dotdotgod.config.json', {
      validation: {
        markdown: {
          maxLines: 250,
          maxChars: 12000,
          exclude: ['docs/archive/README.md', 'docs/generated/**'],
        },
      },
    });
    const config = readMemoryConfig(root);
    assert.equal(config.validation.markdown.maxLines, 250);
    assert.equal(config.validation.markdown.maxChars, 12000);
    assert.deepEqual(config.validation.markdown.exclude, ['docs/archive/README.md', 'docs/generated/**']);

    const invalid = validateMemoryConfigData({ validation: { markdown: { maxLines: 0, maxChars: 'bad', exclude: 'docs/archive/README.md' } } }, root);
    const codes = new Set(invalid.map((error) => error.code));
    assert(codes.has('VALIDATION_CONFIG_INVALID_MAX_LINES'));
    assert(codes.has('VALIDATION_CONFIG_INVALID_MAX_CHARS'));
    assert(codes.has('VALIDATION_CONFIG_INVALID_EXCLUDE'));

    writeFixtureJson(root, 'dotdotgod.config.json', { validation: { markdown: { maxLines: 0 } } });
    const fallback = readMemoryConfig(root);
    assert(fallback.errors.some((error) => error.code === 'VALIDATION_CONFIG_INVALID_MAX_LINES'));
    assert.equal(fallback.validation.markdown.maxLines, 200);
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

  it('keeps Claude Code and Codex hook JSON examples parseable with supported events', () => {
    const repoRoot = resolve('../..');
    const docs = [
      readFileSync(join(repoRoot, 'packages/claude-code/hooks/README.md'), 'utf8'),
      readFileSync(join(repoRoot, 'packages/codex/hooks/README.md'), 'utf8'),
    ];
    const allowedEvents = new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop']);

    for (const doc of docs) {
      const blocks = fencedBlocks(doc, 'json');
      assert(blocks.length > 0);
      for (const block of blocks) {
        const parsed = JSON.parse(block);
        assert(parsed.hooks && typeof parsed.hooks === 'object');
        for (const [eventName, groups] of Object.entries(parsed.hooks)) {
          assert(allowedEvents.has(eventName), `unexpected hook event: ${eventName}`);
          assert(Array.isArray(groups), `hook event must be an array: ${eventName}`);
          for (const group of groups) {
            assert(Array.isArray(group.hooks), `hook group must include hooks: ${eventName}`);
            for (const hook of group.hooks) {
              assert.equal(hook.type, 'command');
              assert.equal(typeof hook.command, 'string');
              assert(hook.command.length > 0);
            }
          }
        }
      }
    }
  });

  it('keeps hook examples within dotdotgod safety policy', () => {
    const repoRoot = resolve('../..');
    const claudeHooks = readFileSync(join(repoRoot, 'packages/claude-code/hooks/README.md'), 'utf8');
    const codexHooks = readFileSync(join(repoRoot, 'packages/codex/hooks/README.md'), 'utf8');
    const allExampleText = [...fencedBlocks(claudeHooks, 'json'), ...fencedBlocks(codexHooks, 'json'), ...fencedBlocks(codexHooks, 'toml')].join('\n');

    assert.doesNotMatch(allExampleText, /pnpm run verify/);
    assert.doesNotMatch(allExampleText, /dotdotgod index\b/);
    assert.doesNotMatch(allExampleText, /mv\s+docs\/plan/);
    assert.doesNotMatch([...fencedBlocks(codexHooks, 'json'), ...fencedBlocks(codexHooks, 'toml')].join('\n'), /dotdotgod status \. --json/);
    assert.match(codexHooks, /Codex stop hooks need Codex-compatible hook output/);
    assert.match(codexHooks, /cache-aware/);
    assert.match(codexHooks, /UserPromptSubmit/);
    assert.match(codexHooks, /dotdotgod graph impact \. --changed <path> --compact/);
    assert.match(codexHooks, /complete target file list/);
    assert.match(codexHooks, /every target file/);
    assert.match(claudeHooks, /UserPromptSubmit` does not support matchers/);
    assert.match(claudeHooks, /submitted `prompt` field/);
    assert.match(claudeHooks, /dotdotgod graph impact \. --changed <path> --compact/);
    assert.match(claudeHooks, /every target file/);
    assert.match(claudeHooks, /PostToolBatch/);
    assert.match(claudeHooks, /StopFailure/);
    assert.match(claudeHooks, /SessionEnd/);
    assert.match(claudeHooks, /Plan:[\s\S]*Implement:[\s\S]*Verify:[\s\S]*Review:[\s\S]*Archive:/);
    assert.match(claudeHooks, /\"args\": \[\"\$\{CLAUDE_PROJECT_DIR\}/);
    assert.doesNotMatch(claudeHooks, /\"PrePlanMode\"/);
    assert.doesNotMatch(claudeHooks, /\"PostPlanMode\"/);
    assert.match(claudeHooks, /explicitly in plan-only mode/);
    assert.match(codexHooks, /explicitly in plan-only mode/);
  });

  it('keeps Codex TOML hook examples in the documented shape', () => {
    const codexHooks = readFileSync(join(resolve('../..'), 'packages/codex/hooks/README.md'), 'utf8');
    const blocks = fencedBlocks(codexHooks, 'toml');
    assert(blocks.length > 0);
    assert(blocks.some((block) => /\[\[hooks\.PostToolUse\]\]/.test(block)));
    assert(blocks.some((block) => /\[\[hooks\.PostToolUse\.hooks\]\]/.test(block)));
    assert(blocks.some((block) => /type\s*=\s*"command"/.test(block)));
  });
});

describe('impact ranking unit coverage', () => {
  it('resolves presets, partial overrides, and invalid config families', () => {
    const defaults = readMemoryConfig(fixture()).impactRanking;
    assert.equal(defaults.preset, 'balanced');
    assert.equal(defaults.weights.traceability, 30);

    const docsFirstRoot = fixture();
    writeFixtureJson(docsFirstRoot, 'dotdotgod.config.json', { impactRanking: { preset: 'docs-first' } });
    const docsFirst = readMemoryConfig(docsFirstRoot).impactRanking;
    assert.equal(docsFirst.preset, 'docs-first');
    assert(docsFirst.weights.traceability > defaults.weights.traceability);
    assert(docsFirst.weights.memoryPolicy > defaults.weights.memoryPolicy);

    const codeRoot = fixture();
    writeFixtureJson(codeRoot, 'dotdotgod.config.json', { impactRanking: { preset: 'code-proximity' } });
    assert(readMemoryConfig(codeRoot).impactRanking.weights.proximity > defaults.weights.proximity);

    const testRoot = fixture();
    writeFixtureJson(testRoot, 'dotdotgod.config.json', { impactRanking: { preset: 'test-focused' } });
    assert(readMemoryConfig(testRoot).impactRanking.weights.verification > defaults.weights.verification);

    const archiveRoot = fixture();
    writeFixtureJson(archiveRoot, 'dotdotgod.config.json', { impactRanking: { preset: 'archive-aware' } });
    assert(Math.abs(readMemoryConfig(archiveRoot).impactRanking.weights.archivePenalty) < Math.abs(defaults.weights.archivePenalty));

    const partialRoot = fixture();
    writeFixtureJson(partialRoot, 'dotdotgod.config.json', {
      impactRanking: {
        preset: 'docs-first',
        weights: { semantic: 7 },
        relationWeights: { related_doc: 9 },
        traceabilityBoosts: { implemented_by: 33 },
        ppr: { enabled: false },
        semantic: { threshold: 0.4, topKPerFile: 3 },
      },
    });
    const partial = readMemoryConfig(partialRoot).impactRanking;
    assert.equal(partial.weights.semantic, 7);
    assert.equal(partial.weights.traceability, 35);
    assert.equal(partial.relationWeights.related_doc, 9);
    assert.equal(partial.relationWeights.implemented_by, defaults.relationWeights.implemented_by);
    assert.equal(partial.traceabilityBoosts.implemented_by, 33);
    assert.equal(partial.traceabilityBoosts.verified_by, defaults.traceabilityBoosts.verified_by);
    assert.equal(partial.ppr.enabled, false);
    assert.equal(partial.semantic.threshold, 0.4);

    const invalidData = {
      impactRanking: {
        preset: 'wild',
        weights: { unknown: 1 },
        relationWeights: { unknown: 1 },
        traceabilityBoosts: { unknown: 1 },
        verificationBoosts: { verified_by: 'bad' },
        ppr: { enabled: 'yes', damping: 2, iterations: 0, tolerance: 2 },
        semantic: { enabled: 'yes', threshold: 2, topKPerFile: 21, includeArchiveBodies: 'yes', signals: ['embedding'] },
      },
    };
    const errors = validateMemoryConfigData(invalidData, fixture());
    const codes = new Set(errors.map((error) => error.code));
    for (const code of ['IMPACT_RANKING_CONFIG_INVALID_PRESET', 'IMPACT_RANKING_CONFIG_INVALID_WEIGHTS', 'IMPACT_RANKING_CONFIG_INVALID_RELATION_WEIGHTS', 'IMPACT_RANKING_CONFIG_INVALID_BOOSTS', 'IMPACT_RANKING_CONFIG_INVALID_PPR', 'IMPACT_RANKING_CONFIG_INVALID_SEMANTIC']) {
      assert(codes.has(code), `missing ${code}`);
    }

    const fallbackRoot = fixture();
    writeFixtureJson(fallbackRoot, 'dotdotgod.config.json', invalidData);
    const fallback = readMemoryConfig(fallbackRoot);
    assert(fallback.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_PRESET'));
    assert.equal(fallback.impactRanking.preset, 'balanced');
  });

  it('creates deterministic semantic edges for lexical, package, threshold, top-k, and archive rules', () => {
    const root = fixture();
    writeImpactRankingFixture(root);
    const index = buildIndex(root);
    const graph = index.graph;

    const pathEdge = semanticEdges(graph, 'file:packages/policy-auditor/notes.mjs', 'semantic_similarity').find((edge) => edge.target === 'file:docs/arch/POLICY_AUDITOR_OVERVIEW.md');
    assert(pathEdge);
    assert.equal(pathEdge.confidence, 'INFERRED_LEXICAL_SEMANTIC');
    assert.equal(typeof pathEdge.score, 'number');
    assert(pathEdge.matchedTerms.includes('policy'));
    assert(pathEdge.signals.includes('path') || pathEdge.signals.includes('filename'));

    const packageEdge = semanticEdges(graph, 'file:packages/route-planner/package.json', 'mentions_package').find((edge) => edge.target === 'file:docs/arch/ROUTE_PLANNER_PACKAGE.md');
    assert(packageEdge);
    assert(packageEdge.signals.includes('package'));

    const thresholdRoot = fixture();
    writeImpactRankingFixture(thresholdRoot);
    writeFixtureJson(thresholdRoot, 'dotdotgod.config.json', { impactRanking: { semantic: { threshold: 0.75 } } });
    const thresholdIndex = buildIndex(thresholdRoot);
    assert(!semanticEdges(thresholdIndex.graph, 'file:packages/policy-auditor/notes.mjs').some((edge) => edge.target === 'file:docs/arch/POLICY_AUDITOR_OVERVIEW.md'));

    const topKRoot = fixture();
    writeImpactRankingFixture(topKRoot);
    writeFixtureJson(topKRoot, 'dotdotgod.config.json', { impactRanking: { semantic: { topKPerFile: 1 } } });
    const topKIndex = buildIndex(topKRoot);
    assert.equal(semanticEdges(topKIndex.graph, 'file:packages/policy-auditor/notes.mjs').length, 1);

    const archiveSource = join(root, 'packages/route-planner/index.mjs');
    const archiveDoc = join(root, 'docs/archive/plan/route-planner-old/README.md');
    const archiveExcluded = addDeterministicSemanticEdges(buildGraph(root, [archiveSource, archiveDoc], defaultMemoryConfig()), defaultMemoryConfig());
    assert(!semanticEdges(archiveExcluded, 'file:packages/route-planner/index.mjs').some((edge) => edge.target === 'file:docs/archive/plan/route-planner-old/README.md'));

    const includeArchive = cloneConfigWithImpactRanking({ semantic: { includeArchiveBodies: true } });
    const archiveIncluded = addDeterministicSemanticEdges(buildGraph(root, [archiveSource, archiveDoc], includeArchive), includeArchive);
    assert(semanticEdges(archiveIncluded, 'file:packages/route-planner/index.mjs').some((edge) => edge.target === 'file:docs/archive/plan/route-planner-old/README.md'));
  });

  it('scores seed, traceability, verification, semantic, memory, archive penalty, and score caps', () => {
    const root = fixture();
    writeImpactRankingFixture(root);
    const report = buildImpactReport(buildIndex(root), 'packages/route-planner/index.mjs', { related: 50 });

    const seed = itemById(report, 'file:packages/route-planner/index.mjs');
    assert.equal(rankOf(report, seed.id), 0);
    assert.equal(seed.impactScore, 100);
    assert.equal(seed.scoreBreakdown.seed, 100);

    const spec = itemById(report, 'file:docs/spec/ROUTE_PLANNER.md');
    const semanticOnly = itemById(report, 'file:docs/arch/ROUTE_PLANNER_SEMANTIC.md');
    assert(spec);
    assert(semanticOnly);
    assert(spec.scoreBreakdown.traceability > 0);
    assert(spec.scoreBreakdown.memoryPolicy > semanticOnly.scoreBreakdown.memoryPolicy);
    assert(semanticOnly.scoreBreakdown.semantic > 0);
    assert(rankOf(report, spec.id) < rankOf(report, semanticOnly.id));

    const compact = buildCompactImpactReport(report);
    assert.equal(compact.compact, true);
    assert.equal(compact.related.length <= 10, true);
    assert.equal(compact.ranking.weights, undefined);
    assert(compact.groups.docs.items.some((item) => item.id === 'file:docs/spec/ROUTE_PLANNER.md'));
    assert.equal(typeof compact.quality.semanticOnlyTop10, 'number');

    const verifiedTest = itemById(report, 'file:packages/route-planner/route-planner.test.mjs');
    assert(verifiedTest.scoreBreakdown.verification > 0);

    const archivePath = 'docs/archive/plan/route-planner-old/README.md';
    const archiveIndex = {
      memoryConfig: defaultMemoryConfig(),
      graph: {
        nodes: [
          { id: 'file:packages/archive-seed.mjs', type: 'file', path: 'packages/archive-seed.mjs' },
          { id: `file:${archivePath}`, type: 'file', path: archivePath, retrieval: { area: 'archive-body', priority: 20, freshness: 'stale', includeBodiesByDefault: false, signals: [] } },
        ],
        edges: [{ source: 'file:packages/archive-seed.mjs', target: `file:${archivePath}`, relation: 'semantic_similarity' }],
      },
    };
    const archiveItem = itemById(buildImpactReport(archiveIndex, 'packages/archive-seed.mjs'), `file:${archivePath}`);
    assert(archiveItem.scoreBreakdown.archivePenalty < 0);
    assert(archiveItem.scoreBreakdown.freshness < 0);

    const capIndex = {
      memoryConfig: defaultMemoryConfig(),
      graph: {
        nodes: [
          { id: 'file:packages/cap/seed.mjs', type: 'file', path: 'packages/cap/seed.mjs' },
          { id: 'file:docs/spec/CAP.md', type: 'file', path: 'docs/spec/CAP.md', retrieval: { area: 'spec', priority: 100, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
        ],
        edges: ['implemented_by', 'verified_by', 'related_doc', 'verification_command', 'semantic_similarity'].map((relation) => ({ source: 'file:packages/cap/seed.mjs', target: 'file:docs/spec/CAP.md', relation })),
      },
    };
    const capped = itemById(buildImpactReport(capIndex, 'packages/cap/seed.mjs'), 'file:docs/spec/CAP.md');
    assert.equal(capped.impactScore, 100);
    assert.equal(rankOf(buildImpactReport(capIndex, 'packages/cap/seed.mjs'), 'file:packages/cap/seed.mjs'), 0);
  });

  it('uses changed-file PPR, disabled-PPR fallback, relation weights, and grouping compatibility', () => {
    const nodes = [
      { id: 'file:packages/ppr/seed.mjs', type: 'file', path: 'packages/ppr/seed.mjs' },
      { id: 'file:docs/spec/PPR_STRONG.md', type: 'file', path: 'docs/spec/PPR_STRONG.md', retrieval: { area: 'spec', priority: 80, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
      { id: 'file:docs/arch/PPR_WEAK.md', type: 'file', path: 'docs/arch/PPR_WEAK.md', retrieval: { area: 'architecture', priority: 75, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
    ];
    const edges = [
      { source: 'file:packages/ppr/seed.mjs', target: 'file:docs/spec/PPR_STRONG.md', relation: 'implemented_by' },
      { source: 'file:packages/ppr/seed.mjs', target: 'file:docs/arch/PPR_WEAK.md', relation: 'mentions_package' },
    ];
    const report = buildImpactReport({ memoryConfig: defaultMemoryConfig(), graph: { nodes, edges } }, 'packages/ppr/seed.mjs');
    assert(itemById(report, 'file:docs/spec/PPR_STRONG.md').scoreBreakdown.ppr > itemById(report, 'file:docs/arch/PPR_WEAK.md').scoreBreakdown.ppr);

    const disabledConfig = cloneConfigWithImpactRanking({ ppr: { enabled: false } });
    const disabled = buildImpactReport({ memoryConfig: disabledConfig, graph: { nodes, edges } }, 'packages/ppr/seed.mjs');
    assert.equal(disabled.ranking.method, 'policy-score');
    assert(disabled.related.filter((item) => item.id !== 'file:packages/ppr/seed.mjs').every((item) => item.scoreBreakdown.ppr === 0));

    const weightedConfig = cloneConfigWithImpactRanking({ relationWeights: { implemented_by: 1, mentions_package: 20 } });
    const weighted = buildImpactReport({ memoryConfig: weightedConfig, graph: { nodes, edges } }, 'packages/ppr/seed.mjs');
    assert(itemById(weighted, 'file:docs/arch/PPR_WEAK.md').scoreBreakdown.ppr > itemById(weighted, 'file:docs/spec/PPR_STRONG.md').scoreBreakdown.ppr);
    assert.equal(rankOf(weighted, 'file:packages/ppr/seed.mjs'), 0);

    const noisyNodes = [
      { id: 'file:packages/noisy/seed.mjs', type: 'file', path: 'packages/noisy/seed.mjs' },
      { id: 'file:docs/spec/NOISY.md', type: 'file', path: 'docs/spec/NOISY.md', retrieval: { area: 'spec', priority: 80, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
      { id: 'file:docs/arch/NOISY_ARCH.md', type: 'file', path: 'docs/arch/NOISY_ARCH.md', retrieval: { area: 'architecture', priority: 75, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
      { id: 'file:docs/test/NOISY_TEST.md', type: 'file', path: 'docs/test/NOISY_TEST.md', retrieval: { area: 'test', priority: 70, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
      ...['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].map((name) => ({ id: `file:docs/arch/NOISY_${name}.md`, type: 'file', path: `docs/arch/NOISY_${name}.md`, retrieval: { area: 'architecture', priority: 65, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } })),
      { id: 'file:packages/noisy/seed.test.mjs', type: 'file', path: 'packages/noisy/seed.test.mjs' },
      ...['ONE', 'TWO', 'THREE'].map((name) => ({ id: `package_resource:packages/noisy/package.json#files:${name}`, type: 'package_resource', path: 'packages/noisy/package.json', kind: 'files', target: `resource-${name.toLowerCase()}` })),
    ];
    const noisyEdges = [
      { source: 'file:packages/noisy/seed.mjs', target: 'file:docs/spec/NOISY.md', relation: 'related_doc' },
      { source: 'file:packages/noisy/seed.mjs', target: 'file:docs/arch/NOISY_ARCH.md', relation: 'links_to' },
      { source: 'file:packages/noisy/seed.mjs', target: 'file:docs/test/NOISY_TEST.md', relation: 'verified_by' },
      ...['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].map((name) => ({ source: 'file:packages/noisy/seed.mjs', target: `file:docs/arch/NOISY_${name}.md`, relation: 'links_to' })),
      { source: 'file:packages/noisy/seed.mjs', target: 'file:packages/noisy/seed.test.mjs', relation: 'verified_by' },
      ...['ONE', 'TWO', 'THREE'].map((name) => ({ source: 'file:packages/noisy/seed.mjs', target: `package_resource:packages/noisy/package.json#files:${name}`, relation: 'includes_resource' })),
    ];
    const noisy = buildImpactReport({ memoryConfig: defaultMemoryConfig(), graph: { nodes: noisyNodes, edges: noisyEdges } }, 'packages/noisy/seed.mjs', { related: 10 });
    const firstPageNoise = noisy.related.filter((item) => item.id !== 'file:packages/noisy/seed.mjs').slice(0, 10);
    assert.equal(firstPageNoise.filter((item) => item.type === 'package_resource').length <= 2, true);
    const packageResourceRank = rankOf(noisy, 'package_resource:packages/noisy/package.json#files:THREE');
    assert(packageResourceRank === -1 || rankOf(noisy, 'file:docs/spec/NOISY.md') < packageResourceRank);

    const root = fixture();
    writeImpactRankingFixture(root);
    const index = buildIndex(root);
    const sourceReport = buildImpactReport(index, 'packages/route-planner/index.mjs', { related: 50 });
    assert(sourceReport.groups.docs.items.some((item) => item.id === 'file:docs/spec/ROUTE_PLANNER.md'));
    assert(sourceReport.groups.tests.items.some((item) => item.id === 'file:packages/route-planner/route-planner.test.mjs'));
    assert.equal(typeof sourceReport.omittedRelated, 'number');

    const packageReport = buildImpactReport(index, 'packages/route-planner/package.json', { related: 50 });
    assert(packageReport.groups.packageResources.items.some((item) => item.id.startsWith('package_resource:packages/route-planner/package.json#')));
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

  it('builds graph nodes, semantic edges, scores, and bounded neighborhoods', () => {
    const root = fixture();
    mkdirSync(join(root, 'packages/pi/extensions/plan-mode'), { recursive: true });
    writeFileSync(join(root, 'docs/spec/PLAN_MODE.md'), '# Plan Mode Tool Settings\n\n## Plan Mode Tools\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/pi/extensions/plan-mode/utils.ts"],\n  "verifiedBy": ["packages/pi/test/plan-mode-utils.test.ts"],\n  "relatedDocs": ["docs/spec/FEATURE.md"],\n  "verificationCommands": ["pnpm --filter @dotdotgod/pi test"]\n}\n```\n');
    writeFileSync(join(root, 'packages/pi/extensions/plan-mode/utils.ts'), "const planModeTools = ['read'];\nvoid planModeTools;\n");
    const index = buildIndex(root);
    const summary = graphSummary(index);
    assert.equal(index.schemaVersion, CACHE_VERSION);
    assert.equal(typeof index.incremental.elapsedMs, 'number');
    assert(summary.nodes > 0);
    assert(summary.edges > 0);
    assert.equal(summary.byType.package >= 2, true);
    assert.equal(summary.byType.memory_area >= 1, true);
    assert.equal(summary.byRelation.implemented_by >= 1, true);
    assert.equal(summary.byRelation.verified_by >= 1, true);
    assert.equal(summary.byRelation.verification_command >= 1, true);
    assert.equal(summary.byRelation.includes_resource >= 1, true);
    assert.equal(summary.byRelation.routes_to >= 1, true);
    assert.equal(summary.byRelation.belongs_to_area >= 1, true);
    assert.equal(summary.byRelation.semantic_similarity >= 1 || summary.byRelation.mentions_package >= 1, true);
    assert.equal(summary.byType.package_resource >= 1, true);
    assert(index.graph.nodes.some((node) => node.id === 'memory_area:spec' && node.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'file:docs/spec/README.md' && node.memoryArea === 'spec' && node.retrieval?.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'package_resource:packages/tool/package.json#files:files:1' && node.type === 'package_resource'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/spec/FEATURE.md' && edge.target === 'file:packages/tool/index.mjs' && edge.relation === 'implemented_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/spec/FEATURE.md' && edge.target === 'file:packages/tool/index.test.mjs' && edge.relation === 'verified_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/README.md' && edge.target === 'file:docs/spec/README.md' && edge.relation === 'routes_to' && edge.confidence === 'CURATED_INDEX'));
    const related = neighborhood(index, 'packages/tool/index.mjs');
    assert(related.some((node) => node.id === 'file:packages/tool/index.mjs'));
    assert(related.length <= 25);
    const impact = buildImpactReport(index, 'packages/tool/index.mjs');
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    assert(impact.related.some((item) => item.id === 'file:packages/tool/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert.equal(impact.ranking.method, 'personalized-pagerank+policy');
    assert(impact.related.every((item) => typeof item.impactScore === 'number' && item.scoreBreakdown));
    assert(impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/FEATURE.md'));
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    const semanticImpact = buildImpactReport(index, 'packages/pi/extensions/plan-mode/utils.ts');
    assert(semanticImpact.related.some((item) => item.id === 'file:docs/spec/PLAN_MODE.md' && (item.reasons.includes('incoming:semantic_similarity') || item.reasons.includes('incoming:implemented_by'))));
    assert(semanticImpact.related.some((item) => item.scoreBreakdown?.semantic > 0 || item.scoreBreakdown?.traceability > 0));
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
