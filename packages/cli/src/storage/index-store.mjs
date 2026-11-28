import { lstatSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { posix, join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { textFingerprint } from '../query/chunks.mjs';
import { indexTerms } from './fts-search.mjs';
import { readLegacyVectorState } from '../query/cache-session.mjs';
import { outlineChunks, readLegacyOutlines } from '../symbols/store.mjs';
import { refreshDocs } from './change-detector.mjs';

const schema = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY, dir_path TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('doc','code','other')),
  mtime_ms REAL NOT NULL, size INTEGER NOT NULL, ino TEXT NOT NULL, sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('parsed','partial','unsupported','failed')), language TEXT, line_count INTEGER NOT NULL,
  source_length INTEGER NOT NULL, imports_json TEXT NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS files_dir ON files(dir_path);
CREATE INDEX IF NOT EXISTS files_kind ON files(kind,status,path);
CREATE TABLE IF NOT EXISTS dir_hashes (
  dir_path TEXT PRIMARY KEY, parent TEXT NOT NULL, merkle_hash TEXT NOT NULL, child_count INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS dirs_parent ON dir_hashes(parent);
CREATE TABLE IF NOT EXISTS symbols (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL, name_lower TEXT NOT NULL,
  qualified_name TEXT NOT NULL, qualified_name_lower TEXT NOT NULL, owner_id TEXT, kind TEXT NOT NULL,
  signature TEXT NOT NULL, documentation TEXT NOT NULL, start_line INTEGER NOT NULL, end_line INTEGER NOT NULL,
  decl_start_line INTEGER NOT NULL, decl_start_offset INTEGER NOT NULL, decl_end_offset INTEGER NOT NULL,
  body_start_line INTEGER, body_end_line INTEGER, body_start_offset INTEGER, body_end_offset INTEGER, source_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS symbols_path ON symbols(path);
CREATE INDEX IF NOT EXISTS symbols_name ON symbols(name_lower);
CREATE INDEX IF NOT EXISTS symbols_qname ON symbols(qualified_name_lower);
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY, corpus TEXT NOT NULL CHECK(corpus IN ('docs','code')), path TEXT NOT NULL, heading TEXT NOT NULL,
  part INTEGER, kind TEXT NOT NULL CHECK(kind IN ('document','symbol')), fingerprint TEXT NOT NULL, text TEXT NOT NULL, meta_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS chunks_path ON chunks(path);
CREATE INDEX IF NOT EXISTS chunks_fp ON chunks(fingerprint);
CREATE INDEX IF NOT EXISTS chunks_corpus ON chunks(corpus);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED, corpus UNINDEXED, path, names, body, tokenize='unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT, profile_fp TEXT NOT NULL, fingerprint TEXT NOT NULL, dimensions INTEGER NOT NULL,
  vec_f32 BLOB NOT NULL, updated_at INTEGER NOT NULL, UNIQUE(profile_fp, fingerprint)
);
CREATE TABLE IF NOT EXISTS corpus_fingerprints (
  profile_fp TEXT NOT NULL, corpus TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(profile_fp, corpus, fingerprint)
);
CREATE INDEX IF NOT EXISTS corpus_vector ON corpus_fingerprints(profile_fp, fingerprint);
CREATE INDEX IF NOT EXISTS corpus_chunk ON corpus_fingerprints(corpus, fingerprint);
CREATE TABLE IF NOT EXISTS pending_corpora (
  profile_fp TEXT NOT NULL, corpus TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(profile_fp,corpus,fingerprint)
);
CREATE INDEX IF NOT EXISTS pending_vector ON pending_corpora(profile_fp, fingerprint);
CREATE TABLE IF NOT EXISTS hnsw_nodes (
  profile_fp TEXT NOT NULL, node_id INTEGER NOT NULL, fingerprint TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
  PRIMARY KEY(profile_fp, node_id), UNIQUE(profile_fp, fingerprint)
);
CREATE INDEX IF NOT EXISTS hnsw_active ON hnsw_nodes(profile_fp, deleted);
CREATE TABLE IF NOT EXISTS dirty_queue (path TEXT PRIMARY KEY, reason TEXT NOT NULL, enqueued_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS dirty_queue_time ON dirty_queue(enqueued_at,path);
`;

export const indexPath = (root) => join(root, '.dotdotgod', 'index.sqlite');
const stat = (path) => lstatSync(path, { throwIfNoEntry: false });
// Keep unrelated CLI commands free of node:sqlite's startup warning on Node 22.
const database = (path, options = {}) => new (process.getBuiltinModule('node:sqlite').DatabaseSync)(path, options);
export function inspectIndexPath(root) {
  const path = indexPath(root);
  const directory = stat(dirname(path));
  if (directory && !directory.isDirectory()) throw new Error('Index directory must be a real directory.');
  const file = (name) => {
    const entry = stat(name);
    if (entry && !entry.isFile()) throw new Error(`Index path must be a regular file: ${name}`);
    return entry;
  };
  const main = file(path);
  return { path, exists: Boolean(main), size: main?.size ?? 0, wal: Boolean(file(`${path}-wal`)),
    shm: Boolean(file(`${path}-shm`)), journal: Boolean(file(`${path}-journal`)) };
}

export function openReadOnly(root) {
  const { path, exists, size, wal, shm, journal } = inspectIndexPath(root);
  if (!exists || size === 0 || journal || (wal && !shm)) return null;
  let db;
  try {
    db = database(wal ? path : `${pathToFileURL(path).href}?immutable=1`, { readOnly: true });
    db.exec('PRAGMA busy_timeout=0; BEGIN');
    const store = new IndexStore(db);
    if (store.meta('schema_version') !== '1') throw new Error('Unsupported incremental index schema.');
    return store;
  } catch (error) {
    db?.close();
    const code = error.errcode & 255; // SQLite primary result code, without extended bits.
    if (code === 5 || code === 6 || /no such table: meta/i.test(error.message)) return null;
    throw error;
  }
}

const pause = new Int32Array(new SharedArrayBuffer(4));
function enableWal(db) {
  const deadline = performance.now() + 5000;
  for (;;) {
    try { db.exec('PRAGMA journal_mode=WAL'); return; }
    catch (error) {
      if (error.errcode !== 5 || performance.now() >= deadline) throw error;
      Atomics.wait(pause, 0, 0, 5);
    }
  }
}

export function openWriter(root, legacyLock, { existingOnly = false, nonblocking = false } = {}) {
  const { path, exists } = inspectIndexPath(root);
  if (existingOnly && !exists) return null;
  if (!existingOnly) mkdirSync(dirname(path), { recursive: true });
  const db = database(existingOnly ? `${pathToFileURL(path).href}?mode=rw` : path);
  try {
    db.exec(`PRAGMA busy_timeout=${nonblocking ? 0 : 5000}`);
    if (existingOnly) {
      const store = new IndexStore(db);
      if (store.meta('schema_version') !== '1') throw new Error('Unsupported incremental index schema.');
      return store;
    }
    if (nonblocking) db.exec('PRAGMA journal_mode=WAL');
    else enableWal(db);
    const store = new IndexStore(db);
    store.transaction(() => {
      db.exec(schema);
      const version = store.meta('schema_version');
      if (version && version !== '1') throw new Error('Unsupported incremental index schema.');
      if (!version) {
        store.setMeta('schema_version', '1');
        store.setMeta('instance', randomUUID());
      }
      migrateLegacyCachesIfPresent(root, store, legacyLock);
    });
    return store;
  } catch (error) { db.close(); throw error; }
}

function migrateLegacyCachesIfPresent(root, store, legacyLock) {
  if (!store.meta('outline_migration')) {
    const legacy = readLegacyOutlines(root);
    if (legacy) {
      for (const file of legacy.files) store.replaceFile(file, file.symbols, outlineChunks({ files: [file] }));
      if (typeof legacy.policy === 'string') {
        store.setMeta('outline_policy', legacy.policy);
        store.setMeta('outline_count', String(legacy.files.length));
      }
    }
    store.setMeta('outline_migration', 'done');
  }
  if (!store.meta('vector_migration')) {
    const { state, reason } = readLegacyVectorState(root, legacyLock);
    if (reason === 'build-in-progress') return;
    if (state) {
      const { profile, dimensions, docs, code, pending } = state;
      store.putVectors(profile, dimensions, [...docs, ...code].map(({ chunk, vector }) => ({ fingerprint: chunk.fingerprint, vector })));
      store.putVectors(profile, dimensions, pending.map(({ chunk, vector }) => ({ fingerprint: chunk.fingerprint, corpus: chunkCorpus(chunk), vector })));
      for (const corpus of ['docs', 'code']) store.commitCorpus(profile, corpus, state[corpus].map(({ chunk }) => chunk.fingerprint));
      if (docs.length && !store.meta('docs_root')) refreshDocs(root, store, undefined, true);
    }
    store.setMeta('vector_migration', reason);
  }
}

export function workerLease(store) {
  try {
    const lease = JSON.parse(store.meta('worker_lease') ?? 'null');
    if (Number.isSafeInteger(lease?.pid) && lease.pid > 0 && typeof lease.token === 'string'
        && Number.isFinite(lease.expiresAt)) return lease;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  return null;
}

export function activeWorkerLease(lease, now = Date.now()) {
  if (!lease || lease.expiresAt <= now) return false;
  try { process.kill(lease.pid, 0); }
  catch (error) { return error.code !== 'ESRCH'; }
  return true;
}

export function incrementalIndexStatus(root) {
  const status = { present: false, schemaVersion: null, dirtyQueueCount: 0, docsChunks: 0, codeChunks: 0,
    vectorsCount: 0, hnswActiveNodes: 0, hnswTombstones: 0, workerLease: null };
  let store;
  try {
    status.present = inspectIndexPath(root).exists;
    if (!status.present || !(store = openReadOnly(root))) return status;
    const lease = workerLease(store);
    return { ...status, schemaVersion: Number(store.meta('schema_version')), ...store.sql(`SELECT
      (SELECT count(*) FROM dirty_queue) AS dirtyQueueCount,
      (SELECT count(*) FROM chunks WHERE corpus='docs') AS docsChunks,
      (SELECT count(*) FROM chunks WHERE corpus='code') AS codeChunks,
      (SELECT count(*) FROM vectors) AS vectorsCount,
      (SELECT count(*) FROM hnsw_nodes WHERE deleted=0) AS hnswActiveNodes,
      (SELECT count(*) FROM hnsw_nodes WHERE deleted=1) AS hnswTombstones`).get(),
      workerLease: lease && { pid: lease.pid, expiresAt: lease.expiresAt, active: activeWorkerLease(lease) } };
  } catch { return status; }
  finally { store?.close(); }
}

export function enqueueDirtyPath(store, path, reason) {
  store.sql(`INSERT INTO dirty_queue VALUES (?,?,?)
    ON CONFLICT(path) DO UPDATE SET reason=excluded.reason, enqueued_at=max(excluded.enqueued_at,dirty_queue.enqueued_at+1)`)
    .run(path, reason, Date.now());
}

export const chunkCorpus = (chunk) => chunk.kind === 'symbol' ? 'code' : 'docs';
export const decodeVector = ({ vec_f32: bytes }) => new Float32Array(bytes.slice().buffer);

class IndexStore {
  statements = new Map();
  constructor(db) { this.db = db; }
  sql(text) {
    if (!this.statements.has(text)) this.statements.set(text, this.db.prepare(text));
    return this.statements.get(text);
  }
  close() { this.db.close(); }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  meta(key) { return this.sql('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  setMeta(key, value) { this.sql('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, value); }
  file(path) { return this.sql('SELECT * FROM files WHERE path=?').get(path); }
  files(kind) { return this.sql('SELECT * FROM files WHERE kind=? ORDER BY path').all(kind); }
  symbols(path) {
    return this.sql(`SELECT s.id,s.path,s.name,s.qualified_name AS qualifiedName,s.owner_id AS ownerId,s.kind,
      f.language,s.signature,s.documentation,s.start_line AS startLine,s.end_line AS endLine,s.decl_start_line AS declarationStartLine,
      s.decl_start_offset AS declarationStartOffset,s.decl_end_offset AS declarationEndOffset,s.body_start_line AS bodyStartLine,
      s.body_end_line AS bodyEndLine,s.body_start_offset AS bodyStartOffset,s.body_end_offset AS bodyEndOffset
      FROM symbols s JOIN files f ON f.path=s.path WHERE s.path=? ORDER BY s.rowid`).all(path).map((row) => ({ ...row }));
  }
  chunks(path) { return this.sql('SELECT meta_json FROM chunks WHERE path=? ORDER BY rowid').all(path).map(({ meta_json }) => JSON.parse(meta_json)); }
  clearFile(path) {
    this.sql('DELETE FROM chunks_fts WHERE rowid IN (SELECT rowid FROM chunks WHERE path=?)').run(path);
    this.sql('DELETE FROM chunks WHERE path=?').run(path);
    this.sql('DELETE FROM symbols WHERE path=?').run(path);
    this.sql('DELETE FROM files WHERE path=?').run(path);
  }
  upsertFile(file, symbols = [], chunks = []) {
    this.transaction(() => this.replaceFile(file, symbols, chunks));
  }
  replaceFile(file, symbols, chunks) {
    this.clearFile(file.path);
    const dir = posix.dirname(file.path);
    this.sql('INSERT INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(file.path, dir, file.kind ?? 'code',
      file.mtime_ms ?? -1, file.size ?? -1, String(file.ino ?? ''), file.hash, file.status, file.language ?? null,
      file.lineCount, file.sourceLength, JSON.stringify(file.imports ?? []), Date.now());
    const insertSymbol = this.sql('INSERT INTO symbols VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const symbol of symbols) insertSymbol.run(symbol.id, file.path, symbol.name, symbol.name.toLowerCase(), symbol.qualifiedName,
      symbol.qualifiedName.toLowerCase(), symbol.ownerId, symbol.kind, symbol.signature, symbol.documentation, symbol.startLine,
      symbol.endLine, symbol.declarationStartLine, symbol.declarationStartOffset, symbol.declarationEndOffset,
      symbol.bodyStartLine, symbol.bodyEndLine, symbol.bodyStartOffset, symbol.bodyEndOffset, file.hash);
    for (const chunk of chunks) {
      const { lastInsertRowid, changes } = this.sql('INSERT OR IGNORE INTO chunks VALUES (?,?,?,?,?,?,?,?,?)').run(chunk.id, chunkCorpus(chunk),
        chunk.path, chunk.heading ?? '', chunk.part ?? null, chunk.kind ?? 'document', chunk.fingerprint, chunk.text ?? '', JSON.stringify(chunk));
      if (changes) this.sql('INSERT INTO chunks_fts(rowid,chunk_id,corpus,path,names,body) VALUES (?,?,?,?,?,?)').run(lastInsertRowid,
        chunk.id, chunkCorpus(chunk), indexTerms(chunk.path), indexTerms(`${chunk.heading ?? ''} ${chunk.name ?? ''}`), indexTerms(chunk.text ?? ''));
    }
    this.updateDirectories(dir);
  }
  deleteFile(path) {
    this.transaction(() => { this.clearFile(path); this.updateDirectories(posix.dirname(path)); });
  }
  updateDirectories(dir) {
    for (;;) {
      const children = this.sql(`SELECT path AS name, sha256 AS hash FROM files WHERE dir_path=?
        UNION ALL SELECT dir_path, merkle_hash FROM dir_hashes WHERE parent=? AND dir_path<>? ORDER BY name`).all(dir, dir, dir);
      if (!children.length) this.sql('DELETE FROM dir_hashes WHERE dir_path=?').run(dir);
      else {
        const hash = textFingerprint(JSON.stringify(children));
        if (this.sql('SELECT merkle_hash FROM dir_hashes WHERE dir_path=?').get(dir)?.merkle_hash === hash) break;
        this.sql('INSERT OR REPLACE INTO dir_hashes VALUES (?,?,?,?,?)').run(dir, posix.dirname(dir), hash, children.length, Date.now());
      }
      if (dir === '.') break;
      dir = posix.dirname(dir);
    }
  }
  vector(profile, fingerprint) {
    return this.sql(`SELECT v.dimensions, v.vec_f32, EXISTS(SELECT 1 FROM corpus_fingerprints c
      WHERE c.profile_fp=v.profile_fp AND c.fingerprint=v.fingerprint) AS committed
      FROM vectors v WHERE v.profile_fp=? AND v.fingerprint=?`).get(profile, fingerprint);
  }
  upsertVectorBatch(profile, dimensions, rows) {
    this.transaction(() => this.putVectors(profile, dimensions, rows));
  }
  putVectors(profile, dimensions, rows) {
    const insert = this.sql('INSERT OR IGNORE INTO vectors(profile_fp,fingerprint,dimensions,vec_f32,updated_at) VALUES (?,?,?,?,?)');
    const now = Date.now();
    const inserted = [];
    const prior = this.sql('SELECT dimensions FROM vectors WHERE profile_fp=? LIMIT 1').get(profile);
    if (prior && rows.length && prior.dimensions !== dimensions) throw new Error('Vector dimensions do not match cache profile.');
    for (const { fingerprint, vector, corpus } of rows) {
      const values = Float32Array.from(vector);
      if (values.length !== dimensions) throw new Error('Vector dimensions do not match cache profile.');
      if (insert.run(profile, fingerprint, dimensions, Buffer.from(values.buffer), now).changes) inserted.push({ fingerprint, vector: values });
      if (corpus) this.sql('INSERT OR IGNORE INTO pending_corpora VALUES (?,?,?)').run(profile, corpus, fingerprint);
    }
    return inserted;
  }
  adjustCorpusCount(profile, corpus, delta) {
    const key = `corpus_count:${profile}:${corpus}`;
    const previous = this.meta(key);
    const count = previous === undefined ? this.sql('SELECT count(*) AS count FROM corpus_fingerprints WHERE profile_fp=? AND corpus=?').get(profile, corpus).count : Number(previous) + delta;
    this.setMeta(key, String(count));
  }
  commitCorpus(profile, corpus, fingerprints, merge = false) {
    if (!merge) this.sql('DELETE FROM corpus_fingerprints WHERE profile_fp=? AND corpus=?').run(profile, corpus);
    const insert = this.sql('INSERT OR IGNORE INTO corpus_fingerprints VALUES (?,?,?)');
    let added = 0;
    for (const fingerprint of fingerprints) added += insert.run(profile, corpus, fingerprint).changes;
    if (merge) this.adjustCorpusCount(profile, corpus, added);
    else this.setMeta(`corpus_count:${profile}:${corpus}`, String(added));
  }
  dropUnreferencedVector(profile, fingerprint) {
    return this.sql(`DELETE FROM vectors WHERE profile_fp=? AND fingerprint=? AND NOT EXISTS
      (SELECT 1 FROM corpus_fingerprints WHERE profile_fp=? AND fingerprint=? UNION ALL
       SELECT 1 FROM pending_corpora WHERE profile_fp=? AND fingerprint=?) RETURNING rowid AS id, dimensions`)
      .get(profile, fingerprint, profile, fingerprint, profile, fingerprint);
  }
}
