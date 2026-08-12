import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_EMBEDDING_PROFILE = Object.freeze({ provider: 'local', model: 'Xenova/multilingual-e5-small' });
export const EMBEDDING_PROVIDERS = Object.freeze(['local', 'openai-compatible', 'ollama']);

function readJson(path, label) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (error) { throw new Error(`Invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

export function validateEmbeddingProfile(profile, label = 'embedding') {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`${label} must be an object.`);
  const allowed = new Set(['provider', 'model', 'baseUrl', 'apiKey', 'apiKeyEnv']);
  const unknown = Object.keys(profile).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${label}.${unknown} is not supported.`);
  if (!EMBEDDING_PROVIDERS.includes(profile.provider)) throw new Error(`${label}.provider must be local, openai-compatible, or ollama.`);
  if (typeof profile.model !== 'string' || !profile.model.trim()) throw new Error(`${label}.model must be a non-empty string.`);
  for (const key of ['baseUrl', 'apiKey', 'apiKeyEnv']) if (profile[key] !== undefined && (typeof profile[key] !== 'string' || !profile[key].trim())) throw new Error(`${label}.${key} must be a non-empty string.`);
  if (profile.apiKey !== undefined && profile.apiKeyEnv !== undefined) throw new Error(`${label}.apiKey and ${label}.apiKeyEnv are mutually exclusive.`);
  if (profile.provider === 'local' && ['baseUrl', 'apiKey', 'apiKeyEnv'].some((key) => profile[key] !== undefined)) throw new Error(`${label} local provider does not accept remote connection fields.`);
  if (profile.baseUrl !== undefined) {
    let url;
    try { url = new URL(profile.baseUrl); } catch { throw new Error(`${label}.baseUrl must be an absolute HTTP(S) URL.`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${label}.baseUrl must use HTTP or HTTPS.`);
    if (url.username || url.password) throw new Error(`${label}.baseUrl must not contain credentials.`);
  }
  return { ...profile, model: profile.model.trim(), ...(profile.baseUrl ? { baseUrl: profile.baseUrl.replace(/\/$/, '') } : {}) };
}

export function sanitizeEmbeddingProfile(profile) {
  const { apiKey, ...safe } = profile;
  return { ...safe, ...(apiKey ? { apiKey: '[redacted]' } : {}) };
}

export function embeddingProfileIdentity(profile) {
  const { apiKey, apiKeyEnv, ...identity } = profile;
  return identity;
}

export function resolveEmbeddingProfile(root = '.', options = {}) {
  const home = options.home ?? homedir();
  const globalPath = join(home, '.dotdotgod', 'config.json');
  const projectPath = join(root, 'dotdotgod.config.json');
  const projectConfig = readJson(projectPath, 'project config');
  if (projectConfig && Object.hasOwn(projectConfig, 'embedding')) return { profile: validateEmbeddingProfile(projectConfig.embedding, 'project embedding'), source: 'project', path: projectPath };
  const globalConfig = readJson(globalPath, 'global config');
  if (globalConfig && Object.hasOwn(globalConfig, 'embedding')) return { profile: validateEmbeddingProfile(globalConfig.embedding, 'global embedding'), source: 'global', path: globalPath };
  return { profile: { ...DEFAULT_EMBEDDING_PROFILE }, source: 'default', path: null };
}
