import { createHash } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rel } from '../primitives.mjs';
import { adapterError, DotdotgodServiceError } from './errors.mjs';
import { createAdapterFs, requireProjectRoot } from './fs-safety.mjs';
import { ADAPTER_SCHEMA_VERSION, UNSAFE_PATH_CHARS } from './types.mjs';

const SKILLS = ['ddg-planning', 'document-clarify'];
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USER_ROOTS = [
  ['.agents/skills', ['codex', 'opencode', 'pi']],
  ['.claude/skills', ['claude-code']],
  ['.gemini/config/skills', ['antigravity']],
  ['.hermes/skills', ['hermes']],
];

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRelPath(path) {
  return !UNSAFE_PATH_CHARS.test(path) && !path.includes('\\') && !win32.isAbsolute(path)
    && !/^[A-Za-z]:/u.test(path) && path.split('/').every((part) => part && part !== '.' && part !== '..');
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function* tree(fs, { path, stat }) {
  if (!stat) return;
  yield { path, stat };
  if (!stat.isDirectory()) return;
  let names;
  try {
    names = readdirSync(path).sort();
  } catch {
    throw adapterError('IO_ERROR', { target: path });
  }
  for (const name of names) yield* tree(fs, fs.inspect(join(path, name)));
}

// The caller supplies a domain-validated request. No host marker participates in skill ownership.
export function createOptionalSkillStore(ctx, { host, scope, root }) {
  const { homeDir } = ctx;
  const base = scope === 'project' ? requireProjectRoot(root, ctx) : homeDir;
  const roots = (scope === 'project' ? [['.agents/skills', ['opencode']]] : USER_ROOTS)
    .map(([path, hosts]) => ({ path: resolve(base, path), hosts }));
  const skillRoot = roots.find(({ hosts }) => hosts.includes(host)).path;
  const skillFs = createAdapterFs({ root: skillRoot, homeDir });
  const stateDir = resolve(base, '.dotdotgod/adapters/state');
  const ledgerPath = join(stateDir, 'skills.json');
  const stateFs = createAdapterFs({ root: stateDir, homeDir });

  function readLedger() {
    const snapshot = stateFs.read(ledgerPath);
    if (snapshot === null) return { snapshot, records: [] };
    const invalid = () => { throw adapterError('CONFIG_PARSE_ERROR', { target: ledgerPath }); };
    let ledger;
    try {
      ledger = JSON.parse(snapshot.toString('utf8'));
    } catch {
      invalid();
    }
    if (ledger?.schemaVersion !== ADAPTER_SCHEMA_VERSION || !Array.isArray(ledger.skills)) invalid();
    const seen = new Set();
    const records = ledger.skills.map((record) => {
      if (!object(record) || !SKILLS.includes(record.skill)) invalid();
      const { skill, targetDir, owners, managedFiles } = record;
      const location = roots.find(({ path }) => join(path, skill) === targetDir);
      if (!location || seen.has(targetDir) || !Array.isArray(owners) || new Set(owners).size !== owners.length
        || owners.some((owner) => !location.hosts.includes(owner)) || !object(managedFiles)
        || !Object.hasOwn(managedFiles, 'SKILL.md')) invalid();
      seen.add(targetDir);
      const files = Object.fromEntries(Object.entries(managedFiles).map(([path, file]) => {
        if (!validRelPath(path) || !object(file) || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)
          || !Number.isSafeInteger(file.size) || file.size < 0) invalid();
        return [path, { sha256: file.sha256, size: file.size }];
      }));
      return { skill, targetDir, owners, managedFiles: files };
    });
    return { snapshot, records };
  }

  function inspectSkill({ targetDir, managedFiles }) {
    const missing = new Set(Object.keys(managedFiles));
    const modified = [];
    const snapshots = new Map();
    for (const { path, stat } of tree(skillFs, skillFs.inspect(targetDir))) {
      const key = rel(targetDir, path);
      if (join(targetDir, key) !== path || !Object.hasOwn(managedFiles, key)) {
        if (!stat.isDirectory()) modified.push(path);
        continue;
      }
      missing.delete(key);
      if (!stat.isFile() || stat.size !== managedFiles[key].size) {
        modified.push(path);
        continue;
      }
      const bytes = skillFs.read(path);
      if (bytes === null || digest(bytes) !== managedFiles[key].sha256) modified.push(path);
      else snapshots.set(path, bytes);
    }
    return { missing: [...missing].map((rel) => join(targetDir, rel)), modified, snapshots };
  }

  function verify(record) {
    const { missing, modified, snapshots } = inspectSkill(record);
    if (missing.length || modified.length) {
      throw adapterError('MODIFIED_CONFLICT', {
        target: record.targetDir, affectedPaths: [...modified, ...missing],
      });
    }
    return snapshots;
  }

  function assertAbsent(target) {
    if (skillFs.inspect(target).stat) throw adapterError('SKILL_CONFLICT', { target });
  }

  function plan(install, withSkills) {
    const { snapshot, records } = readLedger();
    const next = new Map(records.map((record) => [record.targetDir, record]));
    const prepare = [];
    const changes = [];
    const preserved = [];
    const warnings = [];
    let ledgerChanged = false;
    for (const skill of SKILLS) {
      const targetDir = join(skillRoot, skill);
      const record = next.get(targetDir);
      if (install && !record) {
        assertAbsent(targetDir);
        let packageDir;
        try {
          packageDir = realpathSync(PACKAGE_ROOT);
        } catch {
          throw adapterError('IO_ERROR', { target: PACKAGE_ROOT });
        }
        // Trust the loaded package location, not links below it into or out of its asset tree.
        const source = join(packageDir, 'assets/optional-skills', skill);
        const sourceFs = createAdapterFs({ root: source, homeDir });
        const files = new Map();
        for (const { path, stat } of tree(sourceFs, sourceFs.inspect(source))) {
          if (stat.isDirectory()) continue;
          const key = rel(source, path);
          if (!validRelPath(key) || join(source, key) !== path) throw adapterError('IO_ERROR', { target: source });
          const bytes = sourceFs.read(path);
          if (bytes === null) throw adapterError('IO_ERROR', { target: source });
          files.set(key, bytes);
        }
        if (!files.has('SKILL.md')) throw adapterError('IO_ERROR', { target: source });
        const managedFiles = Object.fromEntries([...files].map(([path, bytes]) => [path, {
          sha256: digest(bytes), size: bytes.length,
        }]));
        next.set(targetDir, { skill, targetDir, owners: [host], managedFiles });
        prepare.push(() => {
          assertAbsent(targetDir);
          return () => {
            for (const [path, bytes] of files) skillFs.writeAtomic(join(targetDir, path), bytes, null);
          };
        });
        changes.push({ action: 'create', path: targetDir, fileCount: files.size });
        ledgerChanged = true;
        continue;
      }
      if (!record || (!install && !withSkills && !record.owners.includes(host))) continue;
      const owners = install ? [...new Set([...record.owners, host])] : record.owners.filter((owner) => owner !== host);
      const remove = !install && withSkills && owners.length === 0;
      // Detaching an owner never reads retained files or replaces their original hashes.
      if (install || remove) verify(record);
      if (remove) {
        next.delete(targetDir);
        changes.push({ action: 'remove', path: targetDir, fileCount: Object.keys(record.managedFiles).length });
        prepare.push(() => {
          const snapshots = verify(record);
          return () => {
            const dirs = new Set([targetDir]);
            for (const [path, bytes] of snapshots) {
              skillFs.removeFile(path, bytes);
              for (let dir = dirname(path); dir !== targetDir; dir = dirname(dir)) dirs.add(dir);
            }
            for (const dir of [...dirs].sort((a, b) => b.length - a.length)) skillFs.removeEmptyDir(dir);
          };
        });
        ledgerChanged = true;
      } else {
        if (install) prepare.push(() => { verify(record); });
        else {
          preserved.push({ skill, targetDir, owners: [...owners] });
          if (withSkills) warnings.push({ code: 'SKILL_SHARED_BY_OTHER_HOSTS', detail: `Other adapters still own ${skill}.` });
        }
        if (owners.length !== record.owners.length) {
          next.set(targetDir, { ...record, owners });
          ledgerChanged = true;
        }
      }
    }
    if (ledgerChanged) changes.push({ action: snapshot === null ? 'create' : 'update', path: ledgerPath });

    return {
      changes, preserved, warnings,
      apply() {
        if (!ledgerChanged) return;
        const current = stateFs.read(ledgerPath);
        if (snapshot === null ? current !== null : !current?.equals(snapshot)) {
          throw adapterError('CONCURRENT_MODIFICATION', { target: ledgerPath });
        }
        // Recheck installs/removals before the first write; each unlink also checks the exact bytes.
        for (const mutate of prepare.map((check) => check())) mutate?.();
        stateFs.writeAtomic(ledgerPath, JSON.stringify({ schemaVersion: ADAPTER_SCHEMA_VERSION, skills: [...next.values()] }, null, 2) + '\n', snapshot);
      },
    };
  }

  return {
    ledgerPath,
    planInstall: () => plan(true, true),
    planUninstall: ({ withSkills = false } = {}) => plan(false, withSkills),
    status() {
      try {
        const { records } = readLedger();
        const skills = records.filter(({ owners }) => owners.includes(host)).map((record) => {
          const { skill, targetDir, owners } = record;
          const { missing, modified } = inspectSkill(record);
          return { skill, targetDir, owners, missing, modified };
        });
        const status = skills.length === 0 ? 'not-installed'
          : skills.some(({ modified }) => modified.length) ? 'modified'
          : skills.length < SKILLS.length || skills.some(({ missing }) => missing.length) ? 'partial' : 'installed';
        return { status, skills };
      } catch (error) {
        if (!(error instanceof DotdotgodServiceError)) throw error;
        return { status: 'modified', issue: error.code, skills: [] };
      }
    },
  };
}
