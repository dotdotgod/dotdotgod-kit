import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const bin = resolve('bin/dotdotgod.mjs');
const cliPackage = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-cli-e2e-'));
  for (const dir of ['docs/spec', 'docs/test', 'docs/arch', 'docs/plan/task', 'docs/archive/plan/routing-policy-old', 'packages/app']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n');
  writeFileSync(join(root, 'CODEX.md'), '# Codex\n');
  writeFileSync(join(root, 'README.md'), '# Fixture\n');
  writeFileSync(join(root, 'docs/README.md'), '# Docs\n[Spec](spec/README.md)\n');
  writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n');
  writeFileSync(join(root, 'docs/spec/APP.md'), '# Routing Policy App\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/app/index.mjs"],\n  "verifiedBy": ["packages/app/index.test.mjs", "docs/test/README.md"],\n  "relatedDocs": ["docs/arch/README.md"],\n  "verificationCommands": ["node --test packages/app/index.test.mjs"]\n}\n```\n');
  writeFileSync(join(root, 'docs/test/README.md'), '# Tests\n');
  writeFileSync(join(root, 'docs/arch/README.md'), '# Architecture\n');
  writeFileSync(join(root, 'docs/arch/ROUTING_POLICY_NOTES.md'), '# Routing Policy Notes\n\nSemantic-only routing policy notes.\n');
  writeFileSync(join(root, 'docs/plan/README.md'), '# Plans\n');
  writeFileSync(join(root, 'docs/plan/task/README.md'), '# Task\n');
  writeFileSync(join(root, 'docs/archive/README.md'), '# Archive\n');
  writeFileSync(join(root, 'docs/archive/plan/routing-policy-old/README.md'), '# Routing Policy Archive\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }, null, 2));
  writeFileSync(join(root, 'packages/app/package.json'), JSON.stringify({ name: '@fixture/app', files: ['index.mjs', 'helper.mjs'], scripts: { start: 'node index.mjs' }, dependencies: { 'left-pad': '1.0.0' } }, null, 2));
  writeFileSync(join(root, 'packages/app/index.mjs'), "import './helper.mjs';\nimport leftPad from 'left-pad';\nexport function resolveRoutingPolicy() { return leftPad('routing-policy', 2); }\npi.registerCommand('app', {});\n'routing-policy:changed';\n");
  writeFileSync(join(root, 'packages/app/helper.mjs'), 'export const routingPolicyHelper = true;\n');
  writeFileSync(join(root, 'packages/app/neighbor.mjs'), "import leftPad from 'left-pad';\nexport const routingPolicyNeighbor = leftPad;\n");
  writeFileSync(join(root, 'packages/app/index.test.mjs'), "import { resolveRoutingPolicy } from './index.mjs';\nexport const routingPolicyTest = resolveRoutingPolicy;\n");
  return root;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function itemById(payload, id) {
  return payload.related.find((item) => item.id === id);
}

function rankOf(payload, id) {
  return payload.related.findIndex((item) => item.id === id);
}

function hasSemanticReason(item) {
  return (item?.reasons ?? []).some((reason) => reason.includes('semantic') || reason.includes('mentions_'));
}

function writeConfig(root, value) {
  writeFileSync(join(root, 'dotdotgod.config.json'), `${JSON.stringify(value, null, 2)}\n`);
}

function packDryRun(packageName) {
  const workspaceRoot = resolve('../..');
  const result = spawnSync('pnpm', ['--filter', packageName, 'pack', '--dry-run', '--json'], { cwd: workspaceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function impactWithConfig(value) {
  const root = createFixture();
  writeConfig(root, value);
  return json(run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--json']));
}

function archiveBodyMemoryAreas() {
  return [{ id: 'archive-body', label: 'Archive Body', paths: ['docs/archive/**'], excludePaths: ['docs/archive/README.md'], scope: 'local', freshness: 'stale', role: 'historical-memory-body', priority: 20, includeBodiesByDefault: true }];
}

describe('dotdotgod CLI e2e', () => {
  it('supports help and version discovery commands', () => {
    for (const args of [[], ['--help'], ['-h'], ['help']]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Usage:/);
      assert.match(result.stdout, /dotdotgod init <root>/);
      assert.match(result.stdout, /dotdotgod graph impact <root> --changed <path>/);
      assert.equal(result.stderr, '');
    }

    for (const args of [['--version'], ['-v'], ['version']]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout.trim(), cliPackage.version);
      assert.equal(result.stderr, '');
    }

    for (const [args, pattern] of [
      [['validate', '--help'], /dotdotgod validate <root>/],
      [['init', '--help'], /dotdotgod init <root>/],
      [['help', 'init'], /dotdotgod init <root>/],
      [['index', '-h'], /dotdotgod index <root>/],
      [['config', '--help'], /dotdotgod config init <root>/],
      [['config', 'init', '--help'], /dotdotgod config init <root> \[--force\]/],
      [['help', 'config', 'init'], /dotdotgod config init <root> \[--force\]/],
      [['status', 'help'], /dotdotgod status <root>/],
      [['load-snapshot', '--help'], /dotdotgod load-snapshot <root>/],
      [['graph', '--help'], /dotdotgod graph communities <root>/],
      [['graph', 'impact', '--help'], /dotdotgod graph impact <root> --changed <path>/],
      [['graph', 'communities', '--help'], /dotdotgod graph communities <root>/],
      [['help', 'graph', 'impact'], /dotdotgod graph impact <root> --changed <path>/],
    ]) {
      const result = run(args);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, pattern);
      assert.equal(result.stderr, '');
    }
  });

  it('keeps CLI usage errors on stderr and reports missing graph impact changed paths', () => {
    const root = createFixture();

    const unknown = run(['unknown']);
    assert.equal(unknown.status, 2);
    assert.equal(unknown.stdout, '');
    assert.match(unknown.stderr, /Unknown command: unknown/);
    assert.match(unknown.stderr, /Usage:/);

    const badOption = run(['validate', '--unknown']);
    assert.equal(badOption.status, 2);
    assert.equal(badOption.stdout, '');
    assert.match(badOption.stderr, /Unknown option: --unknown/);
    assert.match(badOption.stderr, /dotdotgod validate <root>/);

    const missingChanged = run(['graph', 'impact', root]);
    assert.equal(missingChanged.status, 2);
    assert.equal(missingChanged.stdout, '');
    assert.match(missingChanged.stderr, /Missing required option: --changed <path>/);
    assert.match(missingChanged.stderr, /dotdotgod graph impact <root> --changed <path>/);
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const removedQuery = run(['graph', 'query', root, '--changed', 'packages/app/index.mjs', '--compact', '--json']);
    assert.equal(removedQuery.status, 2);
    assert.equal(removedQuery.stdout, '');
    assert.match(removedQuery.stderr, /Unknown graph command: query/);
    assert.match(removedQuery.stderr, /dotdotgod graph impact <root> --changed <path>/);
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const missingChangedJson = run(['graph', 'impact', root, '--compact', '--json']);
    assert.equal(missingChangedJson.status, 2);
    assert.equal(missingChangedJson.stderr, '');
    const payload = JSON.parse(missingChangedJson.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'graph impact');
    assert.equal(payload.compact, true);
    assert.equal(payload.error.code, 'MISSING_CHANGED');
    assert.match(payload.usage, /dotdotgod graph impact <root> --changed <path>/);

    const missingChangedValueJson = run(['graph', 'impact', root, '--changed', '--json']);
    assert.equal(missingChangedValueJson.status, 2);
    assert.equal(JSON.parse(missingChangedValueJson.stdout).error.code, 'MISSING_CHANGED');
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);
  });

  it('initializes project scaffold through dotdotgod init', () => {
    const parent = mkdtempSync(join(tmpdir(), 'dotdotgod-init-e2e-'));
    const root = join(parent, 'project');

    const dryRun = json(run(['init', root, '--project-name', 'Fixture App', '--dry-run', '--json']));
    assert.equal(dryRun.command, 'init');
    assert.equal(dryRun.dryRun, true);
    assert.equal(existsSync(join(root, 'AGENTS.md')), false);
    assert(dryRun.actions.some((item) => item.status === 'would_create' && item.path.endsWith('/AGENTS.md')));
    assert(dryRun.actions.some((item) => item.status === 'would_create' && item.path.endsWith('/.gitignore') && item.add === '.dotdotgod'));

    const initialized = json(run(['init', root, '--project-name', 'Fixture App', '--json']));
    assert.equal(initialized.command, 'init');
    assert.equal(initialized.projectName, 'Fixture App');
    assert.equal(existsSync(join(root, 'AGENTS.md')), true);
    assert.equal(existsSync(join(root, 'CLAUDE.md')), true);
    assert.equal(existsSync(join(root, 'CODEX.md')), true);
    assert.equal(existsSync(join(root, 'docs/spec/README.md')), true);
    assert.equal(existsSync(join(root, 'docs/test/README.md')), true);
    assert.equal(existsSync(join(root, 'docs/arch/README.md')), true);
    assert.equal(existsSync(join(root, 'docs/plan/README.md')), true);
    assert.equal(existsSync(join(root, 'docs/archive/README.md')), true);
    assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /Name: Fixture App/);
    const gitignoreEntries = readFileSync(join(root, '.gitignore'), 'utf8').trim().split(/\r?\n/);
    assert(gitignoreEntries.includes('docs/plan'));
    assert(gitignoreEntries.includes('docs/archive'));
    assert(gitignoreEntries.includes('.dotdotgod'));
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    const skipped = json(run(['init', root, '--json']));
    assert(skipped.actions.some((item) => item.status === 'skipped' && item.path.endsWith('/AGENTS.md')));

    const forced = json(run(['init', root, '--force', '--json']));
    const replacedAgents = forced.actions.find((item) => item.path.endsWith('/AGENTS.md'));
    assert.equal(replacedAgents.status, 'replaced');
    assert.match(replacedAgents.backup, /AGENTS\.md\.bak\./);
    assert.equal(existsSync(replacedAgents.backup), true);

    const dotdotRoot = mkdtempSync(join(tmpdir(), 'dotdotgod-init-dotdot-'));
    json(run(['init', dotdotRoot, '--dotdot-setting', '--json']));
    assert.equal(existsSync(join(dotdotRoot, 'docs/arch/CODE_CONVENTIONS.md')), true);
    assert.match(readFileSync(join(dotdotRoot, 'AGENTS.md'), 'utf8'), /CODE_CONVENTIONS\.md/);
  });

  it('packages Claude Code and Codex hook documentation', () => {
    for (const packageName of ['@dotdotgod/claude-code', '@dotdotgod/codex']) {
      const payload = packDryRun(packageName);
      const paths = new Set(payload.files.map((file) => file.path));
      assert(paths.has('hooks/README.md'), `${packageName} package should include hooks/README.md`);
      assert(paths.has('README.md'), `${packageName} package should include README.md`);
      assert(paths.has('package.json'), `${packageName} package should include package.json`);
    }
  });

  it('shows and initializes project config safely', () => {
    const root = createFixture();

    const showDefault = json(run(['config', root, '--json']));
    assert.equal(showDefault.command, 'config');
    assert.equal(showDefault.source, 'default');
    assert.equal(showDefault.path, null);
    assert.equal(showDefault.config.impactRanking.preset, 'balanced');
    assert(showDefault.config.areas.some((area) => area.id === 'active-plan'));
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const init = json(run(['config', 'init', root, '--json']));
    assert.equal(init.command, 'config init');
    assert.equal(init.created, true);
    assert.equal(init.overwritten, false);
    assert.equal(existsSync(join(root, 'dotdotgod.config.json')), true);
    const initialized = JSON.parse(readFileSync(join(root, 'dotdotgod.config.json'), 'utf8'));
    assert.equal(initialized.impactRanking.preset, 'balanced');
    assert.equal(initialized.validation.markdown.maxLines, 200);
    assert.equal(initialized.validation.markdown.maxChars, 10000);
    assert.deepEqual(initialized.validation.markdown.exclude, []);
    assert(initialized.memory.areas.some((area) => area.id === 'archive-body' && area.includeBodiesByDefault === false));

    const showConfigured = json(run(['config', root, '--json']));
    assert.equal(showConfigured.source, 'dotdotgod.config.json');
    assert.match(showConfigured.path, /dotdotgod\.config\.json$/);
    assert.equal(showConfigured.config.validation.markdown.maxLines, 200);

    const refused = run(['config', 'init', root, '--json']);
    assert.equal(refused.status, 2);
    assert.equal(refused.stderr, '');
    assert.equal(JSON.parse(refused.stdout).error.code, 'CONFIG_EXISTS');

    const forced = json(run(['config', 'init', root, '--force', '--json']));
    assert.equal(forced.created, false);
    assert.equal(forced.overwritten, true);

    const rcRoot = createFixture();
    writeFileSync(join(rcRoot, '.dotdotgodrc.json'), '{}\n');
    const rcRefused = run(['config', 'init', rcRoot, '--force', '--json']);
    assert.equal(rcRefused.status, 2);
    assert.equal(JSON.parse(rcRefused.stdout).error.code, 'CONFIG_RC_EXISTS');

    const invalidRoot = createFixture();
    writeFileSync(join(invalidRoot, 'dotdotgod.config.json'), '{"memory":{"areas":"bad"},"validation":{"markdown":{"maxLines":0}}}\n');
    const invalid = run(['config', invalidRoot, '--json']);
    assert.equal(invalid.status, 1);
    const invalidPayload = JSON.parse(invalid.stdout);
    assert.equal(invalidPayload.ok, false);
    assert.equal(invalidPayload.source, 'dotdotgod.config.json');
    assert(invalidPayload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_FIELD'));
    assert(invalidPayload.errors.some((error) => error.code === 'VALIDATION_CONFIG_INVALID_MAX_LINES'));
    assert.equal(existsSync(join(invalidRoot, '.dotdotgod/manifest.json')), false);
  });

  it('supports configured markdown size budgets and size-check exclusions', () => {
    const root = createFixture();
    const large = `${'# Big Archive\n\n'}${'x'.repeat(10050)}\n`;
    writeFileSync(join(root, 'docs/archive/README.md'), large);

    const defaultFailure = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(defaultFailure.status, 1);
    assert(JSON.parse(defaultFailure.stdout).errors.some((error) => error.code === 'FILE_TOO_LARGE' && error.file === 'docs/archive/README.md'));

    writeConfig(root, { validation: { markdown: { exclude: ['docs/archive/README.md'] } } });
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    writeConfig(root, { validation: { markdown: { maxChars: 12000, maxLines: 200 } } });
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    const cliOverride = run(['validate', root, '--include-local-memory', '--max-chars', '10000', '--json']);
    assert.equal(cliOverride.status, 1);
    assert(JSON.parse(cliOverride.stdout).errors.some((error) => error.code === 'FILE_TOO_LARGE'));
  });

  it('validates, indexes, reports status, snapshots, and graph impact results', () => {
    const root = createFixture();

    const validate = run(['validate', root, '--include-local-memory']);
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    assert.match(validate.stdout, /docs validation passed/);

    const missingIndex = run(['validate', root, '--include-local-memory', '--check-index', '--json']);
    assert.notEqual(missingIndex.status, 0);
    assert(JSON.parse(missingIndex.stdout).errors.some((error) => error.code === 'INDEX_MISSING'));

    const index = json(run(['index', root, '--json']));
    assert.equal(index.ok, true);
    assert(index.nodes > 0);
    assert(index.edges > 0);
    assert(existsSync(join(root, '.dotdotgod/manifest.json')));
    assert(existsSync(join(root, '.dotdotgod/graph/nodes/docs.json')));
    assert(existsSync(join(root, '.dotdotgod/graph/edges/imports.json')));
    assert.equal(index.schemaVersion, 9);
    assert.equal(typeof index.incremental.elapsedMs, 'number');
    assert(index.indexSizeBytes > 0);

    const validateIndex = run(['validate', root, '--include-local-memory', '--check-index']);
    assert.equal(validateIndex.status, 0, validateIndex.stdout + validateIndex.stderr);

    const status = json(run(['status', root, '--json']));
    assert.equal(status.status, 'fresh');
    assert.equal(status.ok, true);
    assert.equal(status.schemaOk, true);
    assert.equal(status.reason, 'fresh');

    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.equal(snapshot.cache.status, 'fresh');
    assert.equal(snapshot.metadata.cacheRefreshed, false);
    assert.equal(snapshot.metadata.refreshReason, 'fresh');
    assert.equal(typeof snapshot.metadata.elapsedMs, 'number');
    assert(snapshot.graph.nodes > 0);
    assert(snapshot.graph.byType.export >= 1);
    assert(snapshot.graph.byType.memory_area >= 1);
    assert(snapshot.graph.byType.package_resource >= 1);
    assert(snapshot.graph.byType.command >= 1);
    assert(snapshot.graph.byRelation.routes_to >= 1);
    assert.equal(snapshot.bounds.fullGraphIncluded, false);
    assert.equal(snapshot.bounds.archiveMapIncluded, true);
    assert.equal(snapshot.bounds.archiveBodiesIncluded, false);
    assert(snapshot.quality.snapshotBytes > 0);
    assert(snapshot.quality.approxSnapshotTokens > 0);
    assert.equal(typeof snapshot.quality.omittedCommunities, 'number');
    assert.equal(typeof snapshot.quality.omittedMemoryAreaItems, 'number');
    assert.equal(snapshot.commandGuidance.source, 'missing-install');
    assert.equal(snapshot.commandGuidance.install, 'npm install -D @dotdotgod/cli');
    assert.equal(snapshot.commandGuidance.validate, 'npx dotdotgod validate .');
    assert.equal(snapshot.memoryConfig.source, 'default');
    assert.equal(snapshot.memoryConfig.impactRanking.preset, 'balanced');
    assert(snapshot.memoryPolicy.sharedAreas.includes('spec'));
    assert(snapshot.memoryPolicy.localAreas.includes('active-plan'));
    assert(snapshot.memoryPolicy.freshAreas.includes('active-plan'));
    assert(snapshot.memoryPolicy.staleAreas.includes('archive-body'));
    assert(snapshot.memoryAreas.areas.some((area) => area.area === 'active-plan' && area.role === 'active-task-intent' && area.scope === 'local' && area.freshness === 'fresh'));
    assert(snapshot.communities.communities.length > 0);
    assert(['leiden', 'deterministic-domain-grouping'].includes(snapshot.communities.method));

    const communities = json(run(['graph', 'communities', root, '--json']));
    assert.equal(communities.command, 'graph communities');
    assert.equal(communities.metadata.cacheRefreshed, false);
    assert(communities.communities.communities.length > 0);
    assert(['leiden', 'deterministic-domain-grouping'].includes(communities.communities.method));
    assert.equal(typeof communities.communities.fallback, 'boolean');

    const rawImpactResult = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--json']);
    const impact = json(rawImpactResult);
    assert.equal(impact.command, 'graph impact');
    assert.equal(impact.compact, undefined);
    assert.equal(impact.impact.ranking.method, 'personalized-pagerank+policy');
    assert(impact.impact.ranking.weights);
    assert.deepEqual(impact.related, impact.impact.related);
    assert.equal(impact.related.every((node) => typeof node.impactScore === 'number' && node.scoreBreakdown), true);
    const changed = itemById(impact, 'file:packages/app/index.mjs');
    assert.equal(rankOf(impact, changed.id), 0);
    assert.equal(changed.impactScore, 100);
    assert.equal(changed.scoreBreakdown.seed, 100);
    const spec = itemById(impact, 'file:docs/spec/APP.md');
    const semanticOnly = itemById(impact, 'file:docs/arch/ROUTING_POLICY_NOTES.md');
    assert(spec);
    assert(semanticOnly);
    assert(rankOf(impact, spec.id) < rankOf(impact, semanticOnly.id));
    assert(spec.scoreBreakdown.traceability > 0);
    assert(hasSemanticReason(semanticOnly));
    assert(semanticOnly.scoreBreakdown.semantic > 0);
    assert(impact.impact.groups.commands.items.some((item) => item.id === 'command:app'));
    assert(impact.impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/APP.md'));
    assert(impact.impact.groups.tests.items.some((item) => item.id === 'file:packages/app/index.test.mjs'));
    assert(impact.related.some((item) => item.id === 'file:packages/app/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert(!impact.related.some((item) => item.id.startsWith('file:docs/archive/plan/')));
    assert.equal(typeof impact.impact.omittedRelated, 'number');

    const compactImpactResult = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--compact', '--json']);
    const compactImpact = json(compactImpactResult);
    assert.equal(compactImpact.compact, true);
    assert.equal(compactImpact.impact.compact, true);
    assert.equal(compactImpact.impact.ranking.method, 'personalized-pagerank+policy');
    assert.equal(compactImpact.impact.ranking.weights, undefined);
    assert.equal(compactImpact.related.length <= 10, true);
    assert(compactImpact.impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/APP.md'));
    assert(Buffer.byteLength(compactImpactResult.stdout) < Buffer.byteLength(rawImpactResult.stdout));

    const compactText = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--compact']);
    assert.equal(compactText.status, 0, compactText.stderr || compactText.stdout);
    assert.match(compactText.stdout, /graph impact compact:/);
    assert.match(compactText.stdout, /docs:/);

    const removedQuery = run(['graph', 'query', root, '--changed', 'packages/app/index.mjs', '--compact', '--json']);
    assert.equal(removedQuery.status, 2);
    assert.equal(removedQuery.stdout, '');
    assert.match(removedQuery.stderr, /Unknown graph command: query/);
  });

  it('applies impact ranking presets, semantic thresholds, archive safety, and measurement output', () => {
    const docsFirst = impactWithConfig({ impactRanking: { preset: 'docs-first' } });
    const codeProximity = impactWithConfig({ impactRanking: { preset: 'code-proximity' } });
    const testFocused = impactWithConfig({ impactRanking: { preset: 'test-focused' } });

    assert.equal(docsFirst.impact.ranking.preset, 'docs-first');
    assert.equal(codeProximity.impact.ranking.preset, 'code-proximity');
    assert.equal(testFocused.impact.ranking.preset, 'test-focused');
    assert(itemById(docsFirst, 'file:docs/spec/APP.md').scoreBreakdown.traceability > itemById(codeProximity, 'file:docs/spec/APP.md').scoreBreakdown.traceability);
    assert(rankOf(codeProximity, 'file:packages/app/helper.mjs') < rankOf(docsFirst, 'file:packages/app/helper.mjs'));
    assert(itemById(testFocused, 'file:packages/app/index.test.mjs').scoreBreakdown.verification > itemById(codeProximity, 'file:packages/app/index.test.mjs').scoreBreakdown.verification);

    const archiveConfig = (preset) => ({ memory: { areas: archiveBodyMemoryAreas() }, impactRanking: { preset, semantic: { includeArchiveBodies: true } } });
    const balancedArchive = impactWithConfig(archiveConfig('balanced'));
    const archiveAware = impactWithConfig(archiveConfig('archive-aware'));
    const archiveId = 'file:docs/archive/plan/routing-policy-old/README.md';
    assert(itemById(balancedArchive, archiveId));
    assert(itemById(archiveAware, archiveId));
    assert(itemById(archiveAware, archiveId).scoreBreakdown.archivePenalty > itemById(balancedArchive, archiveId).scoreBreakdown.archivePenalty);
    assert(rankOf(archiveAware, 'file:docs/spec/APP.md') < rankOf(archiveAware, archiveId));

    const semanticDefault = json(run(['graph', 'impact', createFixture(), '--changed', 'packages/app/index.mjs', '--json']));
    assert(hasSemanticReason(itemById(semanticDefault, 'file:docs/arch/ROUTING_POLICY_NOTES.md')));
    const semanticDisabled = impactWithConfig({ impactRanking: { semantic: { enabled: false } } });
    assert(!hasSemanticReason(itemById(semanticDisabled, 'file:docs/arch/ROUTING_POLICY_NOTES.md')));

    const repoRoot = resolve('../..');
    const output = join(createFixture(), 'impact-measure.md');
    const measured = spawnSync(process.execPath, [join(repoRoot, 'scripts/measure-context.mjs'), '--markdown', '--impact-changed', 'packages/cli/src/core.mjs', '--output', output], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(measured.status, 0, measured.stderr || measured.stdout);
    const measurement = readFileSync(output, 'utf8');
    assert.match(measurement, /Graph impact sample/);
    assert.match(measurement, /ranking=(personalized-pagerank\+policy|policy-score)/);
    assert.match(measurement, /scored=\d+/);
    assert.match(measurement, /semantic=\d+/);
    assert.match(measurement, /related=\d+/);
    assert.match(measurement, /omitted=\d+/);

    const quality = spawnSync(process.execPath, [join(repoRoot, 'scripts/evaluate-graph-impact.mjs'), repoRoot, '--json'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(quality.status, 0, quality.stderr || quality.stdout);
    const qualityPayload = JSON.parse(quality.stdout);
    assert.equal(qualityPayload.ok, true);
    assert(qualityPayload.seedCount >= 5);
    assert.equal(typeof qualityPayload.averages.graphPrecisionAt10, 'number');
    assert.equal(typeof qualityPayload.averages.graphRecallMustAt10, 'number');
  });

  it('reports memory config validation failures without crashing runtime commands', () => {
    const root = createFixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      memory: {
        areas: [
          { id: 'Bad Id', paths: [], scope: 'global', freshness: 'old', priority: 101, includeBodiesByDefault: 'yes' },
        ],
      },
    }, null, 2));

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_ID'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_SCOPE'));
    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.equal(snapshot.memoryConfig.source, 'dotdotgod.config.json');
    assert(snapshot.memoryPolicy.sharedAreas.includes('spec'));
  });

  it('validates configurable traceability scopes with multiple path arrays', () => {
    const root = createFixture();
    mkdirSync(join(root, 'docs/product'), { recursive: true });
    mkdirSync(join(root, 'docs/requirements'), { recursive: true });
    writeFileSync(join(root, 'docs/product/README.md'), '# Product\n');
    writeFileSync(join(root, 'docs/product/FEATURE.md'), '# Product Feature\n');
    writeFileSync(join(root, 'docs/requirements/README.md'), '# Requirements\n');
    writeFileSync(join(root, 'docs/requirements/REQ.md'), '# Requirement\n');
    writeFileSync(join(root, 'docs/spec/APP.md'), '# App without traceability after custom policy\n');
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      traceability: {
        required: ['docs/product/**', 'docs/requirements/**'],
        exclude: ['**/README.md'],
      },
    }, null, 2));

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    assert(payload.errors.some((error) => error.code === 'TRACEABILITY_MISSING' && error.file === 'docs/product/FEATURE.md'));
    assert(payload.errors.some((error) => error.code === 'TRACEABILITY_MISSING' && error.file === 'docs/requirements/REQ.md'));
    assert(!payload.errors.some((error) => error.code === 'TRACEABILITY_MISSING' && error.file === 'docs/spec/APP.md'));

    const block = '\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/app/index.mjs"],\n  "verifiedBy": ["docs/test/README.md"],\n  "relatedDocs": ["docs/arch/README.md"],\n  "verificationCommands": ["node --test"]\n}\n```\n';
    writeFileSync(join(root, 'docs/product/FEATURE.md'), `# Product Feature\n${block}`);
    writeFileSync(join(root, 'docs/requirements/REQ.md'), `# Requirement\n${block}`);
    const valid = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  });

  it('reports impact ranking config validation failures without crashing runtime commands', () => {
    const root = createFixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      impactRanking: {
        preset: 'wild',
        weights: { unknown: 1 },
        relationWeights: { unknown: 1 },
        traceabilityBoosts: { unknown: 1 },
        ppr: { damping: 2, iterations: 200 },
        semantic: { threshold: 2, topKPerFile: 100, signals: ['embedding'] },
      },
    }, null, 2));

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_PRESET'));
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_WEIGHTS'));
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_RELATION_WEIGHTS'));
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_BOOSTS'));
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_PPR'));
    assert(payload.errors.some((error) => error.code === 'IMPACT_RANKING_CONFIG_INVALID_SEMANTIC'));

    const impact = json(run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--json']));
    assert.equal(impact.impact.ranking.preset, 'balanced');
    assert.equal(impact.impact.ranking.method, 'personalized-pagerank+policy');
    assert(impact.related.some((item) => typeof item.impactScore === 'number' && item.scoreBreakdown));
  });

  it('reports traceability config validation failures without crashing runtime commands', () => {
    const root = createFixture();
    writeFileSync(join(root, 'dotdotgod.config.json'), JSON.stringify({
      traceability: {
        required: 'docs/product/**',
        exclude: ['../escape'],
      },
    }, null, 2));

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    assert(payload.errors.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_REQUIRED'));
    assert(payload.errors.some((error) => error.code === 'TRACEABILITY_CONFIG_INVALID_EXCLUDE'));
    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.equal(snapshot.memoryConfig.source, 'dotdotgod.config.json');
    assert.deepEqual(snapshot.memoryConfig.traceability.required, ['docs/spec/**']);
  });

  it('reports validation failures and stale indexes', () => {
    const root = createFixture();
    mkdirSync(join(root, 'docs/BadDir'), { recursive: true });
    writeFileSync(join(root, 'docs/BadDir/bad.md'), '# Bad\n');

    writeFileSync(join(root, 'docs/README.md'), '# Docs\n[Missing](missing.md)\n[Missing Anchor](spec/README.md#missing-anchor)\n');
    writeFileSync(join(root, 'docs/spec/BAD.md'), '# Bad\n');
    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const invalidPayload = JSON.parse(invalid.stdout);
    assert.equal(invalidPayload.ok, false);
    assert(invalidPayload.errors.some((error) => error.code === 'DIR_NAMING'));
    assert(invalidPayload.errors.some((error) => error.code === 'BROKEN_LINK'));
    assert(invalidPayload.errors.some((error) => error.code === 'BROKEN_ANCHOR'));
    assert(invalidPayload.errors.some((error) => error.code === 'TRACEABILITY_MISSING' && /Property guidance/.test(error.message)));

    writeFileSync(join(root, 'docs/BadDir/README.md'), '# Bad Dir\n');
    // The bad directory intentionally remains invalid for validation, but index/status can still detect staleness.
    assert.equal(run(['index', root, '--json']).status, 0);
    writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n\nChanged\n');
    const staleValidate = run(['validate', root, '--include-local-memory', '--check-index', '--json']);
    assert.notEqual(staleValidate.status, 0);
    assert(JSON.parse(staleValidate.stdout).errors.some((error) => error.code === 'INDEX_STALE' && error.file === 'docs/spec/README.md'));
    const stale = run(['status', root, '--json']);
    assert.notEqual(stale.status, 0);
    const stalePayload = JSON.parse(stale.stdout);
    assert.equal(stalePayload.status, 'stale');
    assert(stalePayload.examples.includes('docs/spec/README.md'));
    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.equal(snapshot.metadata.cacheRefreshed, true);
    assert.equal(snapshot.metadata.previousStatus, 'stale');
    assert.equal(snapshot.metadata.refreshReason, 'content-changed');
    assert.equal(snapshot.metadata.fullRebuild, false);
    assert.equal(snapshot.metadata.changedFiles, 1);
    assert.equal(typeof snapshot.metadata.elapsedMs, 'number');
    assert.equal(snapshot.cache.status, 'fresh');
  });

  it('rebuilds incompatible cache schemas during lazy refresh', () => {
    const root = createFixture();
    assert.equal(run(['index', root, '--json']).status, 0);
    const manifestPath = join(root, '.dotdotgod/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: 1, schemaVersion: 1 }, null, 2));

    const validate = run(['validate', root, '--check-index', '--json']);
    assert.notEqual(validate.status, 0);
    assert(JSON.parse(validate.stdout).errors.some((error) => error.code === 'INDEX_SCHEMA_MISMATCH'));

    const stale = run(['status', root, '--json']);
    assert.notEqual(stale.status, 0);
    const stalePayload = JSON.parse(stale.stdout);
    assert.equal(stalePayload.reason, 'schema-mismatch');
    assert.equal(stalePayload.schemaOk, false);

    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.equal(snapshot.metadata.cacheRefreshed, true);
    assert.equal(snapshot.metadata.refreshReason, 'schema-mismatch');
    assert.equal(snapshot.metadata.fullRebuild, true);
    assert.equal(snapshot.cache.schemaOk, true);
  });

  it('checks only indexable markdown files for index freshness', () => {
    const root = createFixture();
    assert.equal(run(['index', root, '--json']).status, 0);
    writeFileSync(join(root, 'docs/arch/NEW_DOC.md'), '# New Doc\n');
    const missingFile = run(['validate', root, '--include-local-memory', '--check-index', '--json']);
    assert.notEqual(missingFile.status, 0);
    assert(JSON.parse(missingFile.stdout).errors.some((error) => error.code === 'INDEX_MISSING_FILE' && error.file === 'docs/arch/NEW_DOC.md'));

    const archiveRoot = createFixture();
    assert.equal(run(['index', archiveRoot, '--json']).status, 0);
    mkdirSync(join(archiveRoot, 'docs/archive/plan/old-task'), { recursive: true });
    writeFileSync(join(archiveRoot, 'docs/archive/plan/old-task/README.md'), '# Old Task\n');
    const archiveValidate = run(['validate', archiveRoot, '--include-local-memory', '--check-index', '--json']);
    assert.equal(archiveValidate.status, 0, archiveValidate.stdout + archiveValidate.stderr);
    assert.equal(JSON.parse(archiveValidate.stdout).ok, true);
  });
});
