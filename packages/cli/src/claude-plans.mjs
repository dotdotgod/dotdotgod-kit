import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';

// Preflight before initialization writes anything. Never follow settings symlinks.
export function prepareClaudePlans(root, documentationRoot) {
  const path = join(root, '.claude', 'settings.json');
  for (const target of [join(root, '.claude'), path]) {
    try {
      if (lstatSync(target).isSymbolicLink()) throw new Error(`Refusing symlink: ${target}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const base = resolve(root);
  if (existsSync(dirname(path))) {
    const rel = relative(realpathSync(base), realpathSync(dirname(path)));
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Claude settings must stay inside the project.');
  }
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  const settings = current === null ? {} : JSON.parse(current);
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Claude settings must be a JSON object.');
  const value = `./${documentationRoot}/plan`;
  if (Object.hasOwn(settings, 'plansDirectory')) return {
    status: 'skipped', path, reason: 'Existing plansDirectory preserved.', value: settings.plansDirectory,
  };
  return { status: current === null ? 'created' : 'updated', path, value, current,
    content: `${JSON.stringify({ ...settings, plansDirectory: value }, null, 2)}\n` };
}

export function applyClaudePlans(prepared, dryRun) {
  const { content, current, ...result } = prepared;
  if (!content) return result;
  if (dryRun) return { ...result, status: `would_${result.status === 'created' ? 'create' : 'update'}` };
  const latest = existsSync(prepared.path) ? readFileSync(prepared.path, 'utf8') : null;
  if (latest !== current) throw new Error('Claude settings changed during initialization; retry without overwriting them.');
  mkdirSync(dirname(prepared.path), { recursive: true });
  writeFileSync(prepared.path, content, { flag: current === null ? 'wx' : 'w' });
  return result;
}
