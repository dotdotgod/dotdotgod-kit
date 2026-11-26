import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readProjectConfig } from '../memory/config.mjs';

const MAX_CONFIG_BYTES = 256 * 1024;
const DEFAULT_PROFILE = Object.freeze({ mode: 'advisory', delivery: 'advice', fallback: 'advisory', timeoutMs: 2000 });
const FALLBACK_MODES = ['advisory', 'manual', 'always'];
const MODES = [...FALLBACK_MODES, 'model'];
const PROVIDERS = ['ollama', 'openai-compatible', 'host'];
const CONNECTION_FIELDS = ['baseUrl', 'apiKey', 'apiKeyEnv'];
const FIELDS = new Set([...Object.keys(DEFAULT_PROFILE), 'provider', 'model', ...CONNECTION_FIELDS]);
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function readConfigJson(path) {
  let entry;
  try { entry = lstatSync(path); }
  catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error('Cannot inspect config file.');
  }
  if (!entry.isFile()) throw new Error('Config must be a regular file, not a symlink or special file.');
  let fd;
  try { fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch { throw new Error('Cannot open config file without following symlinks.'); }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error('Config must be a regular file.');
    if (stat.size > MAX_CONFIG_BYTES) throw new Error('Config exceeds 256 KiB.');
    // Read at most one byte beyond the limit even if the file grows after fstat.
    const bytes = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_CONFIG_BYTES) throw new Error('Config exceeds 256 KiB.');
    try { return JSON.parse(bytes.toString('utf8', 0, length)); }
    catch { throw new Error('Invalid JSON in config file.'); }
  } finally { closeSync(fd); }
}

function loopback(hostname) {
  return hostname === 'localhost' || hostname === 'localhost.' || hostname === '[::1]'
    || /^127\.\d+\.\d+\.\d+$/.test(hostname) || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]+\]$/.test(hostname);
}

function decisionBaseUrl(baseUrl, hasCredential) {
  const input = baseUrl.trim().replace(/[\t\r\n]/g, '');
  const authority = /^https?:\/\/([^/\\?#]+)/i.exec(input)?.[1];
  const url = URL.parse(input);
  if (!authority || !url || !['http:', 'https:'].includes(url.protocol)) throw new Error('decision.baseUrl must be an absolute HTTP(S) URL.');
  if (authority.includes('@') || url.username || url.password || /[?#]/.test(url.href)) {
    throw new Error('decision.baseUrl must not contain userinfo, a query, or a fragment.');
  }
  const host = url.hostname;
  if (/^(?:169\.254\.|0\.)\d/.test(host) || /^\[(?:(?:fe[89ab][\da-f]):|::ffff:(?:a9fe|[\da-f]{1,2}):|::\])/.test(host)) {
    throw new Error('decision.baseUrl must not target a link-local or unspecified address.');
  }
  if (hasCredential && url.protocol === 'http:' && !loopback(host)) throw new Error('decision.baseUrl must use HTTPS with credentials on non-loopback hosts.');
  return url.href.replace(/\/+$/, '');
}

export function validateDecisionProfile(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('decision must be an object.');
  if (Object.keys(data).some((key) => !FIELDS.has(key))) throw new Error('decision contains an unsupported field.');
  const profile = { ...DEFAULT_PROFILE, ...data };
  if (!MODES.includes(profile.mode)) throw new Error('decision.mode must be advisory, manual, always, or model.');
  if (!['advice', 'prefetch'].includes(profile.delivery)) throw new Error('decision.delivery must be advice or prefetch.');
  if (!FALLBACK_MODES.includes(profile.fallback)) throw new Error('decision.fallback must be advisory, manual, or always.');
  if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 200 || profile.timeoutMs > 15000) throw new Error('decision.timeoutMs must be an integer from 200 to 15000.');
  if ((profile.mode === 'model' || profile.provider !== undefined) && !PROVIDERS.includes(profile.provider)) throw new Error('decision.provider must be ollama, openai-compatible, or host.');
  const needsModel = profile.mode === 'model' && profile.provider !== 'host';
  if (needsModel || profile.model !== undefined) {
    if (typeof profile.model !== 'string' || !profile.model.trim()) throw new Error('decision.model must be a non-empty string.');
    profile.model = profile.model.trim();
  }
  if (profile.provider === 'host' && CONNECTION_FIELDS.some((key) => profile[key] !== undefined)) throw new Error('decision provider host does not accept baseUrl, apiKey, or apiKeyEnv.');
  for (const key of CONNECTION_FIELDS) {
    if (profile[key] !== undefined && (typeof profile[key] !== 'string' || !profile[key].trim())) throw new Error(`decision.${key} must be a non-empty string.`);
  }
  if (profile.apiKey !== undefined && profile.apiKeyEnv !== undefined) throw new Error('decision.apiKey and decision.apiKeyEnv are mutually exclusive.');
  if (profile.apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(profile.apiKeyEnv)) throw new Error('decision.apiKeyEnv must be an environment variable name.');
  if (profile.baseUrl !== undefined) profile.baseUrl = decisionBaseUrl(profile.baseUrl, Boolean(profile.apiKey || profile.apiKeyEnv));
  return profile;
}

export function resolveDecisionProfile(root = '.', { home = homedir(), project = readProjectConfig(root) } = {}) {
  if (project.errors.length) return { source: 'invalid', path: project.path, profile: null };
  if (project.profiles.decision) return { source: 'project', path: project.path, profile: project.profiles.decision };
  const path = join(home, '.dotdotgod', 'config.json');
  try {
    const global = readConfigJson(path);
    if (global !== undefined) {
      if (!global || typeof global !== 'object' || Array.isArray(global)) throw new Error('Global config must be a JSON object.');
      if (Object.hasOwn(global, 'decision')) return { source: 'global', path, profile: validateDecisionProfile(global.decision) };
    }
  } catch (error) { return { source: 'invalid', path, profile: null, error: error.message }; }
  return { source: 'default', path: null, profile: { ...DEFAULT_PROFILE } };
}

export function sanitizeDecisionProfile(profile, source) {
  if (!profile) return null;
  const { apiKey, ...safe } = profile;
  if (apiKey !== undefined) safe.apiKey = '[redacted]';
  const endpoint = profile.baseUrl ?? (profile.provider === 'openai-compatible' ? OPENAI_BASE_URL : null);
  // Validation canonicalizes the endpoint; use its authority without parsing it again.
  const host = endpoint?.split('/')[2].replace(/:\d+$/, '');
  if (source === 'project' && host && !loopback(host)) {
    const credential = profile.apiKeyEnv ? ` and the credential from apiKeyEnv (${profile.apiKeyEnv})` : apiKey ? ' and a configured API key' : '';
    safe.warning = `Project decision config can send prompt/repo metadata${credential} to remote ${endpoint}; verify repository trust.`;
  }
  return safe;
}
