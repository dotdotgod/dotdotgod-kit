import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractMemoryReferences, sharedLocalReferences } from '../src/validate/references.mjs';
import { defaultMemoryConfig } from '../src/memory/config.mjs';
import { validateTraceabilityBlock } from '../src/docs/traceability.mjs';

const root = '/project';
const file = '/project/docs/test/README.md';
const config = defaultMemoryConfig();
const check = (text, source = file, policy = config) => sharedLocalReferences(text, root, source, policy);

test('policy A separates concrete paths from inline-code layout examples', () => {
  const text = '`docs/plan/task/README.md` `docs/plan/` `docs/plan/<task>/README.md` `docs/plan/**` `echo docs/plan/task/README.md`';
  assert.deepEqual(check(text).map((item) => item.target), ['docs/plan/task/README.md']);
  assert.equal(check('`docs/plan`').length, 0);
  assert.equal(check('`docs/plan/task/NOTES`').length, 1);
  assert.equal(check('[directory](../plan/)').length, 1);
  assert.equal(check('`../plan/task/README.md#section`').length, 1);
  assert.equal(check('[missing](../plan/task/MISSING.md?view=1#title)').length, 1);
  assert.equal(check('[encoded](../%70lan/task/README.md)').length, 1);
});

test('links, images and reference styles preserve original lines and avoid duplicate labels', () => {
  const text = '```md\n[ignored](../plan/A.md)\n```\n[one](../plan/A.md "title")\n![two](<../plan/B.md>)\n[three][ref]\n[ref]: ../plan/C.md\n`docs/plan/D.md`\n[`docs/plan/E.md`](../plan/E.md)';
  const items = check(text);
  assert.deepEqual(items.map((item) => item.line).sort((a, b) => a - b), [4, 5, 6, 8, 9]);
  assert.equal(check('[ref][]\n[ref]: ../plan/A.md').length, 1);
  assert.equal(check('[ref]\n[ref]: ../plan/A.md').length, 1);
  assert.equal(check('[one](../plan/A\\(B\\).md)').length, 1);
  assert.equal(check('[one](../plan/A(B).md)').length, 1);
  assert.equal(check('\\[literal](../plan/A.md)').length, 0);
});

test('examples, comments, URLs and generated traceability stay outside the new pass', () => {
  const text = '<!-- dotdotgod:traceability-links:start version=1 source=json-dotdotgod -->\n[x](../plan/A.md)\n<!-- dotdotgod:traceability-links:end -->\n```json dotdotgod\n{"relatedDocs":["docs/plan/A.md"]}\n```\n<!-- `docs/plan/A.md` -->\n[web](https://example.com/docs/plan/A.md)\n`[example](../plan/A.md)`';
  assert.equal(check(text).length, 0);
  assert.equal(extractMemoryReferences('~~~~md\n`docs/plan/A.md`\n~~~~~').length, 0);
  assert.equal(check('```md\n<!-- unclosed example\n```\n`docs/plan/A.md`').length, 1);
  assert.equal(check('<!--\n```md\n-->\n`docs/plan/A.md`').length, 1);
});

test('scope follows source, custom paths, first-match precedence and exclusions', () => {
  assert.equal(check('`docs/plan/A.md`', '/project/docs/plan/README.md').length, 0);
  assert.equal(check('`docs/test/README.md`').length, 0);
  assert.equal(check('`docs/test/README.md`', '/project/docs/plan/README.md').length, 0);
  assert.equal(check('`docs/plan/A.md`', '/project/unclassified.md').length, 0);
  const policy = { areas: [
    { id: 'public', scope: 'shared', paths: ['memory/private/PUBLIC.md'] },
    { id: 'private', scope: 'local', paths: ['memory/private/**'], excludePaths: ['memory/private/EXCLUDED.md'] },
    { id: 'shared', scope: 'shared', paths: ['memory/**'] },
  ] };
  const text = '`memory/private/A.md` `memory/private/PUBLIC.md` `memory/private/EXCLUDED.md` `memory/private-other/A.md`';
  assert.deepEqual(check(text, '/project/memory/README.md', policy).map((item) => item.target), ['memory/private/A.md']);
});

test('traceability retains local-target prohibition from local sources and nested contracts', () => {
  const errors = validateTraceabilityBlock({ kind: 'spec', implementedBy: [], verifiedBy: [], relatedDocs: ['docs/plan/A.md'], designDecisions: [], contracts: [{ id: 'TEST', title: 'Test', relatedDocs: ['docs/plan/B.md'] }] }, root, '/project/docs/plan/README.md');
  assert.equal(errors.filter((item) => item.code === 'TRACEABILITY_LOCAL_MEMORY_TARGET').length, 2);
});

test('CLI scope errors remain active without link checks or local-memory scanning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reference-scope-'));
  try {
    mkdirSync(join(dir, 'docs/test'), { recursive: true });
    mkdirSync(join(dir, 'docs/plan'), { recursive: true });
    writeFileSync(join(dir, '.gitignore'), 'docs/plan\ndocs/archive\n.dotdotgod\n');
    writeFileSync(join(dir, 'docs/test/README.md'), '# Shared\n`docs/plan/MISSING.md`\n[local](../plan/README.md)\n');
    writeFileSync(join(dir, 'docs/plan/README.md'), '# Local\n`docs/plan/MISSING.md`\n[test](../test/README.md)\n');
    for (const flags of [[], ['--include-local-memory']]) {
      const result = spawnSync(process.execPath, ['bin/dotdotgod.mjs', 'validate', dir, '--json', '--no-link-check', ...flags], { encoding: 'utf8' });
      const report = JSON.parse(result.stdout);
      assert.equal(result.status, 1);
      assert.deepEqual(report.errors.map((item) => item.code), ['SHARED_LOCAL_MEMORY_REFERENCE', 'SHARED_LOCAL_MEMORY_REFERENCE']);
      assert.ok(report.errors.every((item) => item.file === 'docs/test/README.md'));
    }
    writeFileSync(join(dir, 'docs/plan/README.md'), '# Local\n[missing](MISSING.md)\n[anchor](../test/README.md#absent)\n');
    const result = spawnSync(process.execPath, ['bin/dotdotgod.mjs', 'validate', dir, '--json', '--include-local-memory'], { encoding: 'utf8' });
    const errors = JSON.parse(result.stdout).errors;
    assert.ok(errors.some((item) => item.code === 'BROKEN_LINK'));
    assert.ok(errors.some((item) => item.code === 'BROKEN_ANCHOR'));
    assert.equal(errors.filter((item) => item.code === 'SHARED_LOCAL_MEMORY_REFERENCE').length, 2);
    mkdirSync(join(dir, 'handbook/test'), { recursive: true });
    writeFileSync(join(dir, 'dotdotgod.config.json'), JSON.stringify({ documentation: { root: 'handbook' }, validation: { markdown: { exclude: ['handbook/test/README.md'] } } }));
    writeFileSync(join(dir, '.gitignore'), 'handbook/plan\nhandbook/archive\n.dotdotgod\n');
    writeFileSync(join(dir, 'handbook/test/README.md'), '# Custom root\n`handbook/plan/MISSING.md`\n[local](../plan/MISSING.md)\n');
    const custom = spawnSync(process.execPath, ['bin/dotdotgod.mjs', 'validate', dir, '--json', '--no-link-check'], { encoding: 'utf8' });
    assert.deepEqual(JSON.parse(custom.stdout).errors.map((item) => item.code), ['SHARED_LOCAL_MEMORY_REFERENCE', 'SHARED_LOCAL_MEMORY_REFERENCE']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
