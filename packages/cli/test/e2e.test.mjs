import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { CACHE_VERSION } from '../src/core.mjs';
import { defaultDotdotgodConfigData } from '../src/memory/config.mjs';

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
  writeFileSync(join(root, 'docs/spec/APP.md'), '# Routing Policy App\n\n## Routing Contract\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/app/index.mjs"],\n  "verifiedBy": ["packages/app/index.test.mjs", "docs/test/README.md"],\n  "relatedDocs": ["docs/arch/README.md"],\n  "verificationCommands": ["node --test packages/app/index.test.mjs"],\n  "contracts": [{\n    "id": "APP-ROUTING-001",\n    "title": "Routing policy contract",\n    "sections": ["Routing Contract"],\n    "implementedBy": ["packages/app/index.mjs"],\n    "verifiedBy": ["packages/app/index.test.mjs"],\n    "relatedDocs": ["docs/arch/README.md"],\n    "verificationCommands": ["node --test packages/app/index.test.mjs"]\n  }]\n}\n```\n');
  writeFileSync(join(root, 'docs/test/README.md'), '# Tests\n');
  writeFileSync(join(root, 'docs/arch/README.md'), '# Architecture\n');
  writeFileSync(join(root, 'docs/arch/ROUTING_POLICY_NOTES.md'), '# Routing Policy Notes\n\nSemantic-only routing policy notes.\n');
  writeFileSync(join(root, 'docs/plan/README.md'), '# Plans\n');
  writeFileSync(join(root, 'docs/plan/task/README.md'), '# Task\n');
  writeFileSync(join(root, 'docs/archive/README.md'), '# Archive\n');
  writeFileSync(join(root, 'docs/archive/plan/routing-policy-old/README.md'), '# Routing Policy Archive\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'fixture', scripts: { test: 'node --test' } }, null, 2));
  writeFileSync(join(root, 'packages/app/package.json'), JSON.stringify({ name: '@fixture/app', files: ['index.mjs', 'helper.mjs'], scripts: { start: 'node index.mjs' }, dependencies: { 'left-pad': '1.0.0' } }, null, 2));
  writeFileSync(join(root, 'packages/app/index.mjs'), "const routingPolicyFixture = 'traceability-backed app implementation';\nvoid routingPolicyFixture;\n");
  writeFileSync(join(root, 'packages/app/helper.mjs'), "const routingPolicyHelper = 'package metadata helper';\nvoid routingPolicyHelper;\n");
  writeFileSync(join(root, 'packages/app/neighbor.mjs'), "const routingPolicyNeighbor = 'package metadata neighbor';\nvoid routingPolicyNeighbor;\n");
  writeFileSync(join(root, 'packages/app/index.test.mjs'), "const routingPolicyTest = 'traceability-backed verification';\nvoid routingPolicyTest;\n");
  const sync = spawnSync(process.execPath, [bin, 'traceability', 'links', root, '--write', '--json'], { encoding: 'utf8' });
  assert.equal(sync.status, 0, sync.stderr || sync.stdout);
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
    }

    for (const [args, pattern] of [
      [['validate', '--help'], /dotdotgod validate <root>/],
      [['init', '--help'], /dotdotgod init <root>/],
      [['help', 'init'], /dotdotgod init <root>/],
      [['index', '-h'], /dotdotgod index <root>/],
      [['config', '--help'], /dotdotgod config init <root>/],
      [['config', 'init', '--help'], /dotdotgod config init <root> \[--json\]/],
      [['help', 'config', 'init'], /dotdotgod config init <root> \[--json\]/],
      [['status', 'help'], /dotdotgod status <root>/],
      [['load-snapshot', '--help'], /dotdotgod load-snapshot <root>/],
      [['resolve', '--help'], /dotdotgod resolve <root> <ref>/],
      [['expand', '--help'], /--fuzzy/],
      [['traceability', '--help'], /dotdotgod traceability links <root>/],
      [['traceability', 'links', '--help'], /generated Markdown traceability link sections/],
      [['plan', '--help'], /dotdotgod plan stage create <stage>/],
      [['plan', 'validate', '--help'], /active plan artifact before execution/],
      [['plan', 'stage', '--help'], /dotdotgod plan stage create <stage>/],
      [['plan', 'stage', 'create', '--help'], /internal stage checkpoint/],
      [['help', 'plan', 'validate'], /dotdotgod plan validate docs\/plan\/<task-slug>\/README\.md/],
      [['help', 'plan', 'stage', 'create'], /dotdotgod plan stage create <stage>/],
      [['help', 'traceability', 'links'], /dotdotgod traceability links <root>/],
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

  it('creates plan stage checkpoints from the CLI', () => {
    const root = createFixture();

    const created = run(['plan', 'stage', 'create', '02', '--json'], { cwd: root });
    assert.equal(created.status, 0, created.stderr || created.stdout);
    const payload = JSON.parse(created.stdout);
    assert.equal(payload.stage, '02-context-load');
    assert.equal(payload.path, 'docs/plan/task/.dotdotgod-plan/02_CONTEXT_LOAD.md');
    assert.match(readFileSync(join(root, payload.path), 'utf8'), /Stage: 02-context-load/);

    const duplicate = run(['plan', 'stage', 'create', '02'], { cwd: root });
    assert.equal(duplicate.status, 2);
    assert.match(duplicate.stderr, /already exists/);
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

    const missingChangedJson = run(['graph', 'impact', root, '--json']);
    assert.equal(missingChangedJson.status, 2);
    assert.equal(missingChangedJson.stderr, '');
    const payload = JSON.parse(missingChangedJson.stdout);
    assert.equal(payload.ok, false);
    assert.equal(payload.command, 'graph impact');
    assert.equal(payload.error.code, 'MISSING_CHANGED');
    assert.match(payload.usage, /dotdotgod graph impact <root> --changed <path>/);

    const missingChangedYml = run(['graph', 'impact', root, '--yml']);
    assert.equal(missingChangedYml.status, 2);
    assert.equal(missingChangedYml.stderr, '');
    assert.match(missingChangedYml.stdout, /ok: false/);
    assert.match(missingChangedYml.stdout, /code: "MISSING_CHANGED"/);

    const outputConflict = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--compact', '--json']);
    assert.equal(outputConflict.status, 2);
    assert.equal(outputConflict.stderr, '');
    assert.equal(JSON.parse(outputConflict.stdout).error.code, 'OUTPUT_MODE_CONFLICT');

    const missingChangedValueJson = run(['graph', 'impact', root, '--changed', '--json']);
    assert.equal(missingChangedValueJson.status, 2);
    assert.equal(JSON.parse(missingChangedValueJson.stdout).error.code, 'MISSING_CHANGED');
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const tooManyArgs = Array.from({ length: 21 }, (_, index) => ['--changed', `packages/app/file-${index}.mjs`]).flat();
    const tooManyChanged = run(['graph', 'impact', root, ...tooManyArgs, '--json']);
    assert.equal(tooManyChanged.status, 2);
    assert.equal(JSON.parse(tooManyChanged.stdout).error.code, 'TOO_MANY_CHANGED');
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);
  });

  it('resolves and expands references from the graph index', () => {
    const root = createFixture();
    writeFileSync(join(root, 'docs/spec/VERSION.md'), '# Version Policy\n');
    writeFileSync(join(root, 'docs/spec/ISSUE.md'), '# Issue Policy\n');

    const missingResolve = run(['resolve', root]);
    assert.equal(missingResolve.status, 2);
    assert.match(missingResolve.stderr, /Missing required argument: <ref>/);
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const resolved = json(run(['resolve', root, 'APP', '--json']));
    assert.equal(resolved.command, 'resolve');
    assert.equal(resolved.metadata.cacheRefreshed, true);
    assert.equal(resolved.refs[0].top.path, 'docs/spec/APP.md');
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), true);

    const expanded = json(run(['expand', root, 'Update [[APP]] and [[ROUTING_POLICY_NOTES|notes]]', '--json']));
    assert.equal(expanded.command, 'expand');
    assert.equal(expanded.refs.length, 2);
    assert.equal(expanded.refs[0].top.path, 'docs/spec/APP.md');
    assert.equal(expanded.refs[1].top.path, 'docs/arch/ROUTING_POLICY_NOTES.md');

    const fuzzyExpanded = json(run(['expand', root, 'APP 수정하자', '--fuzzy', '--json']));
    assert.equal(fuzzyExpanded.refs[0].source, 'fuzzy');
    assert.equal(fuzzyExpanded.refs[0].top.path, 'docs/spec/APP.md');

    const fuzzyEmpty = json(run(['expand', root, 'hello world', '--fuzzy', '--json']));
    assert.equal(fuzzyEmpty.refs.length, 0);

    const defaultLowSignal = json(run(['expand', root, 'Update version docs', '--fuzzy', '--json']));
    assert.equal(defaultLowSignal.refs.length, 0);
    writeConfig(root, { referenceExpansion: { fuzzy: { lowSignal: { add: ['issue'], remove: ['version'] } } } });
    const removedLowSignal = json(run(['expand', root, 'Update version docs', '--fuzzy', '--json']));
    assert.equal(removedLowSignal.refs[0].top.path, 'docs/spec/VERSION.md');
    const addedLowSignal = json(run(['expand', root, 'Update issue docs', '--fuzzy', '--json']));
    assert.equal(addedLowSignal.refs.length, 0);

    const mixedExpanded = json(run(['expand', root, 'Update [[APP]] and routing policy notes', '--fuzzy', '--with-impact', '--json']));
    assert.equal(mixedExpanded.refs.length >= 2, true);
    assert.equal(mixedExpanded.refs[0].source, 'explicit');
    assert(mixedExpanded.refs[0].impact);

    const missingPromptRefs = run(['expand', root, 'Update app']);
    assert.equal(missingPromptRefs.status, 2);
    assert.match(missingPromptRefs.stderr, /No \[\[refs\]\] found/);

    const archiveDefault = json(run(['resolve', root, 'routing policy archive', '--json']));
    assert.equal(archiveDefault.refs[0].candidates.some((item) => item.path.startsWith('docs/archive/plan/')), false);
  });

  it('initializes project scaffold through dotdotgod init', () => {
    const parent = mkdtempSync(join(tmpdir(), 'dotdotgod-init-e2e-'));
    const root = join(parent, 'project');

    const dryRun = json(run(['init', root, '--project-name', 'Fixture App', '--dry-run', '--json']));
    assert.equal(dryRun.command, 'init');
    assert.equal(dryRun.dryRun, true);
    assert.equal(existsSync(join(root, 'AGENTS.md')), false);
    assert(dryRun.actions.some((item) => item.status === 'would_create' && item.path.endsWith('/AGENTS.md')));
    assert(dryRun.actions.some((item) => item.status === 'would_create' && item.path.endsWith('/dotdotgod.config.json')));
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
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'dotdotgod.config.json'), 'utf8')), defaultDotdotgodConfigData());
    assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /Name: Fixture App/);
    const gitignoreEntries = readFileSync(join(root, '.gitignore'), 'utf8').trim().split(/\r?\n/);
    assert(gitignoreEntries.includes('docs/plan'));
    assert(gitignoreEntries.includes('docs/archive'));
    assert(gitignoreEntries.includes('.dotdotgod'));
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    const skipped = json(run(['init', root, '--json']));
    assert(skipped.actions.some((item) => item.status === 'skipped' && item.path.endsWith('/AGENTS.md')));
    assert(skipped.actions.some((item) => item.status === 'skipped' && item.path.endsWith('/dotdotgod.config.json')));

    writeFileSync(join(root, 'dotdotgod.config.json'), '{"custom":true}\n');
    const preserved = json(run(['init', root, '--json']));
    assert.equal(preserved.actions.find((item) => item.path.endsWith('/AGENTS.md')).status, 'skipped');
    assert.equal(preserved.actions.find((item) => item.path.endsWith('/dotdotgod.config.json')).status, 'skipped');
    assert.equal(readFileSync(join(root, 'dotdotgod.config.json'), 'utf8'), '{"custom":true}\n');
    const forceRejected = run(['init', root, '--force', '--json']);
    assert.equal(forceRejected.status, 2);
    assert.match(forceRejected.stderr, /Unknown option: --force/);

    const dotdotRoot = mkdtempSync(join(tmpdir(), 'dotdotgod-init-dotdot-'));
    json(run(['init', dotdotRoot, '--dotdot-setting', '--json']));
    assert.equal(existsSync(join(dotdotRoot, 'docs/arch/DOCS_STRUCTURE.md')), true);
    assert.equal(existsSync(join(dotdotRoot, 'docs/arch/CODE_CONVENTIONS.md')), true);
    assert.match(readFileSync(join(dotdotRoot, 'AGENTS.md'), 'utf8'), /DOCS_STRUCTURE\.md/);
    assert.match(readFileSync(join(dotdotRoot, 'AGENTS.md'), 'utf8'), /CODE_CONVENTIONS\.md/);

    const rcRoot = join(parent, 'rc-project');
    mkdirSync(rcRoot, { recursive: true });
    writeFileSync(join(rcRoot, '.dotdotgodrc.json'), '{}\n');
    const rcInitialized = json(run(['init', rcRoot, '--json']));
    assert.equal(rcInitialized.actions.find((item) => item.path.endsWith('/dotdotgod.config.json')).status, 'created');
    assert.equal(existsSync(join(rcRoot, 'dotdotgod.config.json')), true);
    assert.equal(existsSync(join(rcRoot, '.dotdotgodrc.json')), true);
  });

  it('keeps the POSIX initializer config aligned with CLI defaults', () => {
    const parent = mkdtempSync(join(tmpdir(), 'dotdotgod-shell-init-e2e-'));
    const root = join(parent, 'project');
    const script = resolve('../shared/initializer/scripts/init_project.sh');

    const initialized = spawnSync('sh', [script, root, '--project-name', 'Shell Fixture'], { encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr || initialized.stdout);
    assert.match(initialized.stdout, /created\s+.*dotdotgod\.config\.json/);
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'dotdotgod.config.json'), 'utf8')), defaultDotdotgodConfigData());
    for (const template of [
      resolve('../shared/initializer/templates/dotdotgod.config.json'),
      resolve('../pi/skills/project-initializer/templates/dotdotgod.config.json'),
      resolve('../claude-code/skills/project-initializer/templates/dotdotgod.config.json'),
      resolve('../codex/skills/project-initializer/templates/dotdotgod.config.json'),
    ]) assert.deepEqual(JSON.parse(readFileSync(template, 'utf8')), defaultDotdotgodConfigData());

    const rcRoot = join(parent, 'rc-project');
    mkdirSync(rcRoot, { recursive: true });
    writeFileSync(join(rcRoot, '.dotdotgodrc.json'), '{}\n');
    const rcInitialized = spawnSync('sh', [script, rcRoot], { encoding: 'utf8' });
    assert.equal(rcInitialized.status, 0, rcInitialized.stderr || rcInitialized.stdout);
    assert.match(rcInitialized.stdout, /created\s+.*dotdotgod\.config\.json/);
    assert.equal(existsSync(join(rcRoot, 'dotdotgod.config.json')), true);
    assert.equal(existsSync(join(rcRoot, '.dotdotgodrc.json')), true);
  });

  it('packages adapter initializer config templates and hook documentation', () => {
    for (const packageName of ['@dotdotgod/claude-code', '@dotdotgod/codex']) {
      const payload = packDryRun(packageName);
      const paths = new Set(payload.files.map((file) => file.path));
      assert(paths.has('hooks/README.md'), `${packageName} package should include hooks/README.md`);
      assert(paths.has('skills/project-initializer/templates/dotdotgod.config.json'), `${packageName} package should include the initializer config template`);
      assert(paths.has('README.md'), `${packageName} package should include README.md`);
      assert(paths.has('package.json'), `${packageName} package should include package.json`);
    }

    const piPayload = packDryRun('@dotdotgod/pi');
    const piPaths = new Set(piPayload.files.map((file) => file.path));
    assert(piPaths.has('skills/project-initializer/templates/dotdotgod.config.json'), '@dotdotgod/pi package should include the initializer config template');
  });

  it('shows and initializes project config safely', () => {
    const root = createFixture();

    const showDefault = json(run(['config', root, '--json']));
    assert.equal(showDefault.command, 'config');
    assert.equal(showDefault.source, 'default');
    assert.equal(showDefault.path, null);
    assert.equal(showDefault.config.impactRanking.preset, 'balanced');
    assert(showDefault.config.referenceExpansion.fuzzy.lowSignal.terms.includes('version'));
    assert(showDefault.config.areas.some((area) => area.id === 'active-plan'));
    assert.equal(existsSync(join(root, '.dotdotgod/manifest.json')), false);

    const init = json(run(['config', 'init', root, '--json']));
    assert.equal(init.command, 'config init');
    assert.equal(init.created, true);
    assert.equal('overwritten' in init, false);
    assert.equal(existsSync(join(root, 'dotdotgod.config.json')), true);
    const initialized = JSON.parse(readFileSync(join(root, 'dotdotgod.config.json'), 'utf8'));
    assert.equal(initialized.impactRanking.preset, 'balanced');
    assert.equal(initialized.validation.markdown.maxLines, 200);
    assert.equal(initialized.validation.markdown.maxChars, 10000);
    assert.deepEqual(initialized.validation.markdown.exclude, []);
    assert.deepEqual(initialized.referenceExpansion.fuzzy.lowSignal, { add: [], remove: [] });
    assert(initialized.memory.areas.some((area) => area.id === 'archive-body' && area.includeBodiesByDefault === false));
    assert(initialized.memory.areas.every((area) => area.description === undefined && area.clarify === undefined));

    const showConfigured = json(run(['config', root, '--json']));
    assert.equal(showConfigured.source, 'dotdotgod.config.json');
    assert.match(showConfigured.path, /dotdotgod\.config\.json$/);
    assert.equal(showConfigured.config.validation.markdown.maxLines, 200);

    const refused = run(['config', 'init', root, '--json']);
    assert.equal(refused.status, 2);
    assert.equal(refused.stderr, '');
    assert.equal(JSON.parse(refused.stdout).error.code, 'CONFIG_EXISTS');

    const forceRejected = run(['config', 'init', root, '--force', '--json']);
    assert.equal(forceRejected.status, 2);
    assert.match(forceRejected.stderr, /Unknown option: --force/);

    const rcRoot = createFixture();
    writeFileSync(join(rcRoot, '.dotdotgodrc.json'), '{"memory":{"areas":[]}}\n');
    const rcShow = json(run(['config', rcRoot, '--json']));
    assert.equal(rcShow.source, 'default');
    const rcInitialized = json(run(['config', 'init', rcRoot, '--json']));
    assert.equal(rcInitialized.created, true);
    assert.equal(existsSync(join(rcRoot, 'dotdotgod.config.json')), true);

    const humanRoot = createFixture();
    const humanInit = run(['config', 'init', humanRoot]);
    assert.equal(humanInit.status, 0, humanInit.stderr || humanInit.stdout);
    assert.match(humanInit.stdout, /dotdotgod config init: created .*dotdotgod\.config\.json/);

    const invalidRoot = createFixture();
    writeFileSync(join(invalidRoot, 'dotdotgod.config.json'), '{"memory":{"areas":"bad"},"validation":{"markdown":{"maxLines":0}}}\n');
    const invalid = run(['config', invalidRoot, '--json']);
    assert.equal(invalid.status, 1);
    const invalidPayload = JSON.parse(invalid.stdout);
    assert.equal(invalidPayload.ok, false);
    assert.equal(invalidPayload.source, 'dotdotgod.config.json');
    assert(invalidPayload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_FIELD' && /Fix: update memory\.areas/.test(error.message)));
    assert(invalidPayload.errors.some((error) => error.code === 'VALIDATION_CONFIG_INVALID_MAX_LINES' && /Fix: update validation\.markdown\.maxLines/.test(error.message)));
    const invalidReferenceRoot = createFixture();
    writeConfig(invalidReferenceRoot, { referenceExpansion: { fuzzy: { lowSignal: { add: ['ok', ''] } } } });
    const invalidReference = run(['config', invalidReferenceRoot, '--json']);
    assert.equal(invalidReference.status, 1);
    assert(JSON.parse(invalidReference.stdout).errors.some((error) => error.code === 'REFERENCE_EXPANSION_CONFIG_INVALID_LOW_SIGNAL_TERMS'));
    assert.equal(existsSync(join(invalidRoot, '.dotdotgod/manifest.json')), false);

    const metadataRoot = createFixture();
    writeConfig(metadataRoot, {
      memory: {
        areas: [{
          id: 'product',
          label: 'Product Docs',
          paths: ['docs/spec/**'],
          scope: 'shared',
          freshness: 'fresh',
          role: 'product-intent',
          description: 'Product intent and user-facing acceptance criteria.',
          clarify: {
            audience: ['first-time developers', 'contributors'],
            documentType: 'explanation',
            clarityGoal: 'Make product intent clear without implementation detail.',
            editRules: ['Preserve user-facing intent.'],
          },
          priority: 75,
          includeBodiesByDefault: true,
        }],
      },
    });
    const metadataConfig = json(run(['config', metadataRoot, '--json']));
    const metadataArea = metadataConfig.config.areas.find((area) => area.id === 'product');
    assert.equal(metadataArea.description, 'Product intent and user-facing acceptance criteria.');
    assert.deepEqual(metadataArea.clarify.audience, ['first-time developers', 'contributors']);
    assert.equal(metadataArea.clarify.documentType, 'explanation');
    const metadataSnapshot = json(run(['load-snapshot', metadataRoot, '--json']));
    const snapshotArea = metadataSnapshot.memoryConfig.areas.find((area) => area.id === 'product');
    assert.equal(snapshotArea.description, metadataArea.description);
    assert.deepEqual(snapshotArea.clarify, metadataArea.clarify);
    const boundedArea = metadataSnapshot.memoryAreas.areas.find((area) => area.area === 'product');
    assert.equal(boundedArea.description, metadataArea.description);
    assert.deepEqual(boundedArea.clarify, metadataArea.clarify);
  });

  it('supports configured markdown size budgets and size-check exclusions', () => {
    const root = createFixture();
    const large = `${'# Big Archive\n\n'}${'x'.repeat(10050)}\n`;
    writeFileSync(join(root, 'docs/archive/README.md'), large);

    const defaultFailure = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(defaultFailure.status, 1);
    const defaultErrors = JSON.parse(defaultFailure.stdout).errors;
    const sizeError = defaultErrors.find((error) => error.code === 'FILE_TOO_LARGE' && error.file === 'docs/archive/README.md');
    assert(sizeError);
    assert.match(sizeError.prompt, /Split docs\/archive\/README\.md into focused documents by documentation area and role/);
    assert.match(sizeError.prompt, /Archive Map \(archive-map\)/);
    assert.match(sizeError.prompt, /historical-memory-map/);

    writeConfig(root, { validation: { markdown: { exclude: ['docs/archive/README.md'] } } });
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    writeConfig(root, { validation: { markdown: { maxChars: 12000, maxLines: 200 } } });
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    const cliOverride = run(['validate', root, '--include-local-memory', '--max-chars', '10000', '--json']);
    assert.equal(cliOverride.status, 1);
    assert(JSON.parse(cliOverride.stdout).errors.some((error) => error.code === 'FILE_TOO_LARGE'));
  });

  it('checks and writes generated traceability links and JSON traceability blocks without counting them against markdown budgets', () => {
    const root = createFixture();
    writeFileSync(join(root, 'docs/spec/APP.md'), '# Routing Policy App\n\n## Routing Contract\n\n## Traceability\n\n```json dotdotgod\n{\n  "kind": "spec",\n  "implementedBy": ["packages/app/index.mjs"],\n  "verifiedBy": ["packages/app/index.test.mjs", "docs/test/README.md"],\n  "relatedDocs": ["docs/arch/README.md"],\n  "verificationCommands": ["node --test packages/app/index.test.mjs"],\n  "contracts": [{\n    "id": "APP-ROUTING-001",\n    "title": "Routing policy contract",\n    "sections": ["Routing Contract"],\n    "implementedBy": ["packages/app/index.mjs"],\n    "verifiedBy": ["packages/app/index.test.mjs"],\n    "relatedDocs": ["docs/arch/README.md"],\n    "verificationCommands": ["node --test packages/app/index.test.mjs"]\n  }]\n}\n```\n');

    const missing = run(['traceability', 'links', root, '--check', '--json']);
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).changed, 1);

    const written = json(run(['traceability', 'links', root, '--write', '--json']));
    assert.equal(written.changed, 1);
    const spec = readFileSync(join(root, 'docs/spec/APP.md'), 'utf8');
    assert.match(spec, /dotdotgod:traceability-links:start/);
    assert.match(spec, /\.\.\/\.\.\/packages\/app\/index\.mjs/);
    assert.match(spec, /- Contracts:\n  - `APP-ROUTING-001` — Routing policy contract \(sections: 1, impl: 1, verify: 1, docs: 1, commands: 1\)/);
    assert.equal(json(run(['traceability', 'links', root, '--check', '--json'])).ok, true);

    const bloated = spec.replace('"verificationCommands":["node --test packages/app/index.test.mjs"]', `"verificationCommands":[${JSON.stringify('node --test packages/app/index.test.mjs ' + 'x'.repeat(5000))}]`);
    writeFileSync(join(root, 'docs/spec/APP.md'), bloated);
    assert.equal(json(run(['traceability', 'links', root, '--write', '--json'])).ok, true);
    writeConfig(root, { validation: { markdown: { maxLines: 30, maxChars: 2000 } } });
    assert.equal(json(run(['validate', root, '--include-local-memory', '--json'])).ok, true);

    const invalid = readFileSync(join(root, 'docs/spec/APP.md'), 'utf8').replace('<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->', '');
    writeFileSync(join(root, 'docs/spec/APP.md'), invalid);
    const invalidValidate = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(invalidValidate.status, 1);
    assert(JSON.parse(invalidValidate.stdout).errors.some((error) => error.code === 'TRACEABILITY_LINKS_MARKER_COUNT'));
  });

  it('rejects malformed JSON-only contract traceability metadata', () => {
    const root = createFixture();
    const specPath = join(root, 'docs/spec/APP.md');
    const content = readFileSync(specPath, 'utf8').replace('"title":"Routing policy contract"', '"title":"Routing policy contract","unknown":true');
    writeFileSync(specPath, content);
    const result = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(result.status, 1);
    const payload = JSON.parse(result.stdout);
    assert(payload.errors.some((error) => error.code === 'TRACEABILITY_INVALID_FIELD' && /contracts\[0\]\.unknown/.test(error.message)));
  });

  it('skips generator checkpoint workspaces during docs validation', () => {
    const root = createFixture();
    mkdirSync(join(root, 'docs/archive/plan/generated-task/.dotdotgod-plan'), { recursive: true });
    writeFileSync(join(root, 'docs/archive/plan/generated-task/README.md'), '# Generated Task\n');
    writeFileSync(join(root, 'docs/archive/plan/generated-task/.dotdotgod-plan/05_WORKSTREAM_HANDOFF.md'), '# 05 Workstream Handoff\n\nStage: 05-workstream-handoff\nStatus: completed\nUpdated: 2026-05-26T00:00:00.000Z\n');
    writeFileSync(join(root, 'docs/archive/plan/generated-task/.dotdotgod-plan/lowercase.md'), `${'oversized checkpoint state\n'.repeat(600)}`);

    const validate = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(validate.status, 0, validate.stdout + validate.stderr);
    const payload = JSON.parse(validate.stdout);
    assert.equal(payload.ok, true);
    assert.equal(payload.errors.some((error) => error.file.includes('.dotdotgod-plan')), false);
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
    assert(existsSync(join(root, '.dotdotgod/graph/edges/docs-links.json')));
    assert.equal(index.schemaVersion, CACHE_VERSION);
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
    assert(snapshot.graph.byType.memory_area >= 1);
    assert(snapshot.graph.byType.package_resource >= 1);
    assert(snapshot.graph.byType.package >= 1);
    assert(snapshot.graph.byRelation.routes_to >= 1);
    assert(snapshot.graph.byRelation.implemented_by >= 1);
    assert(snapshot.graph.byRelation.verified_by >= 1);
    assert(snapshot.graph.byRelation.includes_resource >= 1);
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
    assert(impact.impact.groups.docs.items.some((item) => item.id === 'file:docs/spec/APP.md'));
    assert(impact.impact.groups.tests.items.some((item) => item.id === 'file:packages/app/index.test.mjs'));
    const contract = itemById(impact, 'contract:docs/spec/APP.md#APP-ROUTING-001');
    assert(contract);
    assert.equal(contract.contractId, 'APP-ROUTING-001');
    assert.equal(contract.title, 'Routing policy contract');
    assert(impact.impact.groups.contracts.items.some((item) => item.id === contract.id));
    assert(impact.related.some((item) => item.id === 'file:packages/app/index.mjs' && item.retrieval?.signals.includes('reason:changed-file')));
    assert(!impact.related.some((item) => item.id.startsWith('file:docs/archive/plan/')));
    assert.equal(typeof impact.impact.omittedRelated, 'number');
    assert.deepEqual(impact.changedFiles, ['packages/app/index.mjs']);
    assert.deepEqual(impact.impact.changedFiles, ['packages/app/index.mjs']);
    assert.equal(impact.impact.perSeed.length, 1);
    assert(impact.impact.perSeed[0].related.length <= 5);

    const multiImpact = json(run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--changed', 'packages/app/index.test.mjs', '--changed', 'packages/app/index.mjs', '--json']));
    assert.equal(multiImpact.changed, 'packages/app/index.mjs');
    assert.deepEqual(multiImpact.changedFiles, ['packages/app/index.mjs', 'packages/app/index.test.mjs']);
    assert.deepEqual(multiImpact.impact.changedFiles, multiImpact.changedFiles);
    assert.deepEqual(multiImpact.related.slice(0, 2).map((item) => item.id), ['file:packages/app/index.mjs', 'file:packages/app/index.test.mjs']);
    assert(multiImpact.related.slice(0, 2).every((item) => item.impactScore === 100));
    assert.equal(multiImpact.impact.perSeed.length, 2);
    assert(multiImpact.impact.perSeed.every((entry) => entry.related.length <= 5 && entry.related.every((item) => item.path !== entry.changed)));

    const ymlImpactResult = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--changed', 'packages/app/index.test.mjs', '--yml']);
    assert.equal(ymlImpactResult.status, 0, ymlImpactResult.stderr || ymlImpactResult.stdout);
    assert.match(ymlImpactResult.stdout, /^impact:\n/);
    assert.match(ymlImpactResult.stdout, /output: "yml"/);
    assert.match(ymlImpactResult.stdout, /changed: "packages\/app\/index\.mjs"/);
    assert.match(ymlImpactResult.stdout, /changed_files: \["packages\/app\/index\.mjs", "packages\/app\/index\.test\.mjs"\]/);
    assert.match(ymlImpactResult.stdout, /per_seed:/);
    assert.match(ymlImpactResult.stdout, /docs:\n      omitted:/);
    assert.match(ymlImpactResult.stdout, /contracts:\n      omitted:/);
    assert.match(ymlImpactResult.stdout, /contract_id: "APP-ROUTING-001"/);
    assert.match(ymlImpactResult.stdout, /path: "docs\/spec\/APP\.md"/);
    assert.match(ymlImpactResult.stdout, /recommended_actions:/);
    assert(Buffer.byteLength(ymlImpactResult.stdout) < Buffer.byteLength(rawImpactResult.stdout));

    const yamlAlias = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--yaml']);
    assert.equal(yamlAlias.status, 0, yamlAlias.stderr || yamlAlias.stdout);
    assert.match(yamlAlias.stdout, /output: "yml"/);

    const compactText = run(['graph', 'impact', root, '--changed', 'packages/app/index.mjs', '--changed', 'packages/app/index.test.mjs', '--compact']);
    assert.equal(compactText.status, 0, compactText.stderr || compactText.stdout);
    assert.match(compactText.stdout, /graph impact compact:/);
    assert.match(compactText.stdout, /changed files: packages\/app\/index\.mjs, packages\/app\/index\.test\.mjs/);
    assert.match(compactText.stdout, /top for packages\/app\/index\.mjs:/);
    assert.match(compactText.stdout, /docs:/);
    assert.match(compactText.stdout, /contracts:/);
    assert.match(compactText.stdout, /docs\/spec\/APP\.md#APP-ROUTING-001/);

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
    if (/Graph impact unavailable/.test(measurement)) {
      assert.match(measurement, /Graph impact unavailable for packages\/cli\/src\/core\.mjs/);
    } else {
      assert.match(measurement, /ranking=(personalized-pagerank\+policy|policy-score)/);
      assert.match(measurement, /scored=\d+/);
      assert.match(measurement, /semantic=\d+/);
      assert.match(measurement, /related=\d+/);
      assert.match(measurement, /omitted=\d+/);
    }

    const quality = spawnSync(process.execPath, [join(repoRoot, 'scripts/evaluate-graph-impact.mjs'), repoRoot, '--json'], { cwd: repoRoot, encoding: 'utf8' });
    if (quality.status !== 0 && /EPERM: operation not permitted/.test(quality.stderr)) {
      assert.match(quality.stderr, /\.dotdotgod\/graph\/nodes\/docs\.json/);
      return;
    }
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
          { id: 'Bad Id', paths: [], scope: 'global', freshness: 'old', priority: 101, includeBodiesByDefault: 'yes', description: '', clarify: { audience: [''], documentType: '', clarityGoal: 42, editRules: [7] } },
        ],
      },
    }, null, 2));

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_ID'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_SCOPE'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_DESCRIPTION'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_CLARIFY_AUDIENCE'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_CLARIFY_DOCUMENT_TYPE'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_CLARITY_GOAL'));
    assert(payload.errors.some((error) => error.code === 'MEMORY_CONFIG_INVALID_CLARIFY_EDIT_RULES'));
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
    assert.equal(json(run(['traceability', 'links', root, '--write', '--json'])).ok, true);
    const valid = run(['validate', root, '--include-local-memory', '--json']);
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  });

  it('rejects local-memory paths in traceability blocks during validation', () => {
    const root = createFixture();
    const invalidSpec = '# App\n\n## Traceability\n\n```json dotdotgod\n{"kind":"spec","implementedBy":["packages/app/index.mjs"],"verifiedBy":["docs/plan/task/README.md"],"relatedDocs":["docs/archive/README.md"],"verificationCommands":["node --test packages/app/index.test.mjs"]}\n```\n';
    writeFileSync(join(root, 'docs/spec/APP.md'), invalidSpec);

    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    const payload = JSON.parse(invalid.stdout);
    const localErrors = payload.errors.filter((error) => error.code === 'TRACEABILITY_LOCAL_MEMORY_TARGET');
    assert.equal(localErrors.length, 2);
    assert(localErrors.some((error) => /docs\/plan\/task\/README\.md/.test(error.message)));
    assert(localErrors.some((error) => /docs\/archive\/README\.md/.test(error.message)));
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

  it('returns configured pinned load files from direct disk reads', () => {
    const root = createFixture();
    writeConfig(root, {
      load: {
        pinnedPaths: ['packages/app/helper.mjs', 'docs/arch/PINNED_MISSING.md'],
        pinnedBodies: ['docs/plan/task/README.md'],
      },
    });
    const snapshot = json(run(['load-snapshot', root, '--json']));
    assert.deepEqual(snapshot.pinnedFiles.configured, { pinnedPaths: ['packages/app/helper.mjs', 'docs/arch/PINNED_MISSING.md'], pinnedBodies: ['docs/plan/task/README.md'] });
    const helper = snapshot.pinnedFiles.paths.find((entry) => entry.path === 'packages/app/helper.mjs');
    assert.equal(helper.status, 'present');
    assert(snapshot.memoryAreas.areas.every((area) => !area.files.includes('packages/app/helper.mjs')));
    assert.equal(snapshot.pinnedFiles.paths.find((entry) => entry.path === 'docs/arch/PINNED_MISSING.md').status, 'missing');
    const planBody = snapshot.pinnedFiles.bodies.find((entry) => entry.path === 'docs/plan/task/README.md');
    assert.equal(planBody.status, 'present');
    assert.match(planBody.content, /# Task/);
    assert.equal(snapshot.quality.pinnedPaths, 3);
    assert.equal(snapshot.quality.pinnedBodies, 1);
    assert.equal(snapshot.bounds.pinnedBodyChars, 10000);

    writeConfig(root, { load: { pinnedBodies: ['.env'] } });
    const invalid = run(['validate', root, '--include-local-memory', '--json']);
    assert.notEqual(invalid.status, 0);
    assert(JSON.parse(invalid.stdout).errors.some((error) => error.code === 'LOAD_CONFIG_SECRET_PINNED_PATH'));
    const fallbackSnapshot = json(run(['load-snapshot', root, '--json']));
    assert.deepEqual(fallbackSnapshot.pinnedFiles.configured, { pinnedPaths: [], pinnedBodies: [] });
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
    assert(invalidPayload.errors.some((error) => error.code === 'DIR_NAMING' && /Fix: rename this docs directory/.test(error.message)));
    assert(invalidPayload.errors.some((error) => error.code === 'BROKEN_LINK' && /Fix: update the link target/.test(error.message)));
    assert(invalidPayload.errors.some((error) => error.code === 'BROKEN_ANCHOR' && /Fix: update the fragment/.test(error.message)));
    assert(invalidPayload.errors.some((error) => error.code === 'TRACEABILITY_MISSING' && /Fix: add a final `## Traceability` section/.test(error.message) && /Property guidance/.test(error.message)));

    writeFileSync(join(root, 'docs/BadDir/README.md'), '# Bad Dir\n');
    // The bad directory intentionally remains invalid for validation, but index/status can still detect staleness.
    assert.equal(run(['index', root, '--json']).status, 0);
    writeFileSync(join(root, 'docs/spec/README.md'), '# Spec\n\nChanged\n');
    const staleValidate = run(['validate', root, '--include-local-memory', '--check-index', '--json']);
    assert.notEqual(staleValidate.status, 0);
    assert(JSON.parse(staleValidate.stdout).errors.some((error) => error.code === 'INDEX_STALE' && error.file === 'docs/spec/README.md' && /Fix: run `dotdotgod index <root>`/.test(error.message)));
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
