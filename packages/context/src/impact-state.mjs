import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { validateSessionId } from './session.mjs';
import { RETENTION_MS } from './retention.mjs';
import {
  impactFingerprint,
  impactPath,
  impactReminder,
  resolveDocumentationRoot,
  sanitizeDisplayPath,
} from './impact-path.mjs';

export { impactFingerprint, impactPath, impactReminder, resolveDocumentationRoot, sanitizeDisplayPath };

const CREATE_PENDING = 'CREATE TABLE IF NOT EXISTS pending (session TEXT NOT NULL, path TEXT NOT NULL, revision TEXT NOT NULL, fingerprint TEXT, created_at INTEGER, expires_at INTEGER, notified INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (session, path))';
const CREATE_PLAN_NOTICES = 'CREATE TABLE IF NOT EXISTS plan_notices (session TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, notified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)';

const CREATE_LOAD_STATE = `CREATE TABLE IF NOT EXISTS load_state (
  session TEXT PRIMARY KEY,
  assessed INTEGER NOT NULL DEFAULT 0 CHECK (assessed IN (0,1)),
  loaded INTEGER NOT NULL DEFAULT 0 CHECK (loaded IN (0,1)),
  notified INTEGER NOT NULL DEFAULT 0 CHECK (notified IN (0,1)),
  skip_count INTEGER NOT NULL DEFAULT 0 CHECK (skip_count >= 0),
  last_prompt_hash TEXT,
  inflight_token TEXT,
  inflight_until INTEGER NOT NULL DEFAULT 0 CHECK (inflight_until >= 0),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
)`;
const UNLOADED = Object.freeze({ assessed: false, loaded: false, notified: false, skipCount: 0, lastPromptHash: null });
const FINISH_LOAD = 'last_prompt_hash = ?, inflight_token = NULL, inflight_until = 0';
const OWN_LOAD = 'session = ? AND inflight_token = ? AND loaded = 0';
const BUSY_MS = 5000;
const lockWait = new Int32Array(new SharedArrayBuffer(4));

function enableWal(db) {
  const deadline = performance.now() + BUSY_MS;
  for (;;) {
    try { db.exec('PRAGMA journal_mode=WAL'); return; }
    catch (error) {
      // SQLite may bypass busy_timeout when two writers both try to upgrade DELETE to WAL.
      if (error.errcode !== 5 || performance.now() >= deadline) throw error;
      Atomics.wait(lockWait, 0, 0, 5);
    }
  }
}

function pendingColumns(db) {
  return db.prepare('PRAGMA table_info(pending)').all().map(({ name }) => name);
}

function migrateAndPurge(db, now, legacySeenAt = now) {
  db.exec(`${CREATE_PENDING}; ${CREATE_PLAN_NOTICES}; ${CREATE_LOAD_STATE}`);
  const cols = pendingColumns(db);
  if (!cols.includes('created_at')) db.exec('ALTER TABLE pending ADD COLUMN created_at INTEGER');
  if (!cols.includes('expires_at')) {
    db.exec('ALTER TABLE pending ADD COLUMN expires_at INTEGER');
    db.prepare('UPDATE pending SET created_at = COALESCE(created_at, ?), expires_at = ? WHERE expires_at IS NULL').run(legacySeenAt, legacySeenAt + RETENTION_MS);
  }
  if (!cols.includes('notified')) db.exec('ALTER TABLE pending ADD COLUMN notified INTEGER NOT NULL DEFAULT 0');
  for (const table of ['pending', 'plan_notices', 'load_state']) db.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).run(now);
}

// A separate small database keeps advisory state available without opening the content store.
// Each operation is synchronous and closes its handle; SQLite serializes plugin/server writers.
export class ImpactState {
  #legacySeenAt;

  constructor(root, sessionId) {
    this.root = resolve(root);
    this.sessionId = validateSessionId(sessionId);
    this.path = join(this.root, '.dotdotgod/context/impact.sqlite');
  }

  database() {
    if (!existsSync(this.path)) return undefined;
    // A checkpointed WAL database needs immutable mode to open without creating sidecars.
    const active = existsSync(`${this.path}-wal`) || existsSync(`${this.path}-journal`);
    const path = active ? this.path : `${pathToFileURL(this.path).href}?immutable=1`;
    return new DatabaseSync(path, { readOnly: true, timeout: BUSY_MS });
  }

