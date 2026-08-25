import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const EMBEDDING_RUNTIME_PACKAGE = '@huggingface/transformers';
export const EMBEDDING_RUNTIME_VERSION = '4.2.0';

export class EmbeddingRuntimeMissingError extends Error {
  constructor() { super('Optional local embedding runtime is not installed.'); this.name = 'EmbeddingRuntimeMissingError'; this.code = 'EMBEDDING_RUNTIME_MISSING'; }
}

export function embeddingRuntimeRoot(options = {}) { return join(options.home ?? homedir(), '.dotdotgod', 'runtime', 'embedding'); }

export function resolvePersistentTransformers(options = {}) {
  const root = embeddingRuntimeRoot(options);
  try {
    const require = createRequire(join(root, 'package.json'));
    return require.resolve(EMBEDDING_RUNTIME_PACKAGE);
  } catch { throw new EmbeddingRuntimeMissingError(); }
}

export function embeddingRuntimeStatus(options = {}) {
  const root = embeddingRuntimeRoot(options);
  try {
    const require = createRequire(join(root, 'package.json'));
    const packagePath = require.resolve(`${EMBEDDING_RUNTIME_PACKAGE}/package.json`);
    const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
    return { ok: true, installed: true, installAvailable: true, package: EMBEDDING_RUNTIME_PACKAGE, requiredVersion: EMBEDDING_RUNTIME_VERSION, packageVersion: version, location: root };
  } catch {
    return { ok: true, installed: false, installAvailable: true, package: EMBEDDING_RUNTIME_PACKAGE, requiredVersion: EMBEDDING_RUNTIME_VERSION, packageVersion: null, location: root };
  }
}

export function installEmbeddingRuntime(options = {}) {
  if (options.confirm !== true) throw new Error('Embedding runtime installation requires explicit confirmation.');
  const root = embeddingRuntimeRoot(options);
  const lock = join(root, '.installing');
  if (existsSync(lock)) throw new Error('Embedding runtime installation is already in progress.');
  mkdirSync(root, { recursive: true });
  writeFileSync(lock, `${process.pid}\n`, { flag: 'wx' });
  try {
    const spawn = options.spawnImpl ?? spawnSync;
    const result = spawn(options.npmCommand ?? 'npm', ['install', '--prefix', root, '--save-exact', '--omit=dev', '--no-audit', '--no-fund', `${EMBEDDING_RUNTIME_PACKAGE}@${EMBEDDING_RUNTIME_VERSION}`], { encoding: 'utf8', timeout: options.timeoutMs ?? 300_000, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.error || result.status !== 0) throw new Error(result.error?.code === 'ENOENT' ? 'npm is unavailable.' : 'Embedding runtime installation failed.');
    const status = embeddingRuntimeStatus({ home: options.home });
    if (!status.installed) throw new Error('Embedding runtime installation could not be verified.');
    return { ...status, command: 'embedding install', modelDownloadPending: true };
  } finally { rmSync(lock, { force: true }); }
}

export async function importTransformers(options = {}) {
  try { return await import(EMBEDDING_RUNTIME_PACKAGE); }
  catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    const path = resolvePersistentTransformers(options);
    return import(pathToFileURL(path).href);
  }
}
