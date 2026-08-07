import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  buildChangedFileProfile,
  buildVectorImpactOverlay,
  buildMemoryAreas,
  buildIndex,
  buildCompactImpactReport,
  collectIndexFiles,
  chunkMarkdown,
  defaultDotdotgodConfigData,
  defaultDotdotgodConfigText,
  defaultMemoryConfig,
  detectCommandGuidance,
  detectPackageManager,
  extractAnchors,
  extractBracketReferences,
  extractFirstHeading,
  extractFuzzyReferences,
  extractDotdotgodTraceabilityBlocks,
  extractLinks,
  findTraceabilityLinksRegion,
  graphSummary,
  headingToAnchor,
  isKebabCase,
  isNumberedSeriesFilename,
  isReadmeIndexPath,
  isUpperSnakeMarkdown,
  memoryAreaForPath,
  memoryConfigSummary,
  normalizeReferenceAlias,
  queryDocumentation,
  readMemoryConfig,
  readVectorCache,
  resolveMemoryArea,
  resolveReferenceCandidates,
  renderCompactTraceabilityBlock,
  requiresTraceability,
  shouldIndexPath,
  stripTraceabilityLinksRegion,
  suggestFilenameFromHeading,
  syncTraceabilityLinksInContent,
  validateMemoryConfigData,
  validateTraceabilityBlock,
  validateTraceabilityLinksRegion,
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

  it('detects numbered series filenames via sibling comparison', () => {
    assert.equal(isNumberedSeriesFilename('API_1.md', ['API_1.md', 'API_2.md']), true);
    assert.equal(isNumberedSeriesFilename('API_2.md', ['API_1.md', 'API_2.md']), true);
    assert.equal(isNumberedSeriesFilename('01_AUTH.md', ['01_AUTH.md', '02_AUTH.md']), true);
    assert.equal(isNumberedSeriesFilename('API_1.md', ['API_1.md']), false, 'single file — no sibling');
    assert.equal(isNumberedSeriesFilename('BIZ_SUMMARY.md', ['BIZ_SUMMARY.md', 'BIZ_DETAIL.md']), false, 'no numeric segment');
    assert.equal(isNumberedSeriesFilename('API_V2.md', ['API_V2.md', 'API_V3.md']), false, 'V2 is not pure numeric');
    assert.equal(isNumberedSeriesFilename('AUTH.md', ['AUTH.md', 'OVERVIEW.md']), false, 'single segment stem');
  });

  it('extracts first heading and suggests snake_case filename', () => {
    assert.equal(extractFirstHeading('# Biz Reservations API\n\nContent'), 'Biz Reservations API');
    assert.equal(extractFirstHeading('## Secondary Heading\n'), 'Secondary Heading');
    assert.equal(extractFirstHeading('No heading here'), undefined);
    assert.equal(suggestFilenameFromHeading('Biz Reservations API'), 'BIZ_RESERVATIONS_API.md');
    assert.equal(suggestFilenameFromHeading('한국어 제목'), undefined, 'Korean-only heading produces no suggestion — agent decides');
    assert.equal(suggestFilenameFromHeading(undefined), undefined);
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

    writeFixtureFile(root, 'docs/archive/plan/old-task/README.md', '# Old Task\n');
    const defaultLocalTargets = validateTraceabilityBlock({
      kind: 'spec',
      implementedBy: ['docs/plan/README.md'],
      verifiedBy: ['docs/archive/plan/old-task/README.md'],
      relatedDocs: ['docs/archive/README.md'],
      verificationCommands: ['node --test'],
    }, root, join(root, 'docs/spec/BAD.md'));
    assert.equal(defaultLocalTargets.filter((error) => error.code === 'TRACEABILITY_LOCAL_MEMORY_TARGET').length, 3);
    assert(defaultLocalTargets.some((error) => /active-plan/.test(error.message)));
    assert(defaultLocalTargets.some((error) => /archive-body/.test(error.message)));
    assert(defaultLocalTargets.some((error) => /archive-map/.test(error.message)));

    writeFixtureFile(root, 'docs/local/NOTE.md', '# Local Note\n');
    writeFixtureJson(root, 'dotdotgod.config.json', {
      memory: {
        areas: [
          { id: 'shared-docs', label: 'Shared Docs', paths: ['docs/spec/**', 'docs/test/**'], scope: 'shared', freshness: 'fresh', role: 'shared-docs' },
          { id: 'custom-local', label: 'Custom Local', paths: ['docs/local/**'], scope: 'local', freshness: 'fresh', role: 'custom-local' },
        ],
      },
    });
    const config = readMemoryConfig(root);
    const customLocalTargets = validateTraceabilityBlock({ kind: 'spec', implementedBy: [], verifiedBy: [], relatedDocs: ['docs/local/NOTE.md'], verificationCommands: ['node --test'] }, root, join(root, 'docs/spec/BAD.md'), null, config);
    assert.equal(customLocalTargets.filter((error) => error.code === 'TRACEABILITY_LOCAL_MEMORY_TARGET').length, 1);
    assert(customLocalTargets.some((error) => /custom-local/.test(error.message)));
  });

  it('validates optional JSON-only contract traceability metadata', () => {
    const root = fixture();
    const file = join(root, 'docs/spec/FEATURE.md');
    const base = { kind: 'spec', implementedBy: [], verifiedBy: [], relatedDocs: [], verificationCommands: [] };
    assert.deepEqual(validateTraceabilityBlock({ ...base }, root, file), []);
    assert.deepEqual(validateTraceabilityBlock({ ...base, contracts: [] }, root, file), []);
    assert.deepEqual(validateTraceabilityBlock({
      ...base,
      contracts: [{
        id: 'FEATURE-CONTRACT-001',
        title: 'Contract summary',
        sections: ['Contract Details', 'Missing Heading Is Allowed'],
        implementedBy: ['packages/tool/index.mjs'],
        verifiedBy: ['packages/tool/index.test.mjs'],
        relatedDocs: ['docs/test/README.md'],
        verificationCommands: ['node --test packages/tool/index.test.mjs'],
      }],
    }, root, file), []);

    const invalidShape = validateTraceabilityBlock({ ...base, contracts: 'bad' }, root, file);
    assert(invalidShape.some((error) => error.code === 'TRACEABILITY_INVALID_FIELD' && /Field "contracts"/.test(error.message)));
    const invalidEntry = validateTraceabilityBlock({ ...base, contracts: [null] }, root, file);
    assert(invalidEntry.some((error) => /Field "contracts\[0\]"/.test(error.message)));
    const invalidMetadata = validateTraceabilityBlock({
      ...base,
      contracts: [
        { id: '', title: '', extra: true, sections: ['ok', ''], implementedBy: ['../escape'], verificationCommands: [''] },
        { id: 'DUPLICATE', title: 'First' },
        { id: 'DUPLICATE', title: 'Second' },
      ],
    }, root, file);
    assert(invalidMetadata.some((error) => /contracts\[0\]\.id/.test(error.message)));
    assert(invalidMetadata.some((error) => /contracts\[0\]\.title/.test(error.message)));
    assert(invalidMetadata.some((error) => /contracts\[0\]\.extra/.test(error.message)));
    assert(invalidMetadata.some((error) => /contracts\[0\]\.sections\[1\]/.test(error.message)));
    assert(invalidMetadata.some((error) => error.code === 'TRACEABILITY_INVALID_PATH' && /contracts\[0\]\.implementedBy/.test(error.message)));
    assert(invalidMetadata.some((error) => error.code === 'TRACEABILITY_INVALID_COMMAND' && /contracts\[0\]\.verificationCommands/.test(error.message)));
    assert(invalidMetadata.some((error) => /duplicates contract id/.test(error.message)));

    writeFixtureFile(root, 'docs/archive/plan/contract-local/README.md', '# Contract Local\n');
    const localTarget = validateTraceabilityBlock({ ...base, contracts: [{ id: 'LOCAL', title: 'Local target', verifiedBy: ['docs/archive/plan/contract-local/README.md'] }] }, root, file);
    assert(localTarget.some((error) => error.code === 'TRACEABILITY_LOCAL_MEMORY_TARGET' && /contracts\[0\]\.verifiedBy/.test(error.message)));
    const missingTarget = validateTraceabilityBlock({ ...base, contracts: [{ id: 'MISSING', title: 'Missing target', relatedDocs: ['docs/spec/MISSING.md'] }] }, root, file);
    assert(missingTarget.some((error) => error.code === 'TRACEABILITY_MISSING_TARGET' && /contracts\[0\]\.relatedDocs/.test(error.message)));
  });

  it('generates, validates, and strips traceability link regions', () => {
    const root = fixture();
    const file = join(root, 'docs/spec/FEATURE.md');
    const content = readFileSync(file, 'utf8');
    const block = extractDotdotgodTraceabilityBlocks(content)[0];
    const synced = syncTraceabilityLinksInContent(content, block.data, root, file);
    assert.equal(synced.ok, true);
    assert.equal(synced.changed, true);
    assert.match(synced.content, /dotdotgod:traceability-links:start version=1 source=json-dotdotgod/);
    assert.match(synced.content, /```json dotdotgod\n\{"kind":"spec","implementedBy":/);
    assert.match(synced.content, /\[packages\/tool\/index\.mjs\]\(\.\.\/\.\.\/packages\/tool\/index\.mjs\)/);
    assert.match(synced.content, /\[docs\/test\/README\.md\]\(\.\.\/test\/README\.md\)/);
    assert(findTraceabilityLinksRegion(synced.content).status === 'present');
    assert.deepEqual(validateTraceabilityLinksRegion(synced.content, root, file), []);
    assert.equal(extractDotdotgodTraceabilityBlocks(stripTraceabilityLinksRegion(synced.content)).length, 0);
    assert.equal(renderCompactTraceabilityBlock(block.data).includes('\n  "kind"'), false);

    const contractData = { ...block.data, contracts: [{ id: 'FEATURE-CONTRACT-001', title: 'Focused contract', sections: ['Traceability'], implementedBy: ['packages/tool/index.mjs'], verifiedBy: ['packages/tool/index.test.mjs'], relatedDocs: ['docs/test/README.md'], verificationCommands: ['node --test packages/tool/index.test.mjs'] }] };
    const contractSynced = syncTraceabilityLinksInContent(content, contractData, root, file);
    assert.equal(contractSynced.ok, true);
    assert.match(contractSynced.content, /- Contracts:\n  - `FEATURE-CONTRACT-001` — Focused contract \(sections: 1, implementedBy: 1, verifiedBy: 1, relatedDocs: 1, verificationCommands: 1\)/);
    assert.match(contractSynced.content, /```json dotdotgod\n\{"kind":"spec".*"contracts":\[/s);
    const contractReplaced = syncTraceabilityLinksInContent(contractSynced.content.replace('Focused contract', 'Stale contract'), contractData, root, file);
    assert.equal(contractReplaced.ok, true);
    assert.match(contractReplaced.content, /Focused contract/);
    assert.doesNotMatch(contractReplaced.content, /Stale contract/);
    const emptyContractSynced = syncTraceabilityLinksInContent(content, { ...block.data, contracts: [] }, root, file);
    assert.doesNotMatch(emptyContractSynced.content, /- Contracts:/);

    const stale = synced.content.replace('index.mjs', 'stale.mjs');
    const replaced = syncTraceabilityLinksInContent(stale, block.data, root, file);
    assert.equal(replaced.ok, true);
    assert.equal(replaced.changed, true);
    assert.match(replaced.content, /\[packages\/tool\/index\.mjs\]/);
    assert.doesNotMatch(replaced.content, /stale\.mjs/);

    const invalid = `${content}\n<!-- dotdotgod:traceability-links:end -->\n`;
    const errors = validateTraceabilityLinksRegion(invalid, root, file);
    assert.equal(errors[0].code, 'TRACEABILITY_LINKS_MARKER_COUNT');
  });

  it('classifies dotdotgod memory paths for deterministic retrieval hints', () => {
    assert.equal(memoryAreaForPath('AGENTS.md'), 'rules');
    assert.equal(resolveMemoryArea('docs/spec/README.md')?.role, 'behavior-truth');
    assert.equal(memoryAreaForPath('docs/arch/CODE_CONVENTIONS.md'), 'architecture');
    assert.equal(memoryAreaForPath('docs/test/README.md'), 'test');
    assert.equal(memoryAreaForPath('docs/plan/task/README.md'), 'active-plan');
    assert.equal(memoryAreaForPath('docs/archive/README.md'), 'archive-map');
    assert.equal(isReadmeIndexPath('docs/spec/README.md'), true);
    assert((resolveMemoryArea('docs/plan/task/README.md')?.priority ?? 30) > (resolveMemoryArea('packages/tool/index.mjs')?.priority ?? 30));
  });

  it('serializes the built-in policy as a valid project config template', () => {
    const data = defaultDotdotgodConfigData();
    assert.deepEqual(validateMemoryConfigData(data), []);
    assert(data.memory.areas.some((area) => area.id === 'archive-body' && area.includeBodiesByDefault === false));
    assert(data.memory.areas.some((area) => area.id === 'docs' && area.paths.includes('docs/**')));
    assert.deepEqual(data.planMode.writablePaths, ['docs/plan/**', 'docs/archive/**']);
    assert.deepEqual(data.traceability.required, ['docs/spec/**']);
    assert.equal(data.validation.markdown.maxLines, 200);
    assert.equal(data.validation.markdown.maxChars, 10000);
    assert.deepEqual(data.validation.markdown.exclude, []);
    assert.equal(data.impactRanking.preset, undefined);
    assert.equal(data.impactRanking.ppr, undefined);
    assert.equal(data.traceability.keys.length, 4);
    assert.deepEqual(data.referenceExpansion.fuzzy.lowSignal, { add: [], remove: [] });
    assert(JSON.parse(defaultDotdotgodConfigText()).referenceExpansion.fuzzy.lowSignal);
    assert(data.memory.areas.every((area) => area.description === undefined && area.clarify === undefined));

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
          {
            id: 'docs-shared',
            label: 'Shared Docs',
            paths: ['docs/spec/**'],
            scope: 'shared',
            freshness: 'fresh',
            role: 'behavior-truth',
            description: 'Behavior contracts for current product behavior.',
            clarify: {
              audience: ['first-time developers', 'AI coding agents'],
              documentType: 'spec',
              clarityGoal: 'Make behavior contracts precise without changing requirements.',
              editRules: ['Preserve traceability blocks.'],
            },
            priority: 80,
            includeBodiesByDefault: true,
          },
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
    const area = config.areas.find((item) => item.id === 'docs-shared');
    assert.equal(area.description, 'Behavior contracts for current product behavior.');
    assert.deepEqual(area.clarify.audience, ['first-time developers', 'AI coding agents']);
    assert.equal(area.clarify.documentType, 'spec');
    assert.equal(area.clarify.clarityGoal, 'Make behavior contracts precise without changing requirements.');
    assert.deepEqual(area.clarify.editRules, ['Preserve traceability blocks.']);
    const summary = memoryConfigSummary(config).areas.find((item) => item.id === 'docs-shared');
    assert.equal(summary.description, area.description);
    assert.deepEqual(summary.clarify, area.clarify);
    const index = buildIndex(root);
    const memoryArea = buildMemoryAreas(index).areas.find((item) => item.area === 'docs-shared');
    assert.equal(memoryArea.description, area.description);
    assert.deepEqual(memoryArea.clarify, area.clarify);
  });

  it('validates optional memory-area document clarity metadata', () => {
    const root = fixture();
    const invalid = validateMemoryConfigData({
      memory: {
        areas: [
          {
            id: 'custom-docs',
            label: 'Custom Docs',
            paths: ['docs/custom/**'],
            scope: 'shared',
            freshness: 'fresh',
            role: 'custom-docs',
            description: '   ',
            clarify: {
              audience: ['contributors', ''],
              documentType: '',
              clarityGoal: 42,
              editRules: ['keep role', 7],
            },
          },
          {
            id: 'bad-clarify',
            label: 'Bad Clarify',
            paths: ['docs/bad/**'],
            scope: 'shared',
            freshness: 'fresh',
            role: 'bad-docs',
            clarify: [],
          },
        ],
      },
    }, root);
    const codes = new Set(invalid.map((error) => error.code));
    assert(codes.has('MEMORY_CONFIG_INVALID_DESCRIPTION'));
    assert(codes.has('MEMORY_CONFIG_INVALID_CLARIFY_AUDIENCE'));
    assert(codes.has('MEMORY_CONFIG_INVALID_CLARIFY_DOCUMENT_TYPE'));
    assert(codes.has('MEMORY_CONFIG_INVALID_CLARITY_GOAL'));
    assert(codes.has('MEMORY_CONFIG_INVALID_CLARIFY_EDIT_RULES'));
    assert(codes.has('MEMORY_CONFIG_INVALID_CLARIFY'));

    assert.deepEqual(validateMemoryConfigData({
      memory: {
        areas: [{
          id: 'empty-overrides',
          label: 'Empty Overrides',
          paths: ['docs/empty/**'],
          scope: 'shared',
          freshness: 'fresh',
          role: 'empty-overrides',
          clarify: { audience: [], editRules: [] },
        }],
      },
    }, root), []);
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
      query: 'node packages/cli/bin/dotdotgod.mjs query . "<focus>" --json',
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
    assert.equal(guidance.query, 'npx dotdotgod query . "<focus>" --json');
  });

  it('keeps impact ranking config non-blocking while applying valid semantic settings', () => {
    const root = fixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({ impactRanking: { semantic: { threshold: 0.4, topKPerFile: 3 } } }, null, 2));
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.equal(config.impactRanking.connectionCap, 80);
    assert.equal(config.impactRanking.memoryCap, 20);
    assert.equal(config.impactRanking.ppr.reference, 0.4);
    assert.equal(config.impactRanking.semantic.threshold, 0.4);
    for (const impactRanking of [null, 'legacy', [], {
      preset: 'docs-first', weights: {}, ppr: {}, relationWeights: {}, unknown: true,
      semantic: { enabled: 'yes', threshold: 2, topKPerFile: 99, signals: ['path'], includeArchiveBodies: true, unknown: true },
    }]) assert.deepEqual(validateMemoryConfigData({ impactRanking }, root), []);
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

  it('loads custom traceability keys with complete-list validation and dynamic rendering', () => {
    const root = fixture();
    writeFixtureFile(root, 'packages/tool/index.mjs', 'export {};\n');
    writeFixtureJson(root, 'dotdotgod.config.json', {
      traceability: {
        required: ['docs/spec/**'],
        exclude: ['**/README.md'],
        keys: [
          { key: 'ownedBy', label: 'Owned by', description: 'Owning implementation files.', target: 'path', relation: 'owned_by', weight: 6 },
          { key: 'checks', label: 'Checks', description: 'Verification commands.', target: 'command', relation: 'checks', weight: 0 },
        ],
      },
    });
    const config = readMemoryConfig(root);
    assert.deepEqual(config.traceability.keys.map((entry) => entry.key), ['ownedBy', 'checks']);
    const file = join(root, 'docs/spec/CUSTOM.md');
    const data = { kind: 'spec', ownedBy: ['packages/tool/index.mjs'], checks: ['node --test', 'pnpm test'] };
    assert.deepEqual(validateTraceabilityBlock(data, root, file, 1, config), []);
    assert(validateTraceabilityBlock({ ...data, implementedBy: [] }, root, file, 1, config).some((error) => error.code === 'TRACEABILITY_INVALID_FIELD'));
    const content = `# Custom\n\n## Traceability\n\n\`\`\`json dotdotgod\n${JSON.stringify(data)}\n\`\`\`\n`;
    const synced = syncTraceabilityLinksInContent(content, data, root, file, config);
    assert.match(synced.content, /- Owned by:/);
    assert.match(synced.content, /- Checks:/);
    writeFileSync(file, synced.content);
    const customGraph = buildGraph(root, [file, join(root, 'packages/tool/index.mjs')], config);
    assert(customGraph.edges.some((edge) => edge.source === 'file:docs/spec/CUSTOM.md' && edge.target === 'file:packages/tool/index.mjs' && edge.relation === 'owned_by' && edge.relationWeight === 6));
    const commandIds = customGraph.nodes.filter((node) => node.type === 'command').map((node) => node.id).sort();
    const reorderedData = { ...data, checks: [...data.checks].reverse() };
    const reorderedContent = syncTraceabilityLinksInContent(content, reorderedData, root, file, config).content;
    writeFileSync(file, reorderedContent);
    const reorderedGraph = buildGraph(root, [file, join(root, 'packages/tool/index.mjs')], config);
    assert.deepEqual(reorderedGraph.nodes.filter((node) => node.type === 'command').map((node) => node.id).sort(), commandIds);
    const commandItem = buildImpactReport({ memoryConfig: config, graph: customGraph }, 'docs/spec/CUSTOM.md').related.find((item) => item.type === 'command');
    assert.equal(commandItem.scoreBreakdown.connection.ppr, 0);

    const empty = validateMemoryConfigData({ traceability: { required: [], exclude: [], keys: [] } }, root);
    assert.deepEqual(empty, []);
    const collision = validateMemoryConfigData({ traceability: { required: [], keys: [{ key: 'kind', label: 'Bad', description: 'Bad.', target: 'path', relation: 'links_to', weight: 21 }] } }, root);
    assert(collision.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_KEY'));
    assert(collision.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_RELATION'));
    assert(collision.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_WEIGHT'));

    const duplicateLabels = validateMemoryConfigData({ traceability: { required: [], keys: [
      { key: 'first', label: 'Owned by', description: 'First.', target: 'path', relation: 'first_relation', weight: 1 },
      { key: 'second', label: ' owned BY ', description: 'Second.', target: 'path', relation: 'second_relation', weight: 1 },
    ] } }, root);
    assert(duplicateLabels.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_LABEL'));
    for (const relation of ['contains_heading', 'declares_package', 'declares_script', 'declares_bin', 'depends_on', 'belongs_to_area', 'includes_resource', 'defines_contract', 'routes_to', 'vector_similarity']) {
      const errors = validateMemoryConfigData({ traceability: { required: [], keys: [{ key: 'custom', label: 'Custom', description: 'Custom.', target: 'path', relation, weight: 0 }] } }, root);
      assert(errors.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_RELATION'), relation);
    }
    const unsafeLabel = validateMemoryConfigData({ traceability: { required: [], keys: [{ key: 'custom', label: 'Unsafe:\n- injected', description: 'Custom.', target: 'path', relation: 'custom_relation', weight: 1 }] } }, root);
    assert(unsafeLabel.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_LABEL'));
    for (const relation of ['bad_', 'bad__name']) {
      const errors = validateMemoryConfigData({ traceability: { required: [], keys: [{ key: 'custom', label: 'Custom', description: 'Custom.', target: 'path', relation, weight: 1 }] } }, root);
      assert(errors.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_RELATION'), relation);
    }
  });

  it('ignores legacy pinned-file config and loads documentation-summary exclusions', () => {
    const defaultLoad = {
      pinnedPaths: [],
      pinnedBodies: [],
      documentationSummary: { exclude: ['docs/plan', 'docs/archive'] },
    };
    assert.deepEqual(defaultMemoryConfig().load, defaultLoad);
    assert.deepEqual(defaultDotdotgodConfigData().load, defaultLoad);

    const root = fixture();
    writeFixtureJson(root, 'dotdotgod.config.json', {
      load: {
        pinnedPaths: ['./docs/arch/CODE_CONVENTIONS.md', 'docs/arch/CODE_CONVENTIONS.md'],
        pinnedBodies: ['docs/arch/**'],
        documentationSummary: { exclude: ['./docs/private', 'docs/private'] },
      },
    });
    const config = readMemoryConfig(root);
    assert.equal(config.source, 'dotdotgod.config.json');
    assert.deepEqual(config.load.pinnedPaths, []);
    assert.deepEqual(config.load.pinnedBodies, []);
    assert.deepEqual(config.load.documentationSummary.exclude, ['docs/private']);
    assert.deepEqual(memoryConfigSummary(config).load, config.load);

    const invalid = validateMemoryConfigData({
      load: {
        pinnedPaths: ['/etc/hosts', '../escape.md', 'docs/*.md'],
        pinnedBodies: [42, '.env', 'secrets/keys.md'],
        documentationSummary: { exclude: 'docs/plan' },
      },
    }, root);
    const codes = new Set(invalid.map((error) => error.code));
    assert.deepEqual([...codes], ['LOAD_CONFIG_INVALID_DOCUMENTATION_SUMMARY_EXCLUDE']);
    assert.deepEqual(validateMemoryConfigData({ load: { pinnedPaths: 'anything', pinnedBodies: { legacy: true } } }, root), []);
    assert(validateMemoryConfigData({ load: [] }, root).some((error) => error.code === 'LOAD_CONFIG_INVALID'));
    assert(validateMemoryConfigData({ load: { documentationSummary: [] } }, root).some((error) => error.code === 'LOAD_CONFIG_INVALID_DOCUMENTATION_SUMMARY'));

    writeFixtureJson(root, 'dotdotgod.config.json', { load: { pinnedPaths: ['../escape.md'], pinnedBodies: '.env' } });
    const fallback = readMemoryConfig(root);
    assert.deepEqual(fallback.errors, []);
    assert.deepEqual(fallback.load, defaultLoad);
  });

  it('loads and validates configurable Plan Mode writable documentation paths', () => {
    const root = fixture();
    writeFixtureJson(root, 'dotdotgod.config.json', { planMode: { writablePaths: ['docs/proposals/**'] } });
    const config = readMemoryConfig(root);
    assert.deepEqual(config.planMode.writablePaths, ['docs/proposals/**']);
    assert.deepEqual(memoryConfigSummary(config).planMode, config.planMode);
    assert(validateMemoryConfigData({ planMode: { writablePaths: [] } }, root).length === 0);
    assert(validateMemoryConfigData({ planMode: { writablePaths: ['src/**'] } }, root).some((error) => error.code === 'PLAN_MODE_CONFIG_INVALID_WRITABLE_PATHS'));
    assert(validateMemoryConfigData({ planMode: { writablePaths: '../docs/**' } }, root).some((error) => error.code === 'PLAN_MODE_CONFIG_INVALID_WRITABLE_PATHS'));
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
    assert.match(codexHooks, /plugin_hooks/);
    assert.match(codexHooks, /dd:impact/);
    assert.match(codexHooks, /UserPromptSubmit/);
    assert.match(codexHooks, /dotdotgod graph impact \. --changed <path-a> --changed <path-b> --compact/);
    assert.match(codexHooks, /complete target file list/);
    assert.match(codexHooks, /one bounded multi-seed graph impact command/);
    assert.match(codexHooks, /up to 20 unique paths/);
    assert.match(claudeHooks, /UserPromptSubmit` does not support matchers/);
    assert.match(claudeHooks, /submitted `prompt` field/);
    assert.match(claudeHooks, /does not ship a default hook config/);
    assert.match(claudeHooks, /\/dd:impact/);
    assert.match(claudeHooks, /dotdotgod graph impact \. --changed <path-a> --changed <path-b> --compact/);
    assert.match(claudeHooks, /one bounded multi-seed graph impact command/);
    assert.match(claudeHooks, /up to 20 unique paths/);
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

function writePlanStage(root, slug, stage, content, extraFiles = {}) {
  const stageDir = join(root, 'docs/plan', slug, stage);
  mkdirSync(stageDir, { recursive: true });
  writeFileSync(join(stageDir, 'README.md'), content);
  for (const [name, fileContent] of Object.entries(extraFiles)) {
    writeFileSync(join(stageDir, name), fileContent);
  }
}

describe('impact ranking unit coverage', () => {
  it('uses fixed impact policy and treats the complete impact ranking namespace as non-blocking', () => {
    const defaults = readMemoryConfig(fixture()).impactRanking;
    assert.equal(defaults.connectionCap, 80);
    assert.equal(defaults.memoryCap, 20);
    assert.equal(defaults.ppr.reference, 0.4);

    const compatibilityData = { impactRanking: {
      preset: 'docs-first', weights: { ppr: 20 }, relationWeights: { related_doc: 9 }, ppr: { enabled: false },
      traceabilityBoosts: { unknown: 'ignored' }, verificationBoosts: null, semanticBoosts: 42, proximityBoosts: [], unknown: true,
      semantic: { enabled: 'yes', threshold: 2, topKPerFile: 21, includeArchiveBodies: 'yes', signals: ['embedding'], unknown: true },
    } };
    assert.deepEqual(validateMemoryConfigData(compatibilityData, fixture()), []);
    const root = fixture();
    writeFixtureJson(root, 'dotdotgod.config.json', compatibilityData);
    const resolved = readMemoryConfig(root).impactRanking;
    assert.equal(resolved.connectionCap, 80);
    assert.deepEqual(resolved.semantic, defaults.semantic);
  });

  it('keeps lexical semantic edges out of the indexed graph', () => {
    const root = fixture();
    writeImpactRankingFixture(root);
    const graph = buildIndex(root).graph;
    assert.equal(graph.edges.some((edge) => edge.confidence === 'INFERRED_LEXICAL_SEMANTIC'), false);
    assert.equal(graph.edges.some((edge) => ['semantic_similarity', 'mentions_package'].includes(edge.relation)), false);
    assert.deepEqual(validateMemoryConfigData({ impactRanking: { semantic: { signals: ['path'], includeArchiveBodies: true } } }, root), []);
  });

  it('scores fixed weighted PPR and memory with explanation-only direct evidence', () => {
    const root = fixture();
    writeImpactRankingFixture(root);
    const report = buildImpactReport(buildIndex(root), 'packages/route-planner/index.mjs', { related: 50, overlay: { status: 'available', edges: [{ source: 'file:packages/route-planner/index.mjs', target: 'file:docs/arch/ROUTE_PLANNER_SEMANTIC.md', relation: 'vector_similarity', weight: 1.8, score: 0.9, confidence: 'INFERRED_VECTOR_SEMANTIC', heading: 'Route Planner Semantic' }] } });

    const seed = itemById(report, 'file:packages/route-planner/index.mjs');
    assert.equal(rankOf(report, seed.id), 0);
    assert.equal(seed.impactScore, 100);
    assert.equal(seed.scoreBreakdown.seed, 100);

    const spec = itemById(report, 'file:docs/spec/ROUTE_PLANNER.md');
    const semanticOnly = itemById(report, 'file:docs/arch/ROUTE_PLANNER_SEMANTIC.md');
    assert(spec);
    assert(semanticOnly);
    assert(spec.scoreBreakdown.connection.ppr > 0);
    assert(spec.scoreBreakdown.memory.priority > semanticOnly.scoreBreakdown.memory.priority);
    assert.equal(typeof semanticOnly.scoreBreakdown.connection.ppr, 'number');
    assert(rankOf(report, spec.id) < rankOf(report, semanticOnly.id));

    const compact = buildCompactImpactReport(report);
    assert.equal(compact.compact, true);
    assert.equal(compact.related.length <= 10, true);
    assert.equal(compact.ranking.weights, undefined);
    assert(compact.groups.docs.items.some((item) => item.id === 'file:docs/spec/ROUTE_PLANNER.md'));
    assert.equal(typeof compact.quality.semanticOnlyTop10, 'number');

    const verifiedTest = itemById(report, 'file:packages/route-planner/route-planner.test.mjs');
    assert(verifiedTest.scoreBreakdown.connection.ppr > 0);

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
    assert(archiveItem.scoreBreakdown.memory.policyAdjustments < 0);
    const archiveSeedItem = itemById(buildImpactReport(archiveIndex, archivePath), 'file:packages/archive-seed.mjs');
    assert(archiveSeedItem.scoreBreakdown.memory.policyAdjustments >= -5);

    const capIndex = {
      memoryConfig: defaultMemoryConfig(),
      graph: {
        nodes: [
          { id: 'file:packages/cap/seed.mjs', type: 'file', path: 'packages/cap/seed.mjs' },
          { id: 'file:docs/spec/CAP.md', type: 'file', path: 'docs/spec/CAP.md', retrieval: { area: 'spec', priority: 100, freshness: 'fresh', includeBodiesByDefault: true, signals: [] } },
        ],
        edges: ['semantic_similarity', 'verification_command', 'related_doc', 'verified_by', 'implemented_by'].map((relation) => ({ source: 'file:packages/cap/seed.mjs', target: 'file:docs/spec/CAP.md', relation })),
      },
    };
    const capped = itemById(buildImpactReport(capIndex, 'packages/cap/seed.mjs'), 'file:docs/spec/CAP.md');
    assert.equal(capped.impactScore, 100);
    assert.equal(capped.scoreBreakdown.strongestDirectRelation, 'implemented_by');
    assert.equal(rankOf(buildImpactReport(capIndex, 'packages/cap/seed.mjs'), 'file:packages/cap/seed.mjs'), 0);
  });

  it('combines multiple changed files while retaining per-seed top-five rankings', () => {
    const nodes = [
      { id: 'file:packages/multi/a.mjs', type: 'file', path: 'packages/multi/a.mjs' },
      { id: 'file:packages/multi/b.mjs', type: 'file', path: 'packages/multi/b.mjs' },
      ...Array.from({ length: 6 }, (_, index) => ({ id: `file:docs/spec/A_${index}.md`, type: 'file', path: `docs/spec/A_${index}.md` })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: `file:docs/test/B_${index}.md`, type: 'file', path: `docs/test/B_${index}.md` })),
      { id: 'file:packages/multi/shared.test.mjs', type: 'file', path: 'packages/multi/shared.test.mjs' },
    ];
    const edges = [
      ...Array.from({ length: 6 }, (_, index) => ({ source: 'file:packages/multi/a.mjs', target: `file:docs/spec/A_${index}.md`, relation: 'related_doc' })),
      ...Array.from({ length: 6 }, (_, index) => ({ source: 'file:packages/multi/b.mjs', target: `file:docs/test/B_${index}.md`, relation: 'verified_by' })),
      { source: 'file:packages/multi/a.mjs', target: 'file:packages/multi/shared.test.mjs', relation: 'verified_by' },
      { source: 'file:packages/multi/a.mjs', target: 'file:packages/multi/shared.test.mjs', relation: 'related_doc' },
      { source: 'file:packages/multi/b.mjs', target: 'file:packages/multi/shared.test.mjs', relation: 'verified_by' },
      { source: 'file:packages/multi/b.mjs', target: 'file:packages/multi/shared.test.mjs', relation: 'related_doc' },
    ];
    const index = { memoryConfig: defaultMemoryConfig(), graph: { nodes, edges } };
    const report = buildImpactReport(index, ['packages/multi/a.mjs', 'packages/multi/b.mjs', 'packages/multi/a.mjs'], { related: 25 });

    assert.equal(report.changed, 'packages/multi/a.mjs');
    assert.deepEqual(report.changedFiles, ['packages/multi/a.mjs', 'packages/multi/b.mjs']);
    assert.deepEqual(report.related.slice(0, 2).map((item) => item.id), ['file:packages/multi/a.mjs', 'file:packages/multi/b.mjs']);
    assert(report.related.slice(0, 2).every((item) => item.impactScore === 100 && item.scoreBreakdown.seed === 100));
    assert.equal(report.perSeed.length, 2);
    assert(report.perSeed.every((entry) => entry.related.length === 5));
    assert(report.perSeed.every((entry) => entry.related.every((item) => item.id !== `file:${entry.changed}`)));
    assert(report.perSeed[0].related.some((item) => item.path === 'packages/multi/shared.test.mjs'));
    assert(report.perSeed[1].related.some((item) => item.path === 'packages/multi/shared.test.mjs'));

    const single = buildImpactReport(index, 'packages/multi/a.mjs');
    assert.equal(single.changed, 'packages/multi/a.mjs');
    assert.deepEqual(single.changedFiles, ['packages/multi/a.mjs']);
    assert.equal(single.related[0].id, 'file:packages/multi/a.mjs');
    assert.equal(single.perSeed[0].related.length, 5);

    const compact = buildCompactImpactReport(report);
    assert.deepEqual(compact.changedFiles, report.changedFiles);
    assert.equal(compact.perSeed.length, 2);
    assert(compact.perSeed.every((entry) => entry.related.length === 5));
  });

  it('uses fixed changed-file PPR, traceability weights, and grouping compatibility', () => {
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
    assert(itemById(report, 'file:docs/spec/PPR_STRONG.md').scoreBreakdown.connection.ppr > itemById(report, 'file:docs/arch/PPR_WEAK.md').scoreBreakdown.connection.ppr);
    assert.equal(report.ranking.method, 'weighted-personalized-pagerank+memory');
    assert.equal(report.ranking.pprReference, 0.4);

    const evidenceConfig = defaultMemoryConfig();
    evidenceConfig.traceability.keys = [
      { key: 'weak', label: 'Weak', description: 'Weak.', target: 'path', relation: 'weak_relation', weight: 1 },
      { key: 'strong', label: 'Strong', description: 'Strong.', target: 'path', relation: 'strong_relation', weight: 9 },
    ];
    const evidenceReport = buildImpactReport({ memoryConfig: evidenceConfig, graph: {
      nodes: [{ id: 'file:seed', type: 'file', path: 'seed' }, { id: 'file:candidate', type: 'file', path: 'candidate' }],
      edges: [{ source: 'file:seed', target: 'file:candidate', relation: 'weak_relation' }, { source: 'file:candidate', target: 'file:seed', relation: 'strong_relation' }],
    } }, 'seed');
    assert.equal(itemById(evidenceReport, 'file:candidate').scoreBreakdown.strongestDirectRelation, 'incoming:strong_relation');

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
    assert.equal(defaultMemoryConfig().areas.at(-1).id, 'docs');
    assert.equal(shouldIndexPath('Dockerfile'), true);
  });

  it('builds structural graph nodes, scores, and bounded neighborhoods', () => {
    const root = fixture();
    mkdirSync(join(root, 'packages/pi/extensions/plan-mode'), { recursive: true });
    writeFileSync(join(root, 'docs/spec/PLAN_MODE.md'), '# Plan Mode Tool Settings\n\n## Plan Mode Tools\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/pi/extensions/plan-mode/utils.ts"],\n  "verifiedBy": ["packages/pi/test/plan-mode-utils.test.ts"],\n  "relatedDocs": ["docs/spec/FEATURE.md"],\n  "verificationCommands": ["pnpm --filter @dotdotgod/pi test"],\n  "contracts": [{\n    "id": "PLAN-MODE-TOOLS-001",\n    "title": "Plan mode tool access stays traceable",\n    "sections": ["Plan Mode Tools"],\n    "implementedBy": ["packages/tool/index.mjs"],\n    "verifiedBy": ["packages/tool/index.test.mjs"],\n    "relatedDocs": ["docs/spec/FEATURE.md"],\n    "verificationCommands": ["node --test packages/tool/index.test.mjs"]\n  }]\n}\n```\n');
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
    assert.equal(summary.byType.package_resource >= 1, true);
    assert(index.graph.nodes.some((node) => node.id === 'memory_area:spec' && node.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'file:docs/spec/README.md' && node.memoryArea === 'spec' && node.retrieval?.role === 'behavior-truth'));
    assert(index.graph.nodes.some((node) => node.id === 'package_resource:packages/tool/package.json#files:files:1' && node.type === 'package_resource'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/spec/FEATURE.md' && edge.target === 'file:packages/tool/index.mjs' && edge.relation === 'implemented_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/spec/FEATURE.md' && edge.target === 'file:packages/tool/index.test.mjs' && edge.relation === 'verified_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    const contractId = 'contract:docs/spec/PLAN_MODE.md#PLAN-MODE-TOOLS-001';
    const contractNode = index.graph.nodes.find((node) => node.id === contractId);
    assert.equal(contractNode?.type, 'contract');
    assert.equal(contractNode.contractId, 'PLAN-MODE-TOOLS-001');
    assert.equal(contractNode.title, 'Plan mode tool access stays traceable');
    assert.deepEqual(contractNode.sections, ['Plan Mode Tools']);
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/spec/PLAN_MODE.md' && edge.target === contractId && edge.relation === 'defines_contract' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === contractId && edge.target === 'file:packages/tool/index.mjs' && edge.relation === 'implemented_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === contractId && edge.target === 'file:packages/tool/index.test.mjs' && edge.relation === 'verified_by' && edge.confidence === 'CURATED_TRACEABILITY'));
    assert(index.graph.edges.some((edge) => edge.source === contractId && edge.target === 'file:docs/spec/FEATURE.md' && edge.relation === 'related_doc' && edge.confidence === 'CURATED_TRACEABILITY'));
    const verificationCommandEdge = index.graph.edges.find((edge) => edge.source === contractId && edge.relation === 'verification_command');
    assert(verificationCommandEdge?.target.startsWith('command:verificationCommands:'));
    assert(index.graph.nodes.some((node) => node.id === verificationCommandEdge.target && node.type === 'command' && node.command === 'node --test packages/tool/index.test.mjs'));
    assert.equal(verificationCommandEdge.confidence, 'CURATED_TRACEABILITY');
    assert.equal(verificationCommandEdge.relationWeight, 3);
    assert(index.graph.edges.some((edge) => edge.source === 'file:docs/README.md' && edge.target === 'file:docs/spec/README.md' && edge.relation === 'routes_to' && edge.confidence === 'CURATED_INDEX'));
    const related = buildImpactReport(index, 'packages/tool/index.mjs').related;
    assert(related.some((node) => node.id === 'file:packages/tool/index.mjs'));
    assert(related.length <= 25);
    const impact = buildImpactReport(index, 'packages/tool/index.mjs');
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    assert(impact.related.some((item) => item.id === 'file:packages/tool/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert.equal(impact.ranking.method, 'weighted-personalized-pagerank+memory');
    assert(impact.related.every((item) => typeof item.impactScore === 'number' && item.scoreBreakdown));
    assert(impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/FEATURE.md'));
    assert(impact.groups.tests.items.some((item) => item.id === 'file:packages/tool/index.test.mjs'));
    const contractImpact = itemById(impact, contractId);
    assert(contractImpact);
    assert(contractImpact.reasons.includes('incoming:implemented_by'));
    assert.equal(contractImpact.contractId, 'PLAN-MODE-TOOLS-001');
    assert.equal(contractImpact.title, 'Plan mode tool access stays traceable');
    assert(impact.groups.contracts.items.some((item) => item.id === contractId));
    const compactImpact = buildCompactImpactReport(impact);
    assert(compactImpact.groups.contracts.items.some((item) => item.contractId === 'PLAN-MODE-TOOLS-001' && item.title === 'Plan mode tool access stays traceable'));
    const semanticImpact = buildImpactReport(index, 'packages/pi/extensions/plan-mode/utils.ts');
    assert(semanticImpact.related.some((item) => item.id === 'file:docs/spec/PLAN_MODE.md' && (item.reasons.includes('incoming:semantic_similarity') || item.reasons.includes('incoming:implemented_by'))));
    assert(semanticImpact.related.some((item) => item.scoreBreakdown?.connection?.ppr > 0));
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

  it('keeps generated Claude Code and Codex load guidance documentation-map-first', () => {
    const repoRoot = resolve('..', '..');
    for (const file of [
      'packages/claude-code/commands/dd/load.md',
      'packages/claude-code/skills/project-load/SKILL.md',
      'packages/codex/skills/project-load/SKILL.md',
    ]) {
      const content = readFileSync(join(repoRoot, file), 'utf8');
      assert.match(content, /dotdotgod query <root>/);
      assert.match(content, /depth 5/);
      assert.match(content, /docs\/archive\/README\.md/);
      assert.doesNotMatch(content, /load-snapshot/);
    }
  });
});

describe('local documentation vector query', () => {
  it('builds bounded safe profiles and deterministic multilingual vector overlays', async () => {
    const root = fixture();
    mkdirSync(join(root, 'packages/app'), { recursive: true });
    writeFileSync(join(root, 'packages/app/search.mjs'), "// 한국어 문서 검색 정책\nexport const search = true;\n");
    writeFileSync(join(root, 'docs/spec/SEARCH.md'), '# Search\n\nMultilingual document retrieval policy.\n');
    const index = buildIndex(root);
    index.memoryConfig.impactRanking.semantic = { enabled: true, threshold: 0, topKPerFile: 20 };
    const profile = buildChangedFileProfile(root, 'packages/app/search.mjs', index.graph);
    assert(profile.text.startsWith('Path: packages/app/search.mjs'));
    assert(profile.text.length <= 4000);
    let calls = 0;
    const fakeEmbed = async (texts) => {
      calls += 1;
      return texts.map((text) => {
        const vector = Array(384).fill(0);
        vector[/SEARCH.md|한국어 문서 검색 정책/i.test(text) ? 0 : 1] = 1;
        return vector;
      });
    };
    const overlay = await buildVectorImpactOverlay(root, index, ['./packages/app/search.mjs'], { embed: fakeEmbed });
    assert.equal(overlay.status, 'available');
    assert(overlay.edges.some((edge) => edge.source === 'file:packages/app/search.mjs' && edge.target === 'file:docs/spec/SEARCH.md' && edge.relation === 'vector_similarity'));
    const report = buildImpactReport(index, './packages/app/search.mjs', { overlay });
    assert.equal(report.changed, 'packages/app/search.mjs');
    assert.equal(report.related.filter((item) => item.id === 'file:packages/app/search.mjs').length, 1);
    const result = itemById(report, 'file:docs/spec/SEARCH.md');
    assert(result.reasons.includes('vector_similarity'));
    assert.equal(result.vectorEvidence.confidence, 'INFERRED_VECTOR_SEMANTIC');
    assert(result.vectorEvidence.heading.length <= 160);
    assert(result.vectorEvidence.chunkId.length <= 200);
    const boundedReport = buildImpactReport(index, 'packages/app/search.mjs', { overlay: { status: 'available', edges: [{ source: 'file:packages/app/search.mjs', target: 'file:docs/spec/SEARCH.md', relation: 'vector_similarity', weight: 1, score: 0.5, heading: 'h'.repeat(500), chunkId: 'c'.repeat(500), confidence: 'INFERRED_VECTOR_SEMANTIC' }] } });
    const boundedEvidence = itemById(boundedReport, 'file:docs/spec/SEARCH.md').vectorEvidence;
    assert.equal(boundedEvidence.heading.length, 160);
    assert.equal(boundedEvidence.chunkId.length, 200);
    assert(calls >= 2);

    mkdirSync(join(root, 'dist/private'), { recursive: true });
    writeFileSync(join(root, 'dist/private/secret.mjs'), 'do not embed');
    symlinkSync(join(root, 'dist/private'), join(root, 'packages/alias'), 'dir');
    assert.equal(buildChangedFileProfile(root, 'packages/alias/secret.mjs', index.graph), null, 'canonical generated paths cannot bypass profile policy through a symlink parent');

    const unavailable = await buildVectorImpactOverlay(root, index, ['packages/app/search.mjs'], { buildIndex: async () => { throw new Error('offline'); } });
    assert.equal(unavailable.status, 'unavailable');
    assert.equal(buildImpactReport(index, 'packages/app/search.mjs', { overlay: unavailable }).semantic.status, 'unavailable');
    const invalid = await buildVectorImpactOverlay(root, index, ['packages/app/search.mjs'], {
      embed: async () => [Array(384).fill(0).map((value, position) => position === 0 ? 1 : value)],
      buildIndex: async () => ({ chunks: [{ id: 'bad', path: 'docs/spec/SEARCH.md', heading: 'x'.repeat(500) }], vectors: Float32Array.from([Number.NaN, ...Array(383).fill(0)]), manifest: {} }),
    });
    assert.equal(invalid.status, 'unavailable', 'invalid cached vectors degrade graph impact');
    await assert.rejects(() => queryDocumentation(root, 'invalid', { embed: async () => [Array(384).fill(Number.NaN)] }), /finite normalized/, 'query keeps fatal invalid-vector semantics');
  });

  it('chunks Markdown by heading and searches shared docs with an incremental fake embedder', async () => {
    const root = fixture();
    writeFileSync(join(root, 'docs/spec/SEARCH.md'), '# Search\n\nSemantic retrieval policy.\n\n## Korean\n\n한국어 문서 검색 정책.\n');
    writeFileSync(join(root, 'docs/spec/LOAD.md'), '# Load\n\n한국어 프로젝트 문서 검색.\n');
    writeFileSync(join(root, 'docs/secrets.md'), '# Secrets\n\n한국어 비밀 문서 검색.\n');
    const chunks = chunkMarkdown('docs/spec/SEARCH.md', readFileSync(join(root, 'docs/spec/SEARCH.md'), 'utf8'));
    assert(chunks.some((chunk) => chunk.heading === 'Search > Korean'));
    let embeddedTexts = 0;
    const fakeEmbed = async (texts) => {
      embeddedTexts += texts.length;
      return texts.map((text) => {
        const vector = Array(384).fill(0);
        vector[/한국어|korean/i.test(text) ? 0 : 1] = 1;
        return vector;
      });
    };
    const first = await queryDocumentation(root, '한국어', { limit: 3, embed: fakeEmbed });
    const searchResult = first.results.find((result) => result.path === 'docs/spec/SEARCH.md');
    assert.equal(searchResult?.heading, 'Search > Korean');
    assert(first.results.length <= 3);
    assert.equal(new Set(first.results.map((result) => result.path)).size, first.results.length, 'limit counts unique Markdown files');
    assert(first.results.some((result) => result.path === 'docs/spec/LOAD.md'));
    assert.equal(first.results.some((result) => result.path.startsWith('docs/plan/') || result.path.startsWith('docs/archive/') || result.path === 'docs/secrets.md'), false);
    const firstEmbedded = embeddedTexts;
    await queryDocumentation(root, '한국어', { limit: 3, embed: fakeEmbed });
    assert.equal(embeddedTexts, firstEmbedded + 1, 'the second query should reuse every cached passage vector');
    assert.equal(readVectorCache(root)?.manifest.model, 'Xenova/multilingual-e5-small');
  });
});
