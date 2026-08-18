import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
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

const SCHEMA_VERSION = 2;

function inspectSchema(db) {
  const objects = new Map(db.prepare("SELECT name, type, sql FROM sqlite_master WHERE name IN ('sources', 'chunks')").all().map((row) => [row.name, row]));
  const sourceRows = db.prepare('PRAGMA table_info(sources)').all();
  const chunkRows = db.prepare('PRAGMA table_info(chunks)').all();
  const requiredSources = ['id', 'scope', 'session_id', 'label', 'kind', 'metadata', 'created_at', 'expires_at'];
  const requiredChunks = ['source_id', 'scope', 'session_id', 'ordinal', 'body'];
  const missingSources = requiredSources.filter((name) => !sourceRows.some((row) => row.name === name));
  const missingChunks = requiredChunks.filter((name) => !chunkRows.some((row) => row.name === name));
  const sourceShape = sourceRows.length === requiredSources.length && sourceRows.every((row, index) => row.name === requiredSources[index])
    && sourceRows[0].pk === 1
    && sourceRows.every((row) => ['scope', 'label', 'kind', 'metadata', 'created_at'].includes(row.name) ? row.notnull === 1 : true);
  const chunkShape = chunkRows.length === requiredChunks.length && chunkRows.every((row, index) => row.name === requiredChunks[index]);
  const chunkSql = String(objects.get('chunks')?.sql ?? '').toLowerCase();
  const compatible = objects.get('sources')?.type === 'table'
    && objects.get('chunks')?.type === 'table'
    && chunkSql.includes('using fts5')
    && chunkSql.includes("tokenize='porter unicode61'")
    && sourceShape
    && chunkShape
    && missingSources.length === 0
    && missingChunks.length === 0;
  let version = 0;
  if (compatible) {
    const ledger = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (ledger) version = Number(db.prepare('SELECT coalesce(max(version), 0) AS version FROM schema_migrations').get().version);
    else version = 1;
  }
  return { compatible: compatible && version <= SCHEMA_VERSION, schemaProfile: compatible ? version : null, missing: [...missingSources, ...missingChunks] };
}

function migrate(db, fromVersion) {
  if (fromVersion > SCHEMA_VERSION) throw new Error(`Incompatible context database schema version ${fromVersion}; runtime supports ${SCHEMA_VERSION}.`);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);');
    if (fromVersion < 2) {
      db.exec(`CREATE TABLE IF NOT EXISTS ingestion_jobs (
        id TEXT PRIMARY KEY, state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed','cancelled')),
        kind TEXT NOT NULL, input TEXT NOT NULL, result TEXT, error TEXT,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      ); CREATE INDEX IF NOT EXISTS ingestion_jobs_state_created ON ingestion_jobs(state, created_at);`);
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, ?)').run(Date.now());
      db.prepare('INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (2, ?)').run(Date.now());
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function trigrams(value) {
  const normalized = `  ${String(value).toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}  `;
  const out = new Set();
  for (let index = 0; index + 3 <= normalized.length; index += 1) out.add(normalized.slice(index, index + 3));
  return out;
}
function trigramScore(left, right) {
  const a = trigrams(left); const b = trigrams(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const item of a) if (b.has(item)) overlap += 1;
  return (2 * overlap) / (a.size + b.size);
}
function editDistance(left, right, ceiling = 2) {
  if (Math.abs(left.length - right.length) > ceiling) return ceiling + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i]; let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) { current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)); rowMin = Math.min(rowMin, current[j]); }
    if (rowMin > ceiling) return ceiling + 1; previous = current;
  }
  return previous[right.length];
}
function typoScore(query, value) {
  const queryTerms = normalizeSearchTerms(query);
  const valueTerms = normalizeSearchTerms(value);
  let best = 0;
  for (const needle of queryTerms) for (const token of valueTerms) {
    if (needle.length >= 5 && editDistance(needle, token) <= 2) best = Math.max(best, trigramScore(needle, token));
  }
  return best;
}

export function healContextDatabase(root = process.cwd()) {
  const path = contextDbPath(root);
  if (!existsSync(path)) throw new Error('No context database exists to heal.');
  const backupPath = `${path}.backup-${Date.now()}`;
  copyFileSync(path, backupPath, 0);
  let inspection;
  const rebuiltPath = `${path}.healed-${Date.now()}`;
  const db = new DatabaseSync(path);
  try {
    inspection = inspectSchema(db);
    if (!inspection.compatible || ![1, 2].includes(inspection.schemaProfile)) {
      throw new Error('Schema is not a recognized recoverable context database; backup retained and no rebuild performed.');
    }
    migrate(db, inspection.schemaProfile);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec(`VACUUM INTO '${rebuiltPath.replaceAll("'", "''")}';`);
  } finally { db.close(); }
  renameSync(rebuiltPath, path);
  return { ok: true, backupPath, fromVersion: inspection.schemaProfile, toVersion: SCHEMA_VERSION, rebuilt: true };
}

