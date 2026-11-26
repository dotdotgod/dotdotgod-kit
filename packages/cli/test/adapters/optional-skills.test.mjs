import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync,
  statSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createOptionalSkillStore } from '../../src/adapters/optional-skills.mjs';

function fixture(t) {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'ddg-optional-skills-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const homeDir = join(dir, 'home');
  const root = join(dir, 'project');
  for (const path of [homeDir, root]) mkdirSync(path);
  const ctx = { homeDir, cwd: root };
  const store = (host = 'codex', scope = 'user') => createOptionalSkillStore(ctx, { host, scope, root });
  const skillRoot = join(homeDir, '.agents/skills');
  const stateDir = join(homeDir, '.dotdotgod/adapters/state');
  const ledger = join(stateDir, 'skills.json');
  const read = () => JSON.parse(readFileSync(ledger, 'utf8'));
  return { dir, homeDir, root, store, skillRoot, stateDir, ledger, read };
}

const names = ['ddg-planning', 'document-clarify'];

function assertOwners(read, owners) {
  const records = read().skills;
  assert.deepEqual(records.map(({ skill }) => skill), names);
  for (const record of records) assert.deepEqual(record.owners, owners);
}

test('U-5: read-only preview, Codex/Pi sharing, verified removal stops at the skills root', (t) => {
  const { homeDir, store, skillRoot, stateDir, ledger, read } = fixture(t);
  assert.equal(store('pi').status().status, 'not-installed');
  const install = store().planInstall();
  assert.deepEqual(install.changes.map(({ action }) => action), ['create', 'create', 'create']);
  assert.deepEqual(readdirSync(homeDir), []);
  install.apply();
  assert.equal(statSync(stateDir).mode & 0o777, 0o700);
  assert.equal(statSync(ledger).mode & 0o777, 0o600);
  const bundled = new URL('../../assets/optional-skills/ddg-planning/roles/implementer.md', import.meta.url);
  const file = join(skillRoot, 'ddg-planning', 'roles', 'implementer.md');
  const bytes = readFileSync(bundled);
  assert.deepEqual(readFileSync(file), bytes);
  assert.deepEqual(read().skills[0].managedFiles['roles/implementer.md'], {
    sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
  });
  store('pi').planInstall().apply();
  assert.equal(store('pi').status().status, 'installed');
  assertOwners(read, ['codex', 'pi']);
  store().planUninstall().apply();
  assertOwners(read, ['pi']);
  assert.deepEqual(readFileSync(file), bytes);
  const remove = store('pi').planUninstall({ withSkills: true });
  assert.equal(existsSync(file), true);
  remove.apply();
  assert.deepEqual(readdirSync(skillRoot), []);
  assert.deepEqual(readdirSync(stateDir), ['skills.json']);
  assert.deepEqual(read().skills, []);
  assert.equal(store('pi').status().status, 'not-installed');
});

test('U-5: last owner detaches, reinstalls without conflict, and can clean orphans without a host marker', (t) => {
  const { store, ledger, read, skillRoot } = fixture(t);
  store().planInstall().apply();
  const installed = read();
  const file = join(skillRoot, 'document-clarify', 'agents', 'openai.yaml');
  const original = readFileSync(file);
  const detach = store().planUninstall();
  writeFileSync(file, 'customized');
  detach.apply();
  assert.deepEqual(read().skills, installed.skills.map((record) => ({ ...record, owners: [] })));
  assert.deepEqual(readdirSync(skillRoot).sort(), names);
  assert.equal(readFileSync(file, 'utf8'), 'customized');
  assert.equal(store().status().status, 'not-installed');
  assert.throws(() => store().planInstall(), { code: 'MODIFIED_CONFLICT' });
  assert.throws(() => store().planUninstall({ withSkills: true }), { code: 'MODIFIED_CONFLICT' });
  writeFileSync(file, original);
  store().planInstall().apply();
  assert.deepEqual(read(), installed);
  const snapshot = readFileSync(ledger);
  assert.deepEqual(store().planInstall().changes, []);
  store().planInstall().apply();
  assert.deepEqual(readFileSync(ledger), snapshot);
  store().planUninstall().apply();
  store().planUninstall({ withSkills: true }).apply();
  assert.deepEqual(readdirSync(skillRoot), []);
  assert.deepEqual(read().skills, []);
});

test('U-5: explicit shared detach warns and preserves customized files and original hashes', (t) => {
  const { store, read, skillRoot } = fixture(t);
  store().planInstall().apply();
  store('pi').planInstall().apply();
  const original = read();
  const file = join(skillRoot, 'ddg-planning', 'roles', 'implementer.md');
  writeFileSync(file, 'customized');
  const remove = store().planUninstall({ withSkills: true });
  assert.deepEqual(remove.warnings.map(({ code }) => code), names.map(() => 'SKILL_SHARED_BY_OTHER_HOSTS'));
  remove.apply();
  assert.deepEqual(read().skills, original.skills.map((record) => ({ ...record, owners: ['pi'] })));
  assert.equal(readFileSync(file, 'utf8'), 'customized');
  assert.throws(() => store('pi').planUninstall({ withSkills: true }), { code: 'MODIFIED_CONFLICT' });
  assert.deepEqual(readdirSync(skillRoot).sort(), names);
  const repeat = store().planUninstall({ withSkills: true });
  assert.deepEqual(repeat.changes, []);
  assert.equal(repeat.warnings.length, 2);
});

