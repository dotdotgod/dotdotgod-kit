import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
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

function inspectSchema(db) {
  const hasPending = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pending'").get());
  const hasPlanNotices = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='plan_notices'").get());
  const cols = hasPending ? db.prepare('PRAGMA table_info(pending)').all().map((c) => c.name) : [];
  return {
    hasPending,
    hasPlanNotices,
    needsCreatedAt: hasPending && !cols.includes('created_at'),
    needsExpiry: hasPending && !cols.includes('expires_at'),
    needsNotified: hasPending && !cols.includes('notified'),
  };
}

// A separate small database keeps advisory state available without opening the content store.
// Each operation is synchronous and closes its handle; SQLite serializes plugin/server writers.
export class ImpactState {
  constructor(root, sessionId) {
    this.root = resolve(root);
    this.sessionId = validateSessionId(sessionId);
    this.path = join(this.root, '.dotdotgod/context/impact.sqlite');
  }

  database(write = false) {
    if (!write && !existsSync(this.path)) return undefined;
    if (write) mkdirSync(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path);
    try {
      db.exec('PRAGMA busy_timeout=5000');
      db.exec('PRAGMA journal_mode=WAL');
      const state = inspectSchema(db);
      const needsSchema = !state.hasPending || !state.hasPlanNotices || state.needsExpiry || state.needsNotified;
      if (!write && !needsSchema) return db;
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(CREATE_PENDING);
        db.exec(CREATE_PLAN_NOTICES);
        const current = inspectSchema(db);
        if (current.needsCreatedAt) db.exec('ALTER TABLE pending ADD COLUMN created_at INTEGER;');
        if (current.needsExpiry) {
          db.exec('ALTER TABLE pending ADD COLUMN expires_at INTEGER;');
          const now = Date.now();
          db.prepare('UPDATE pending SET created_at = COALESCE(created_at, ?), expires_at = ? WHERE expires_at IS NULL').run(now, now + RETENTION_MS);
        }
        if (current.needsNotified) db.exec('ALTER TABLE pending ADD COLUMN notified INTEGER NOT NULL DEFAULT 0;');
        if (write) {
          const now = Date.now();
          db.prepare('DELETE FROM pending WHERE expires_at <= ?').run(now);
          db.prepare('DELETE FROM plan_notices WHERE expires_at <= ?').run(now);
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      return db;
    } catch (error) { db.close(); throw error; }
  }

  tx(fn) {
    const db = this.database(true);
    try {
      db.exec('BEGIN IMMEDIATE');
      try { const result = fn(db); db.exec('COMMIT'); return result; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
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
    const db = this.database(false);
    if (!db) return [];
    try {
      return db.prepare('SELECT path,revision,fingerprint FROM pending WHERE session=? AND expires_at > ? ORDER BY path').all(this.sessionId, Date.now())
        .filter((item) => !selected || selected.has(item.path));
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
