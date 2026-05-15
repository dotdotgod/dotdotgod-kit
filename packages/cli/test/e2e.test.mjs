import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const bin = resolve('bin/dotdotgod.mjs');

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'dotdotgod-cli-e2e-'));
  for (const dir of ['docs/spec', 'docs/test', 'docs/arch', 'docs/plan/task', 'docs/archive', 'packages/app']) mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
  writeFileSync(join(root, 'AGENTS.md'), '# Agents\n');
  writeFileSync(join(root, 'CLAUDE.md'), '# Claude\n');
  writeFileSync(join(root, 'CODEX.md'), '# Codex\n');
  writeFileSync(join(root, 'README.md'), '# Fixture\n');
  writeFileSync(join(root, 'docs/README.md'), '# Docs\n[Spec](spec/README.md)\n');
  writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n');
  writeFileSync(join(root, 'docs/spec/APP.md'), '# App\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/app/index.mjs"],\n  "verifiedBy": ["docs/test/README.md"],\n  "relatedDocs": ["docs/arch/README.md"],\n  "verificationCommands": ["node --test"]\n}\n```\n');
  writeFileSync(join(root, 'docs/test/README.md'), '# Tests\n');
  writeFileSync(join(root, 'docs/arch/README.md'), '# Architecture\n');
  writeFileSync(join(root, 'docs/plan/README.md'), '# Plans\n');
  writeFileSync(join(root, 'docs/plan/task/README.md'), '# Task\n');
  writeFileSync(join(root, 'docs/archive/README.md'), '# Archive\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }, null, 2));
  writeFileSync(join(root, 'packages/app/package.json'), JSON.stringify({ name: '@fixture/app', files: ['index.mjs'], scripts: { start: 'node index.mjs' } }, null, 2));
  writeFileSync(join(root, 'packages/app/index.mjs'), "import path from 'node:path';\nexport function main() { return 'plan-mode:load-requested'; }\npi.registerCommand('app', {});\n");
  return root;
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', ...options });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe('dotdotgod CLI e2e', () => {
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
    assert.equal(index.schemaVersion, 7);
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
    assert.equal(snapshot.memoryConfig.source, 'default');
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

    const impact = json(run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--json']));
    assert.equal(impact.command, 'graph impact');
    assert(impact.related.some((node) => node.id === 'file:packages/app/index.mjs'));
    assert(impact.impact.groups.commands.items.some((item) => item.id === 'command:app'));
    assert(impact.impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/APP.md'));
    assert(impact.related.some((item) => item.id === 'file:packages/app/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert.equal(typeof impact.impact.omittedRelated, 'number');

    const queryAlias = json(run(['graph', 'query', root, '--changed', 'packages/app/index.mjs', '--json']));
    assert.equal(queryAlias.command, 'graph impact');
    assert.equal(queryAlias.deprecatedAliasUsed, true);
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