test('U-5: project ledger is isolated; host-specific targets have separate records', (t) => {
  const { store, homeDir, root, read, ledger, skillRoot } = fixture(t);
  const config = join(homeDir, '.dotdotgod/config.json');
  const unrelated = join(skillRoot, 'my-skill');
  mkdirSync(join(homeDir, '.dotdotgod'));
  mkdirSync(unrelated, { recursive: true });
  writeFileSync(config, 'not an installer input');
  store().planInstall().apply();
  const userSnapshot = readFileSync(ledger);
  const project = store('opencode', 'project');
  project.planInstall().apply();
  assert.deepEqual(readFileSync(ledger), userSnapshot);
  assert.deepEqual(readdirSync(join(root, '.agents/skills')).sort(), names);
  assert.deepEqual(readdirSync(join(root, '.dotdotgod/adapters/state')), ['skills.json']);
  project.planUninstall({ withSkills: true }).apply();
  for (const [host, dir] of [['claude-code', '.claude'], ['hermes', '.hermes'], ['antigravity', '.gemini/config']]) {
    store(host).planInstall().apply();
    assert.deepEqual(readdirSync(join(homeDir, dir, 'skills')).sort(), names);
    assert.equal(read().skills.filter(({ owners }) => owners.includes(host)).length, 2);
  }
  assert.deepEqual(readdirSync(skillRoot).sort(), [...names, 'my-skill']);
  store().planUninstall({ withSkills: true }).apply();
  assert.deepEqual(readdirSync(skillRoot), ['my-skill']);
  assert.equal(readFileSync(config, 'utf8'), 'not an installer input');
});

test('U-5: conflicts preflight both skills without writing either', (t) => {
  const { store, skillRoot, ledger } = fixture(t);
  const existing = join(skillRoot, 'document-clarify');
  mkdirSync(existing, { recursive: true });
  assert.throws(() => store().planInstall(), { code: 'SKILL_CONFLICT', exitCode: 1 });
  assert.deepEqual(readdirSync(skillRoot), ['document-clarify']);
  assert.equal(existsSync(ledger), false);
});

test('U-5: changed, missing or extra files block re-ownership and physical deletion', (t) => {
  const { store, skillRoot, ledger } = fixture(t);
  store().planInstall().apply();
  const snapshot = readFileSync(ledger);
  const file = join(skillRoot, 'document-clarify/SKILL.md');
  const first = join(skillRoot, 'ddg-planning/SKILL.md');
  const bytes = readFileSync(file);
  const changed = Buffer.from(bytes);
  changed[0] ^= 1;
  const remove = store().planUninstall({ withSkills: true });
  for (const change of [() => writeFileSync(file, changed), () => unlinkSync(file),
    () => writeFileSync(join(skillRoot, 'document-clarify/local.md'), 'local')]) {
    change();
    assert.throws(() => remove.apply(), { code: 'MODIFIED_CONFLICT', exitCode: 1 });
    assert.throws(() => store('pi').planInstall(), { code: 'MODIFIED_CONFLICT', exitCode: 1 });
    assert.throws(() => store().planUninstall({ withSkills: true }), { code: 'MODIFIED_CONFLICT', exitCode: 1 });
    assert.deepEqual(readFileSync(ledger), snapshot);
    assert.equal(existsSync(first), true);
    writeFileSync(file, bytes);
  }
});

test('U-5: a literal backslash in a native filename cannot alias a nested ledger key', { skip: process.platform === 'win32' }, (t) => {
  const { store, skillRoot } = fixture(t);
  store().planInstall().apply();
  const skill = join(skillRoot, 'document-clarify');
  const nested = join(skill, 'agents', 'openai.yaml');
  const alias = join(skill, 'agents\\openai.yaml');
  const original = readFileSync(nested);
  renameSync(nested, alias);
  assert.throws(() => store('pi').planInstall(), { code: 'MODIFIED_CONFLICT' });
  assert.throws(() => store().planUninstall({ withSkills: true }), { code: 'MODIFIED_CONFLICT' });
  assert.deepEqual(readFileSync(alias), original);
});

