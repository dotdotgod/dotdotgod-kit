import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chunkText, excerpt } from './chunks.mjs';

function ftsQuery(value) {
  const terms = String(value ?? '').match(/[\p{L}\p{N}_./:@-]+/gu) ?? [];
  if (terms.length === 0) throw new Error('Search query must contain at least one searchable term.');
  return terms.slice(0, 20).map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ');
}

function safeRoot(root) {
  return resolve(root || process.cwd());
}

export function contextDbPath(root) {
  return join(safeRoot(root), '.dotdotgod', 'context', 'context.sqlite');
}

export class ContextStore {
  constructor(root = process.cwd()) {
    this.root = safeRoot(root);
    this.path = contextDbPath(this.root);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        session_id TEXT,
        label TEXT NOT NULL,
        kind TEXT NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
        source_id UNINDEXED,
        scope UNINDEXED,
        session_id UNINDEXED,
        ordinal UNINDEXED,
        body,
        tokenize='porter unicode61'
      );
    `);
  }

  close() { this.db.close(); }

  index({ id = crypto.randomUUID(), scope = 'session', sessionId = null, label, kind = 'text', text, metadata = {}, ttlMs = null }) {
    const createdAt = Date.now();
    const expiresAt = ttlMs == null ? null : createdAt + Math.max(0, ttlMs);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO sources(id, scope, session_id, label, kind, metadata, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, scope, sessionId, label || id, kind, JSON.stringify(metadata), createdAt, expiresAt);
      this.db.prepare('DELETE FROM chunks WHERE source_id = ?').run(id);
      const insert = this.db.prepare('INSERT INTO chunks(source_id, scope, session_id, ordinal, body) VALUES (?, ?, ?, ?, ?)');
      const chunks = chunkText(text);
      chunks.forEach((chunk, ordinal) => insert.run(id, scope, sessionId, ordinal, chunk.text));
      this.db.exec('COMMIT');
      return { id, chunks: chunks.length, bytes: Buffer.byteLength(String(text ?? '')), scope, expiresAt };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  expire() {
    const ids = this.db.prepare('SELECT id FROM sources WHERE expires_at IS NOT NULL AND expires_at <= ?').all(Date.now()).map((row) => row.id);
    const removeChunks = this.db.prepare('DELETE FROM chunks WHERE source_id = ?');
    const removeSource = this.db.prepare('DELETE FROM sources WHERE id = ?');
    for (const id of ids) { removeChunks.run(id); removeSource.run(id); }
    return ids.length;
  }

  search({ query, scope, sessionId, source, limit = 5 }) {
    this.expire();
    const clauses = ['chunks MATCH ?'];
    const params = [ftsQuery(query)];
    if (scope) { clauses.push('c.scope = ?'); params.push(scope); }
    if (sessionId) { clauses.push('c.session_id = ?'); params.push(sessionId); }
    if (source) { clauses.push('(s.id = ? OR s.label LIKE ?)'); params.push(source, `%${source}%`); }
    params.push(Math.min(50, Math.max(1, limit)));
    const rows = this.db.prepare(`
      SELECT c.source_id, c.ordinal, c.body, s.label, s.kind, s.scope, s.metadata, bm25(chunks) AS rank
      FROM chunks c JOIN sources s ON s.id = c.source_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY rank LIMIT ?
    `).all(...params);
    return rows.map((row) => ({
      sourceId: row.source_id,
      label: row.label,
      kind: row.kind,
      scope: row.scope,
      ordinal: Number(row.ordinal),
      rank: row.rank,
      text: excerpt(row.body, query),
      metadata: JSON.parse(row.metadata),
    }));
  }

  stats() {
    this.expire();
    const sources = this.db.prepare('SELECT count(*) AS count FROM sources').get().count;
    const chunks = this.db.prepare('SELECT count(*) AS count FROM chunks').get().count;
    const byScope = this.db.prepare('SELECT scope, count(*) AS count FROM sources GROUP BY scope ORDER BY scope').all();
    return { path: this.path, sources, chunks, byScope };
  }

  purge({ scope, sessionId, sourceId }) {
    const selectors = [scope != null, sessionId != null, sourceId != null].filter(Boolean).length;
    if (selectors !== 1) throw new Error('Choose exactly one purge selector: scope, sessionId, or sourceId.');
    let ids;
    if (scope) ids = this.db.prepare('SELECT id FROM sources WHERE scope = ?').all(scope).map((row) => row.id);
    else if (sessionId) ids = this.db.prepare('SELECT id FROM sources WHERE session_id = ?').all(sessionId).map((row) => row.id);
    else ids = [sourceId];
    const removeChunks = this.db.prepare('DELETE FROM chunks WHERE source_id = ?');
    const removeSource = this.db.prepare('DELETE FROM sources WHERE id = ?');
    let removed = 0;
    for (const id of ids) {
      removeChunks.run(id);
      removed += Number(removeSource.run(id).changes ?? 0);
    }
    return { removed };
  }

  destroy() {
    this.close();
    rmSync(dirname(this.path), { recursive: true, force: true });
  }
}
