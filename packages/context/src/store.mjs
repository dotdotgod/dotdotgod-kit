import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { extname } from 'node:path';
import { chunkContent, chunkText, excerpt } from './chunks.mjs';
import { createProvenanceMetadata, readProvenanceMetadata } from './provenance.mjs';
import { normalizeSearchTerms, reciprocalRankFusion, rerankCandidates } from './rank.mjs';

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

  index({ id = crypto.randomUUID(), scope = 'session', sessionId = null, label, kind = 'text', text, metadata = {}, ttlMs = null, provenance = {} }) {
    const createdAt = Date.now();
    const expiresAt = ttlMs == null ? null : createdAt + Math.max(0, ttlMs);
    const sourceType = provenance.sourceType ?? (kind === 'file' ? 'project-file' : kind === 'command' ? 'command-output' : kind === 'url' ? 'fetched-url' : 'unknown');
    const origin = provenance.origin ?? metadata.path ?? metadata.url ?? label ?? id;
    const contentType = String(provenance.contentType ?? metadata.contentType ?? '').toLowerCase();
    const extension = extname(String(metadata.path ?? '')).toLowerCase();
    const format = provenance.format ?? (contentType.includes('json') || extension === '.json' ? 'json' : contentType.includes('markdown') || ['.md', '.mdx'].includes(extension) ? 'markdown' : 'text');
    const extractor = format === 'json' ? 'json-v1' : format === 'markdown' ? 'markdown-v1' : 'plain';
    const normalizedMetadata = createProvenanceMetadata(metadata, { sourceType, origin, content: text, extractor, indexedAt: new Date(createdAt).toISOString() });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT OR REPLACE INTO sources(id, scope, session_id, label, kind, metadata, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, scope, sessionId, label || id, kind, JSON.stringify(normalizedMetadata), createdAt, expiresAt);
      this.db.prepare('DELETE FROM chunks WHERE source_id = ?').run(id);
      const insert = this.db.prepare('INSERT INTO chunks(source_id, scope, session_id, ordinal, body) VALUES (?, ?, ?, ?, ?)');
      const chunks = format === 'text' ? chunkText(text) : chunkContent(text, { format });
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
    const resultLimit = Math.min(50, Math.max(1, limit));
    const candidateLimit = Math.min(200, Math.max(20, resultLimit * 4));
    const filters = [];
    const filterParams = [];
    if (scope) { filters.push('c.scope = ?'); filterParams.push(scope); }
    if (sessionId) { filters.push('c.session_id = ?'); filterParams.push(sessionId); }
    if (source) { filters.push('(s.id = ? OR s.label LIKE ?)'); filterParams.push(source, `%${source}%`); }
    const filterSql = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    const select = 'SELECT c.source_id, c.ordinal, c.body, s.label, s.kind, s.scope, s.metadata';
    const porterRows = this.db.prepare(`
      ${select}, bm25(chunks) AS rank
      FROM chunks c JOIN sources s ON s.id = c.source_id
      WHERE chunks MATCH ?${filterSql}
      ORDER BY rank LIMIT ?
    `).all(ftsQuery(query), ...filterParams, candidateLimit);
    const terms = normalizeSearchTerms(query);
    const labelClauses = terms.map(() => '(lower(s.label) LIKE ? OR lower(s.metadata) LIKE ?)');
    const labelParams = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
    const labelRows = labelClauses.length === 0 ? [] : this.db.prepare(`
      ${select}, 0 AS rank
      FROM chunks c JOIN sources s ON s.id = c.source_id
      WHERE s.kind != 'command'
        AND c.ordinal = (SELECT min(c2.ordinal) FROM chunks c2 WHERE c2.source_id = c.source_id)
        AND (${labelClauses.join(' OR ')})${filterSql}
      ORDER BY lower(s.label), c.ordinal LIMIT ?
    `).all(...labelParams, ...filterParams, candidateLimit);
    const toCandidate = (row) => {
      let storedMetadata = {};
      try { storedMetadata = JSON.parse(row.metadata); } catch { /* legacy invalid metadata */ }
      return { sourceId: row.source_id, ordinal: Number(row.ordinal), body: row.body, label: row.label, kind: row.kind, scope: row.scope, rank: row.rank, metadata: readProvenanceMetadata(storedMetadata) };
    };
    const fused = reciprocalRankFusion([
      { name: 'porter-bm25', candidates: porterRows.map(toCandidate) },
      { name: 'label-path', candidates: labelRows.map(toCandidate) },
    ], { limit: candidateLimit });
    return rerankCandidates(fused, query, { limit: resultLimit }).map((entry) => {
      const row = entry.candidate;
      return {
        sourceId: row.sourceId,
        label: row.label,
        kind: row.kind,
        scope: row.scope,
        ordinal: row.ordinal,
        rank: row.rank,
        text: excerpt(row.body, query),
        metadata: row.metadata,
        trust: row.metadata.trust,
        sourceType: row.metadata.sourceType,
        instructionAuthority: 'none',
        ...(row.metadata.contentHash ? { contentHash: row.metadata.contentHash } : {}),
        ranking: entry.ranking,
      };
    });
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