test('U-5 / SEC-D1: forged ledger names, paths and owner data fail closed', (t) => {
  const { store, skillRoot, ledger, read, dir } = fixture(t);
  store().planInstall().apply();
  const outside = join(dir, 'sentinel');
  writeFileSync(outside, 'preserve');
  const valid = read();
  for (const tamper of [
    (r) => { r.skill = 'sentinel'; },
    (r) => { r.targetDir = outside; },
    (r) => { r.owners = ['hermes']; },
    ...['../sentinel', 'roles/../SKILL.md', '/sentinel', 'C:sentinel', 'bad\\file', 'bad\u0000file']
      .map((path) => (r) => { r.managedFiles[path] = r.managedFiles['SKILL.md']; }),
  ]) {
    const value = structuredClone(valid);
    tamper(value.skills[1]);
    const forged = JSON.stringify(value);
    writeFileSync(ledger, forged);
    assert.throws(() => store().planUninstall({ withSkills: true }), { code: 'CONFIG_PARSE_ERROR', exitCode: 1 });
    assert.equal(store().status().status, 'modified');
    assert.equal(readFileSync(ledger, 'utf8'), forged);
    assert.equal(readFileSync(outside, 'utf8'), 'preserve');
    for (const name of names) assert.equal(existsSync(join(skillRoot, name, 'SKILL.md')), true);
  }
});

test('U-5 / SEC-D1: nested symlink is refused before any planned writes', (t) => {
  const { dir, store, skillRoot, ledger } = fixture(t);
  store().planInstall().apply();
  const outside = join(dir, 'outside.yaml');
  writeFileSync(outside, 'preserve');
  const yaml = join(skillRoot, 'document-clarify/agents/openai.yaml');
  const removal = store().planUninstall({ withSkills: true });
  const snapshot = readFileSync(ledger);
  unlinkSync(yaml);
  symlinkSync(outside, yaml);
  assert.throws(() => removal.apply(), { code: 'SYMLINK_REJECTED', exitCode: 1 });
  assert.throws(() => store('pi').planInstall(), { code: 'SYMLINK_REJECTED', exitCode: 1 });
  assert.deepEqual(readFileSync(ledger), snapshot);
  assert.equal(existsSync(join(skillRoot, 'ddg-planning/SKILL.md')), true);
  assert.equal(readFileSync(outside, 'utf8'), 'preserve');
});

test('U-5: linked package ancestry works but links below the trusted package root are refused', (t) => {
  const { dir, homeDir, ledger, read } = fixture(t);
  const packageDir = join(dir, 'real', 'cli');
  const packageLink = join(dir, 'linked');
  const adapters = join(packageDir, 'src', 'adapters');
  const assets = join(packageDir, 'assets', 'optional-skills');
  mkdirSync(adapters, { recursive: true });
  mkdirSync(join(packageDir, 'assets'));
  symlinkSync(join(dir, 'real'), packageLink, 'junction');
  for (const name of ['optional-skills', 'errors', 'fs-safety', 'types']) {
    cpSync(new URL(`../../src/adapters/${name}.mjs`, import.meta.url), join(adapters, `${name}.mjs`));
  }
  cpSync(new URL('../../src/primitives.mjs', import.meta.url), join(packageDir, 'src', 'primitives.mjs'));
  cpSync(new URL('../../assets/optional-skills', import.meta.url), assets, { recursive: true });
  const entry = pathToFileURL(join(packageLink, 'cli', 'src', 'adapters', 'optional-skills.mjs')).href;
  const run = (home, expected) => {
    const result = spawnSync(process.execPath, ['--preserve-symlinks', '--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import { createOptionalSkillStore } from ${JSON.stringify(entry)};
      const [homeDir, expected] = process.argv.slice(1);
      const install = () => createOptionalSkillStore({ homeDir }, { host: 'pi', scope: 'user' }).planInstall().apply();
      if (expected) assert.throws(install, { code: expected });
      else install();
    `, home, expected], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  };
  run(homeDir, '');
  assertOwners(read, ['pi']);
  const snapshot = readFileSync(ledger);
  const outside = join(dir, 'outside.yaml');
  const asset = join(assets, 'document-clarify', 'agents', 'openai.yaml');
  const original = readFileSync(asset);
  writeFileSync(outside, 'outside');
  unlinkSync(asset);
  symlinkSync(outside, asset);
  const secondHome = join(dir, 'unused-home');
  run(secondHome, 'SYMLINK_REJECTED');
  unlinkSync(asset);
  writeFileSync(asset, original);
  const outsideAssets = join(dir, 'outside-assets');
  renameSync(assets, outsideAssets);
  symlinkSync(outsideAssets, assets, 'junction');
  run(secondHome, 'SYMLINK_REJECTED');
  assert.equal(existsSync(secondHome), false);
  assert.deepEqual(readFileSync(ledger), snapshot);
});

test('DN-06: stale plans cannot change files after a ledger update', (t) => {
  const { store, ledger, read, skillRoot } = fixture(t);
  store().planInstall().apply();
  const removal = store().planUninstall({ withSkills: true });
  store('pi').planInstall().apply();
  const snapshot = readFileSync(ledger);
  assert.throws(() => removal.apply(), { code: 'CONCURRENT_MODIFICATION', exitCode: 1 });
  assert.deepEqual(readFileSync(ledger), snapshot);
  assertOwners(read, ['codex', 'pi']);
  assert.deepEqual(readdirSync(skillRoot).sort(), names);
});
