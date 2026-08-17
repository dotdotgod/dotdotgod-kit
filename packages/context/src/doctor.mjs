import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MINIMUM_NODE = [22, 5, 0];
const EXPECTED_TABLES = new Set(['sources', 'chunks']);

function check(id, status, message, details) {
  return { id, status, message, ...(details === undefined ? {} : { details }) };
}

function versionParts(value) {
  return String(value).replace(/^v/, '').split('.').slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

function versionAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if ((actual[index] ?? 0) > minimum[index]) return true;
    if ((actual[index] ?? 0) < minimum[index]) return false;
  }
  return true;
}

function existingAncestor(path) {
  let candidate = resolve(path);
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return candidate;
}

function nodeCheck() {
  const actual = versionParts(process.version);
  const supported = versionAtLeast(actual, MINIMUM_NODE);
  return check(
    'node-version',
    supported ? 'OK' : 'FAIL',
    supported ? `Node ${process.version} meets the minimum runtime.` : `Node ${process.version} is below v${MINIMUM_NODE.join('.')}.`,
    { actual: process.version, minimum: `v${MINIMUM_NODE.join('.')}` },
  );
}

function rootCheck(root) {
  try {
    const stat = statSync(root);
    if (!stat.isDirectory()) return check('project-root', 'FAIL', 'Project root is not a directory.', { root });
    return check('project-root', 'OK', 'Project root exists.', { root });
  } catch (error) {
    return check('project-root', 'FAIL', 'Project root is not accessible.', { root, error: error.message });
  }
}

function storageCheck(dbPath) {
  const ancestor = existingAncestor(dirname(dbPath));
  if (!ancestor) return check('storage-readiness', 'FAIL', 'No existing storage ancestor was found.', { dbPath });
  try {
    const stat = statSync(ancestor);
    if (!stat.isDirectory()) return check('storage-readiness', 'FAIL', 'Storage ancestor is not a directory.', { ancestor, dbPath });
    accessSync(ancestor, constants.R_OK | constants.W_OK | constants.X_OK);
    return check('storage-readiness', 'OK', 'Storage ancestor is readable and writable without creating files.', { ancestor, dbPath });
  } catch (error) {
    return check('storage-readiness', 'FAIL', 'Storage ancestor is not ready for the context database.', { ancestor, dbPath, error: error.message });
  }
}

function sqliteCheck() {
  let db;
  try {
    db = new DatabaseSync(':memory:');
    const version = db.prepare('SELECT sqlite_version() AS version').get().version;
    db.exec("CREATE VIRTUAL TABLE probe USING fts5(body, tokenize='porter unicode61');");
    db.prepare('INSERT INTO probe(body) VALUES (?)').run('running runner');
    const matched = db.prepare("SELECT count(*) AS count FROM probe WHERE probe MATCH 'run'").get().count;
    if (Number(matched) !== 1) throw new Error('Porter tokenizer probe did not match a stemmed term.');
    return check('sqlite-fts5-porter', 'OK', 'SQLite FTS5 with the Porter tokenizer is available.', { sqliteVersion: version });
  } catch (error) {
    return check('sqlite-fts5-porter', 'FAIL', 'SQLite FTS5 with the Porter tokenizer is unavailable.', { error: error.message });
  } finally {
    db?.close();
  }
}

function schemaCheck(dbPath) {
  if (!existsSync(dbPath)) {
    return check('schema-compatibility', 'WARN', 'Context database does not exist yet; schema will be checked after initialization.', { dbPath });
  }
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const names = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all().map((row) => row.name));
    const missing = [...EXPECTED_TABLES].filter((name) => !names.has(name));
    if (missing.length > 0) return check('schema-compatibility', 'FAIL', 'Context database is missing required tables.', { dbPath, missing });
    const sourceColumns = new Set(db.prepare('PRAGMA table_info(sources)').all().map((row) => row.name));
    const requiredColumns = ['id', 'scope', 'session_id', 'label', 'kind', 'metadata', 'created_at', 'expires_at'];
    const missingColumns = requiredColumns.filter((name) => !sourceColumns.has(name));
    if (missingColumns.length > 0) return check('schema-compatibility', 'FAIL', 'Sources table is incompatible.', { dbPath, missingColumns });
    return check('schema-compatibility', 'OK', 'Existing context database has the required schema.', { dbPath });
  } catch (error) {
    return check('schema-compatibility', 'FAIL', 'Context database could not be inspected read-only.', { dbPath, error: error.message });
  } finally {
    db?.close();
  }
}

function statusFor(checks) {
  if (checks.some((entry) => entry.status === 'FAIL')) return 'FAIL';
  if (checks.some((entry) => entry.status === 'WARN')) return 'WARN';
  return 'OK';
}

export function runDoctor(options = {}) {
  const root = resolve(options.root || process.cwd());
  const dbPath = resolve(options.dbPath || join(root, '.dotdotgod', 'context', 'context.sqlite'));
  const checks = [nodeCheck(), rootCheck(root), storageCheck(dbPath), sqliteCheck(), schemaCheck(dbPath)];
  if (options.stats) checks.push(check('store-statistics', 'OK', 'Caller supplied current store statistics.', options.stats));
  checks.push(check('fetch-policy', 'OK', 'Strict local fetch policy is configured without ambient proxy or repair behavior.', {
    networkDuringDoctor: false,
    mode: options.fetchPolicy?.mode ?? 'strict',
    encodings: options.fetchPolicy?.encodings ?? ['identity', 'gzip', 'deflate', 'br'],
  }));
  return {
    ok: !checks.some((entry) => entry.status === 'FAIL'),
    status: statusFor(checks),
    node: process.version,
    platform: process.platform,
    root,
    dbPath,
    checks,
  };
}
