import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { parse, relative, resolve } from 'node:path';

export function rel(root, file) {
  return relative(root, file).replaceAll('\\', '/');
}

export const CACHE_VERSION = 15;
export const CACHE_DIR = '.dotdotgod';
export const MANIFEST_FILE = 'manifest.json';

// Legacy export names: root is a relative-path default, not an access boundary.

export function resolveWithinRoot(root, candidate = '.') {
  const base = resolve(root || process.cwd());
  const target = resolve(base, candidate);
  return target;
}

export function resolveExistingWithinRoot(root, candidate = '.') {
  const base = realpathSync(resolve(root || process.cwd()));
  const target = realpathSync(resolveWithinRoot(base, candidate));
  return target;
}

// Fixed lifetime for persisted context payloads, independent of scope/session.
export const RETENTION_MS = 24 * 60 * 60 * 1000;

export function rejectCustomTtl(input) {
  if (Object.hasOwn(input, 'ttlMs')) throw new Error('ttlMs is no longer supported; context data expires after 24 hours.');
}

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

export function validateSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID.test(value) || value.toLowerCase() === 'default') {
    throw new TypeError('sessionId must be an opaque 1-128 character identifier using letters, digits, dot, underscore, tilde, or hyphen; default is reserved.');
  }
  return value;
}

export function resolveSessionId(value) {
  return value == null ? crypto.randomUUID() : validateSessionId(value);
}

const TERMINAL_ESCAPES = /(?:\x1B\]|\x9D)[\s\S]*?(?:\x07|\x1B\\|\x9C|$)|(?:\x1B[P_^X]|[\x90\x98\x9E\x9F])[\s\S]*?(?:\x1B\\|\x9C|$)|(?:\x1B\[|\x9B)[0-?]*[ -/]*[@-~]|\x1B[ -/]*[@-Z\\-_]/g;

export function sanitizeTerminalText(value) {
  return String(value).replace(TERMINAL_ESCAPES, '').replace(/[\x00-\x1F\x7F-\x9F]/g, ' ');
}

export function maskHomePath(value, home) {
  if (home === undefined) {
    try { home = homedir(); }
    catch { home = process.env.HOME || process.env.USERPROFILE; }
  }
  return home && home !== parse(home).root ? value.replaceAll(home, '~') : value;
}

export function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function formatHookError(error) {
  const raw = error instanceof Error ? error.message : String(error ?? 'unknown error');
  const clean = maskHomePath(sanitizeTerminalText(raw)).replace(/\s+/g, ' ').trim();
  const line = `dotdotgod hook error: ${clean || 'unknown error'}`;
  return line.length > 240 ? `${line.slice(0, 237)}...` : line;
}