export class ContextStore {
  constructor(root = process.cwd()) {
    this.root = safeRoot(root);
    this.path = contextDbPath(this.root);
    const existing = existsSync(this.path);
    let schemaVersion = 1;
    if (existing) {
      if (statSync(this.path).size === 0) throw new Error('Incompatible context database schema; empty database cannot be repaired automatically.');
      const inspection = new DatabaseSync(this.path, { readOnly: true });
      try {
        const result = inspectSchema(inspection);
        if (!result.compatible) throw new Error(`Incompatible context database schema; run doctor before explicit healing${result.missing.length ? ` (missing: ${result.missing.join(', ')})` : ''}.`);
        schemaVersion = result.schemaProfile;
      } finally {
        inspection.close();
      }
    }
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path);
    try {
      this.db.exec('PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL;');
      if (!existing) this.db.exec(`
        CREATE TABLE sources (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          session_id TEXT,
          label TEXT NOT NULL,
          kind TEXT NOT NULL,
          metadata TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER
        );
        CREATE VIRTUAL TABLE chunks USING fts5(
          source_id UNINDEXED,
          scope UNINDEXED,
          session_id UNINDEXED,
          ordinal UNINDEXED,
          body,
          tokenize='porter unicode61'
        );
      `);
      migrate(this.db, schemaVersion);
      this.db.prepare("UPDATE ingestion_jobs SET state = 'queued', updated_at = ? WHERE state = 'running'").run(Date.now());
    } catch (error) {
      this.db.close();
      throw error;
    }
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
    const extractor = provenance.extractor ?? (format === 'json' ? 'json-v1' : format === 'markdown' ? 'markdown-v1' : 'plain');
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
    if (ids.length === 0) return 0;
    const removeChunks = this.db.prepare('DELETE FROM chunks WHERE source_id = ?');
    const removeSource = this.db.prepare('DELETE FROM sources WHERE id = ?');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of ids) { removeChunks.run(id); removeSource.run(id); }
      this.db.exec('COMMIT');
      return ids.length;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
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
    const trigramRows = this.db.prepare(`
      ${select}, 0 AS rank
      FROM chunks c JOIN sources s ON s.id = c.source_id
      WHERE 1 = 1${filterSql}
      ORDER BY c.rowid DESC LIMIT ?
    `).all(...filterParams, Math.min(500, candidateLimit * 5))
      .map((row) => ({ ...row, trigramScore: Math.max(typoScore(query, row.body), Number(row.ordinal) === 0 ? typoScore(query, row.label) : 0) }))
      .filter((row) => row.trigramScore >= 0.5)
      .sort((left, right) => right.trigramScore - left.trigramScore || String(left.source_id).localeCompare(String(right.source_id), 'en') || Number(left.ordinal) - Number(right.ordinal))
      .slice(0, candidateLimit);
    const toCandidate = (row) => {
      let storedMetadata = {};
      try { storedMetadata = JSON.parse(row.metadata); } catch { /* legacy invalid metadata */ }
      return { sourceId: row.source_id, ordinal: Number(row.ordinal), body: row.body, label: row.label, kind: row.kind, scope: row.scope, rank: row.rank, metadata: readProvenanceMetadata(storedMetadata) };
    };
    const fused = reciprocalRankFusion([
      { name: 'porter-bm25', candidates: porterRows.map(toCandidate) },
      { name: 'label-path', candidates: labelRows.map(toCandidate) },
      { name: 'trigram-v1', candidates: trigramRows.map(toCandidate) },
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

  createJob({ id = crypto.randomUUID(), kind, input }) {
    const now = Date.now();
    const serializedInput = JSON.stringify(input);
    if (Buffer.byteLength(serializedInput) > 64 * 1024) throw new Error('Background ingestion job input exceeds 64 KiB.');
    this.db.prepare('INSERT INTO ingestion_jobs(id, state, kind, input, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, 'queued', kind, serializedInput, now, now);
    return this.getJob(id);
  }

  getJob(id) {
    const row = this.db.prepare('SELECT * FROM ingestion_jobs WHERE id = ?').get(id);
    if (!row) return null;
    return { id: row.id, state: row.state, kind: row.kind, input: JSON.parse(row.input), result: row.result ? JSON.parse(row.result) : null, error: row.error, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  claimNextJob() {
    const row = this.db.prepare("SELECT id FROM ingestion_jobs WHERE state = 'queued' ORDER BY created_at, id LIMIT 1").get();
    if (!row) return null;
    const changed = this.db.prepare("UPDATE ingestion_jobs SET state = 'running', updated_at = ? WHERE id = ? AND state = 'queued'").run(Date.now(), row.id).changes;
    return changed ? this.getJob(row.id) : null;
  }

  finishJob(id, state, value = null) {
    if (!['completed', 'failed', 'cancelled'].includes(state)) throw new Error('Invalid terminal job state.');
    let result = state === 'completed' ? JSON.stringify(value) : null;
    if (result && Buffer.byteLength(result) > 256 * 1024) result = JSON.stringify({ truncated: true, message: 'Completed result exceeded the durable status limit.' });
    const error = state === 'failed' ? String(value ?? 'Job failed').slice(0, 4096) : null;
    this.db.prepare("UPDATE ingestion_jobs SET state = ?, result = ?, error = ?, updated_at = ? WHERE id = ? AND state IN ('queued','running')")
      .run(state, result, error, Date.now(), id);
    return this.getJob(id);
  }

  cancelJob(id) {
    const changed = this.db.prepare("UPDATE ingestion_jobs SET state = 'cancelled', updated_at = ? WHERE id = ? AND state IN ('queued','running')").run(Date.now(), id).changes;
    return { changed: Number(changed), job: this.getJob(id) };
  }

  listPendingJobs(limit = 20) {
    return this.db.prepare("SELECT id FROM ingestion_jobs WHERE state IN ('queued','running') ORDER BY created_at, id LIMIT ?").all(Math.min(100, Math.max(1, limit))).map((row) => this.getJob(row.id));
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
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of ids) {
        removeChunks.run(id);
        removed += Number(removeSource.run(id).changes ?? 0);
      }
      this.db.exec('COMMIT');
      return { removed };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  destroy() {
    this.close();
    rmSync(dirname(this.path), { recursive: true, force: true });
  }
}