  tx(fn) {
    mkdirSync(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path);
    try {
      db.exec(`PRAGMA busy_timeout=${BUSY_MS}`);
      enableWal(db);
      db.exec('BEGIN IMMEDIATE');
      try {
        const now = Date.now();
        migrateAndPurge(db, now, this.#legacySeenAt);
        const result = fn(db, now);
        db.exec('COMMIT');
        this.#legacySeenAt = undefined;
        return result;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    } finally { db.close(); }
  }

  mark(paths) {
    const docRoot = resolveDocumentationRoot(this.root);
    const names = [...new Set(paths.map((path) => impactPath(this.root, path, docRoot)).filter(Boolean))];
    if (!names.length) return { becameNonEmpty: false };
    const entries = names.map((path) => ({ path, fingerprint: impactFingerprint(this.root, path) ?? null }));
    return this.tx((db) => {
      const now = Date.now();
      const hadActive = Boolean(db.prepare('SELECT 1 FROM pending WHERE session=? AND expires_at > ? LIMIT 1').get(this.sessionId, now));
      const insert = db.prepare('INSERT OR REPLACE INTO pending (session,path,revision,fingerprint,created_at,expires_at,notified) VALUES (?, ?, ?, ?, ?, ?, 0)');
      for (const entry of entries) insert.run(this.sessionId, entry.path, randomUUID(), entry.fingerprint, now, now + RETENTION_MS);
      return { becameNonEmpty: !hadActive };
    });
  }

  snapshot(paths) {
    const docRoot = paths ? resolveDocumentationRoot(this.root) : undefined;
    const selected = paths ? new Set(paths.map((path) => impactPath(this.root, path, docRoot)).filter(Boolean)) : undefined;
    const db = this.database();
    if (!db) return [];
    try {
      const cols = pendingColumns(db);
      if (!cols.length) return [];
      const expiry = cols.includes('expires_at');
      if (!expiry) {
        // Legacy retention starts at first observation in this instance, without migrating on read.
        this.#legacySeenAt ??= Date.now();
        if (this.#legacySeenAt + RETENTION_MS <= Date.now()) return [];
      }
      return db.prepare(`SELECT path,revision,fingerprint FROM pending WHERE session=?${expiry ? ' AND expires_at > ?' : ''} ORDER BY path`)
        .all(this.sessionId, ...(expiry ? [Date.now()] : [])).filter((item) => !selected || selected.has(item.path));
    } finally { db.close(); }
  }

  complete(snapshot) {
    if (!snapshot.length || !existsSync(this.path)) return;
    this.tx((db) => {
      const remove = db.prepare('DELETE FROM pending WHERE session=? AND path=? AND revision=?');
      for (const item of snapshot) {
        if (item.fingerprint && impactFingerprint(this.root, item.path) === item.fingerprint) remove.run(this.sessionId, item.path, item.revision);
      }
    });
  }

  clearPaths(paths) {
    const docRoot = resolveDocumentationRoot(this.root);
    const names = [...new Set(paths.map((path) => impactPath(this.root, path, docRoot)).filter(Boolean))];
    if (!names.length || !existsSync(this.path)) return 0;
    return this.tx((db) => {
      const remove = db.prepare('DELETE FROM pending WHERE session=? AND path=?');
      return names.reduce((sum, path) => sum + Number(remove.run(this.sessionId, path).changes ?? 0), 0);
    });
  }

  claimUnnotified(limit = 50) {
    if (!existsSync(this.path)) return { ok: true, count: 0, pending: [], truncated: false };
    const rows = this.tx((db) => db.prepare('UPDATE pending SET notified = 1 WHERE session = ? AND notified = 0 AND expires_at > ? RETURNING path').all(this.sessionId, Date.now()));
    rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return { ok: true, count: rows.length, pending: rows.slice(0, limit).map(({ path }) => ({ path })), truncated: rows.length > limit };
  }

  recordPlanNotice(fingerprint) {
    this.tx((db) => {
      const now = Date.now();
      db.prepare('INSERT INTO plan_notices (session,fingerprint,notified,created_at,expires_at) VALUES (?, ?, 0, ?, ?) ON CONFLICT(session) DO UPDATE SET fingerprint = excluded.fingerprint, notified = 0, created_at = excluded.created_at, expires_at = excluded.expires_at WHERE plan_notices.fingerprint IS NOT excluded.fingerprint').run(this.sessionId, fingerprint, now, now + RETENTION_MS);
    });
  }

  claimPlanNotice() {
    if (!existsSync(this.path)) return false;
    return this.tx((db) => Number(db.prepare('UPDATE plan_notices SET notified = 1 WHERE session = ? AND notified = 0 AND expires_at > ?').run(this.sessionId, Date.now()).changes ?? 0) === 1);
  }

  clearPlanNotice() {
    if (!existsSync(this.path)) return false;
    return this.tx((db) => Number(db.prepare('DELETE FROM plan_notices WHERE session = ?').run(this.sessionId).changes ?? 0) > 0);
  }

  getLoadState() {
    const db = this.database();
    if (!db) return UNLOADED;
    try {
      if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='load_state'").get()) return UNLOADED;
      const row = db.prepare('SELECT assessed,loaded,notified,skip_count,last_prompt_hash FROM load_state WHERE session=? AND expires_at > ?').get(this.sessionId, Date.now());
      return row ? { assessed: Boolean(row.assessed), loaded: Boolean(row.loaded), notified: Boolean(row.notified), skipCount: row.skip_count, lastPromptHash: row.last_prompt_hash } : UNLOADED;
    } finally { db.close(); }
  }

  beginLoadAssessment(promptHash, leaseMs) {
    const token = randomUUID();
    return this.tx((db, now) => {
      const row = db.prepare(`INSERT INTO load_state (session,inflight_token,inflight_until,created_at,expires_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session) DO UPDATE SET inflight_token = excluded.inflight_token, inflight_until = excluded.inflight_until
        WHERE loaded = 0 AND notified = 0 AND skip_count < 5 AND (last_prompt_hash IS NULL OR last_prompt_hash != ?) AND inflight_until <= ?
        RETURNING session, skip_count`).get(this.sessionId, token, now + leaseMs, now, now + RETENTION_MS, promptHash, now);
      return row && { session: row.session, token, skipCount: row.skip_count };
    });
  }

  recordLoadSkip(token, promptHash) {
    return this.tx((db) => {
      const row = db.prepare(`UPDATE load_state SET skip_count = skip_count + 1, ${FINISH_LOAD},
        assessed = CASE WHEN skip_count + 1 >= 5 THEN 1 ELSE assessed END,
        notified = CASE WHEN skip_count + 1 >= 5 THEN 1 ELSE notified END
        WHERE ${OWN_LOAD} RETURNING skip_count`).get(promptHash, this.sessionId, token);
      return row ? { recorded: true, terminal: row.skip_count >= 5, skipCount: row.skip_count } : { recorded: false };
    });
  }

  completeLoadNotified(token, promptHash) {
    return this.tx((db) => db.prepare(`UPDATE load_state SET assessed = 1, notified = 1, ${FINISH_LOAD} WHERE ${OWN_LOAD}`)
      .run(promptHash, this.sessionId, token).changes === 1);
  }

  completeLoadPrefetch(token, promptHash) {
    return this.tx((db) => db.prepare(`UPDATE load_state SET assessed = 1, loaded = 1, notified = 1, ${FINISH_LOAD} WHERE ${OWN_LOAD}`)
      .run(promptHash, this.sessionId, token).changes === 1);
  }

  claimAdvisedOnce() {
    return this.tx((db, now) => db.prepare(`INSERT INTO load_state (session,assessed,notified,created_at,expires_at) VALUES (?, 1, 1, ?, ?)
      ON CONFLICT(session) DO UPDATE SET assessed = 1, notified = 1, inflight_token = NULL, inflight_until = 0
      WHERE loaded = 0 AND notified = 0`).run(this.sessionId, now, now + RETENTION_MS).changes === 1);
  }

  markLoaded() {
    this.tx((db, now) => db.prepare(`INSERT INTO load_state (session,assessed,loaded,notified,created_at,expires_at) VALUES (?, 1, 1, 1, ?, ?)
      ON CONFLICT(session) DO UPDATE SET assessed = 1, loaded = 1, notified = 1, inflight_token = NULL, inflight_until = 0`)
      .run(this.sessionId, now, now + RETENTION_MS));
  }

  status(limit = 50) {
    const all = this.snapshot();
    return { ok: true, count: all.length, pending: all.slice(0, limit).map(({ path }) => ({ path })), truncated: all.length > limit };
  }
}

export async function withImpactReview(root, sessionId, paths, review, signal) {
  signal?.throwIfAborted();
  const state = new ImpactState(root, sessionId);
  const snapshot = state.snapshot(paths).map((item) => ({ ...item, fingerprint: impactFingerprint(root, item.path) }));
  const result = await review();
  signal?.throwIfAborted();
  if (result.ok === true) state.complete(snapshot);
  return { ...result, checked: result.ok === true ? paths : [], impactStatus: state.status() };
}
