import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const { validatePlanModePolicy, normalizePlanModePolicy, validateMemoryConfigData } = createRequire(import.meta.url)('@dotdotgod/cli/src/memory/config.mjs') as {
  validatePlanModePolicy(policy: unknown, options: { allowAbsolutePaths: boolean }): { field: string; message: string }[];
  normalizePlanModePolicy(policy: unknown): PlanPolicy;
  validateMemoryConfigData(data: unknown, root?: string, file?: string): { field: string; message: string }[];
};

export type PlanPolicy = {
  commands: { effect: 'allow' | 'deny'; executable: string; args: string[]; cwd: string }[];
  markdown: { allow: string[]; deny: string[] };
};
export type PolicySnapshot = {
  path: string;
  revision: string;
  data: Record<string, unknown>;
  policy: PlanPolicy;
  error?: string;
};
const emptyPolicy = (): PlanPolicy => ({ commands: [], markdown: { allow: [], deny: [] } });
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

export function loadPolicyFile(path: string, options: { allowAbsolutePaths?: boolean } = {}): PolicySnapshot {
  const snapshot: PolicySnapshot = { path: resolve(path), revision: '', data: {}, policy: emptyPolicy() };
  try {
    for (let parent = dirname(snapshot.path); dirname(parent) !== parent; parent = dirname(parent)) {
      try {
        if (lstatSync(parent).isSymbolicLink()) throw new Error(`Policy parent is a symlink: ${parent}`);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    try {
      if (lstatSync(snapshot.path).isSymbolicLink()) throw new Error(`Policy file is a symlink: ${snapshot.path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return snapshot;
      throw error;
    }
    const raw = readFileSync(snapshot.path, 'utf8');
    snapshot.revision = createHash('sha256').update(raw).digest('hex');
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Config must be a JSON object.');
    snapshot.data = data as Record<string, unknown>;
    if (options.allowAbsolutePaths === false) {
      const errors = validateMemoryConfigData(snapshot.data, dirname(snapshot.path), snapshot.path);
      if (errors.length) throw new Error(errors.map(error => `${error.field}: ${error.message}`).join('\n'));
    }
    if (snapshot.data.planMode !== undefined) {
      const errors = validatePlanModePolicy(snapshot.data.planMode, { allowAbsolutePaths: options.allowAbsolutePaths !== false });
      if (errors.length) throw new Error(errors.map((error: { field: string; message: string }) => `${error.field}: ${error.message}`).join('\n'));
      snapshot.policy = normalizePlanModePolicy(snapshot.data.planMode);
    }
  } catch (error) { snapshot.error = message(error); }
  return snapshot;
}
