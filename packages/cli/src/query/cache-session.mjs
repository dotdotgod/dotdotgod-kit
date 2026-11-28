import { randomUUID } from 'node:crypto';
import { constants, lstatSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { isValidNormalizedVectorValues, readVectorCache, profileFingerprint, vectorCachePaths } from './store.mjs';
import { decodeVector, inspectIndexPath, openReadOnly, openWriter } from '../storage/index-store.mjs';
import { HNSW_THRESHOLD, HnswIndex, appendGraphDelta, checkpointGraph, discardUncommittedDelta, exactSearch, graphPath, loadGraph, vectorTier, warmGraph } from './hnsw-index.mjs';

export function readPreparedVectorSnapshot(root, identity, chunks, corpora) {
  const cache = join(root, '.dotdotgod');
  const directory = join(cache, 'vectors');
  const lock = join(directory, 'build.lock');
  const snapshot = join(directory, 'snapshots.json');
  const unavailable = (reason) => ({ ready: false, reason });
  const stat = (path) => lstatSync(path, { throwIfNoEntry: false });
  const lockReason = (entry) => entry?.isSymbolicLink() ? 'unusable' : 'build-in-progress';

  let contents;
  try {
    if ([cache, directory].some((path) => {
      const entry = stat(path);
      return entry && !entry.isDirectory();
    })) return unavailable('unusable');
    const before = stat(lock);
    if (before) return unavailable(lockReason(before));
    const entry = stat(snapshot);
    if (entry && !entry.isFile()) return unavailable('unusable');
    try {
      contents = readFileSync(snapshot, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const after = stat(lock);
    if (after) return unavailable(lockReason(after));
    if (contents === undefined) return unavailable('missing');
  } catch {
    return unavailable('unusable');
  }

  try {
    const state = JSON.parse(contents);
    if (state.schema !== 1) return unavailable('schema-mismatch');
    if (state.profile !== profileFingerprint(identity)) return unavailable('profile-mismatch');
    const { dimensions } = state;
    if (dimensions !== null && (!Number.isInteger(dimensions) || dimensions < 1)) return unavailable('corrupt');
    const committed = new Map();
    for (const corpus of corpora) {
      if (!Array.isArray(state[corpus])) return unavailable('corrupt');
      for (const row of state[corpus]) {
        if (typeof row?.chunk?.fingerprint !== 'string' || !Array.isArray(row.vector)
          || row.vector.length !== dimensions || !isValidNormalizedVectorValues(row.vector, dimensions)) return unavailable('corrupt');
        committed.set(row.chunk.fingerprint, row.vector);
      }
    }
    const matched = chunks.filter((chunk) => committed.has(chunk.fingerprint));
    if (!matched.length) return unavailable('empty');
    const vectors = new Float32Array(matched.length * dimensions);
    matched.forEach((chunk, i) => vectors.set(committed.get(chunk.fingerprint), i * dimensions));
    return { ready: true, chunks: matched, vectors, manifest: { dimensions } };
  } catch {
    return unavailable('corrupt');
  }
}

export function readLegacyVectorState(root, ownedToken) {
  const paths = vectorCachePaths(root);
  const lock = join(paths.directory, 'build.lock');
  const snapshot = join(paths.directory, 'snapshots.json');
  const stat = (path) => lstatSync(path, { throwIfNoEntry: false });
  const flag = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const blocked = () => {
    const entry = stat(lock);
    return entry && (!ownedToken || !entry.isFile() || JSON.parse(readFileSync(lock, { encoding: 'utf8', flag })).token !== ownedToken);
  };
  try {
    const directory = stat(paths.directory);
    if (directory && !directory.isDirectory()) return { reason: 'unusable' };
    if (blocked()) return { reason: 'build-in-progress' };
    const file = stat(snapshot);
    let state; let reason = 'missing';
    if (file) {
      if (!file.isFile()) return { reason: 'unusable' };
      state = JSON.parse(readFileSync(snapshot, { encoding: 'utf8', flag }));
      if (state.schema !== 1) return { reason: 'schema-mismatch' };
      if (!/^[a-f0-9]{64}$/.test(state.profile) || (state.dimensions !== null && (!Number.isInteger(state.dimensions) || state.dimensions < 1))) return { reason: 'corrupt' };
      for (const rows of [state.docs, state.code, state.pending]) {
        if (!Array.isArray(rows) || rows.some((row) => typeof row?.chunk?.fingerprint !== 'string' || !Array.isArray(row.vector)
          || row.vector.length !== state.dimensions || !isValidNormalizedVectorValues(row.vector, state.dimensions))) return { reason: 'corrupt' };
      }
      reason = 'legacy-migrated';
    } else {
      if ([paths.manifest, paths.chunks, paths.embeddings].some((path) => { const file = stat(path); return file && !file.isFile(); })) return { reason: 'unusable' };
      const diagnostics = {};
      const legacy = readVectorCache(root, null, diagnostics);
      reason = diagnostics.reason;
      if (legacy && /^[a-f0-9]{64}$/.test(legacy.manifest.profileFingerprint) && legacy.chunks.every((chunk) => typeof chunk?.fingerprint === 'string')) {
        const { dimensions, profileFingerprint: profile } = legacy.manifest;
        state = { dimensions, profile, docs: [], code: [], pending: [] };
        legacy.chunks.forEach((chunk, i) => state[chunk.kind === 'symbol' ? 'code' : 'docs']
          .push({ chunk, vector: legacy.vectors.subarray(i * dimensions, (i + 1) * dimensions) }));
        reason = 'legacy-migrated';
      } else if (legacy) reason = 'corrupt';
    }
    return blocked() ? { reason: 'build-in-progress' } : { state, reason };
  } catch { return { reason: 'corrupt' }; }
}

export function sqliteVectorSnapshot(root, store, identity, corpora, allowed, limit) {
  const profile = profileFingerprint(identity);
  const args = [profile, corpora[0], corpora[1] ?? corpora[0]];
  const from = `FROM chunks c JOIN corpus_fingerprints f ON f.fingerprint=c.fingerprint AND f.corpus=c.corpus
    JOIN vectors v ON v.profile_fp=f.profile_fp AND v.fingerprint=f.fingerprint WHERE f.profile_fp=? AND f.corpus IN (?,?)`;
  const view = `SELECT c.path,c.corpus,c.meta_json,v.id,v.dimensions`;
  const all = store.sql(`${view} ${from}`);
  const count = corpora.reduce((sum, corpus) => sum + Number(store.meta(`corpus_count:${profile}:${corpus}`) ?? 0), 0);
  let first;
  if (count) for (const row of all.iterate(...args)) if (allowed(row.path, row.corpus)) { first = row; break; }
  if (!first) {
    const known = store.sql('SELECT 1 FROM vectors WHERE profile_fp=? LIMIT 1').get(profile);
    const other = store.sql('SELECT 1 FROM vectors LIMIT 1').get();
    return { ready: false, reason: known ? 'empty' : other ? 'profile-mismatch' : 'missing' };
  }
  const budget = Math.max(limit * 4, 120);
  const generation = Number(store.meta(`hnsw_generation:${profile}`) ?? 0);
  let graph;
  if (generation && vectorTier(count) === 'hnsw') {
    try { graph = warmGraph(graphPath(root, profile), generation, store.meta('instance')); } catch { /* Derived index unavailable; use committed SQLite vectors. */ }
  }
  return { ready: true, manifest: { dimensions: first.dimensions }, rank(query) {
    const cmp = (rows) => rows.map(({ chunk, score }) => ({ ...chunk, vectorScore: Math.max(-1, Math.min(1, score)) }));
    const get = store.sql(`${view} ${from} AND v.id=?`);
    if (graph?.dimensions === first.dimensions) {
      const candidates = new Map();
      const ranked = graph.search(query, budget, Math.max(64, limit * 4, budget * 3), (id) => {
        const row = get.get(...args, id);
        if (!row || !allowed(row.path, row.corpus)) return false;
        candidates.set(id, JSON.parse(row.meta_json));
        return true;
      });
      const unique = new Set();
      const picks = ranked.flatMap(({ id, score }) => {
        const chunk = candidates.get(id);
        const key = chunk.kind === 'symbol' ? chunk.id : chunk.path;
        if (unique.has(key)) return [];
        unique.add(key);
        return { chunk, score };
      });
      if (picks.length >= Math.min(limit, count)) return cmp(picks);
    }
    function* rows() {
      for (const row of store.sql(`SELECT c.path,c.corpus,v.id,v.vec_f32 ${from}`).iterate(...args)) {
        if (!allowed(row.path, row.corpus)) continue;
        yield { id: row.id, vector: decodeVector(row), key: row.corpus === 'docs' ? row.path : undefined };
      }
    }
    const ranked = exactSearch(query, rows(), budget);
    return cmp(ranked.map(({ id, score }) => ({ chunk: JSON.parse(get.get(...args, id).meta_json), score })));
  } };
}

// Called only inside the SQLite writer transaction that publishes this generation.
export function updateVectorGraph(root, profile, store, dimensions, total, inserted, removed, graph) {
  const generationKey = `hnsw_generation:${profile}`;
  if (!dimensions) return null;
  const previous = Number(store.meta(generationKey) ?? 0);
  if (!previous && (total === undefined
    ? !store.sql('SELECT 1 FROM vectors WHERE profile_fp=? LIMIT 1 OFFSET ?').get(profile, HNSW_THRESHOLD - 1)
    : total < HNSW_THRESHOLD)) return null;
  const path = graphPath(root, profile);
  if (!graph || graph.generation !== previous) {
    try {
      graph = previous ? loadGraph(path, previous) : null;
      if (graph) discardUncommittedDelta(path, graph);
    } catch { graph = null; }
  }
  if (!graph) {
    graph = new HnswIndex(dimensions, Math.max(32, total ?? HNSW_THRESHOLD));
    store.sql('DELETE FROM hnsw_nodes WHERE profile_fp=?').run(profile);
    const put = store.sql('INSERT INTO hnsw_nodes VALUES (?,?,?,0)');
    for (const row of store.sql('SELECT rowid AS id, fingerprint, vec_f32 FROM vectors WHERE profile_fp=? ORDER BY rowid').iterate(profile)) {
      graph.insert(row.id, decodeVector(row));
      put.run(profile, row.id, row.fingerprint);
    }
    graph.generation = previous + 1;
    checkpointGraph(path, graph);
  } else {
    if (!inserted.length && !removed.length) return graph;
    const put = store.sql('INSERT OR REPLACE INTO hnsw_nodes VALUES (?,?,?,0)');
    const nodes = inserted.flatMap(({ fingerprint, vector }) => {
      const row = store.sql('SELECT rowid AS id FROM vectors WHERE profile_fp=? AND fingerprint=?').get(profile, fingerprint);
      if (!row) return [];
      const { id } = row;
      put.run(profile, id, fingerprint);
      graph.insert(id, vector);
      return { id, vector };
    });
    const deleted = removed.map(({ id }) => id);
    for (const id of deleted) {
      graph.markDeleted(id);
      store.sql('UPDATE hnsw_nodes SET deleted=1 WHERE profile_fp=? AND node_id=?').run(profile, id);
    }
    graph.generation = previous + 1;
    if (graph.compact()) {
      checkpointGraph(path, graph);
      store.sql('DELETE FROM hnsw_nodes WHERE profile_fp=? AND deleted=1').run(profile);
    } else appendGraphDelta(path, graph.generation, dimensions, nodes, deleted);
  }
  store.setMeta(generationKey, String(graph.generation));
  return graph;
}

export async function vectorCacheSession(root, identity, action) {
  inspectIndexPath(root);
  const directory = join(root, '.dotdotgod', 'vectors');
  const entry = lstatSync(directory, { throwIfNoEntry: false });
  if (entry && !entry.isDirectory()) throw new Error('Vector directory must be a real directory.');
  mkdirSync(directory, { recursive: true });
  const lock = join(directory, 'build.lock');
  const token = randomUUID();
  const started = Date.now();
  let waited = false;
  while (true) {
    try {
      const fd = openSync(lock, 'wx');
      try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); } finally { closeSync(fd); }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      waited = true;
      const entry = lstatSync(lock, { throwIfNoEntry: false });
      if (entry && !entry.isFile()) throw new Error('Vector lock must be a regular file.');
      if (Date.now() - started >= 30000) throw new Error('Vector cache lock timed out; another build may be running or the lock needs inspection.');
      try {
        const owner = JSON.parse(readFileSync(lock, 'utf8'));
        if (!Number.isInteger(owner.pid) || owner.pid < 1) throw new Error('Invalid lock owner.');
        try { process.kill(owner.pid, 0); }
        catch (probe) {
          if (probe.code !== 'ESRCH') throw probe;
          const recovery = `${lock}.recovery`;
          try { mkdirSync(recovery); }
          catch (claim) { if (claim.code === 'EEXIST') { await sleep(50); continue; } throw claim; }
          try {
            const current = JSON.parse(readFileSync(lock, 'utf8'));
            if (current.token === owner.token && current.pid === owner.pid) rmSync(lock);
          } finally { rmSync(recovery, { recursive: true, force: true }); }
          continue;
        }
      } catch (probe) { if (probe.code === 'ENOENT') continue; }
      await sleep(50);
    }
  }
  const profile = profileFingerprint(identity);
  let writer;
  let reader;
  let graph;
  let total;
  const updateGraph = (store, dimensions, inserted, removed) => {
    graph = updateVectorGraph(root, profile, store, dimensions, total, inserted, removed, graph);
  };
  const open = () => {
    if (!writer) {
      reader?.close(); reader = null;
      writer = openWriter(root, token);
      total = writer.sql('SELECT count(*) AS count FROM vectors WHERE profile_fp=?').get(profile).count;
    }
    return writer;
  };
  try {
    reader = openReadOnly(root);
    const migration = reader?.meta('vector_migration');
    const legacy = migration ? null : readLegacyVectorState(root, token);
    const legacyRows = new Map();
    if (legacy?.state?.profile === profile) {
      const { docs, code, pending, dimensions } = legacy.state;
      for (const [rows, committed] of [[pending, false], [docs, true], [code, true]]) {
        for (const { chunk, vector } of rows) legacyRows.set(chunk.fingerprint, { dimensions, vector, committed });
      }
    }
    const profileExists = reader?.sql('SELECT 1 FROM vectors WHERE profile_fp=? LIMIT 1').get(profile);
    const session = {
      lookup(fingerprint) {
        const row = (writer ?? reader)?.vector(profile, fingerprint);
        return row ? { ...row, vector: decodeVector(row) } : legacyRows.get(fingerprint);
      },
      save(dimensions, rows) {
        const store = open();
        store.transaction(() => {
          const inserted = store.putVectors(profile, dimensions, rows);
          total += inserted.length;
          updateGraph(store, dimensions, inserted, []);
        });
      },
      commit(dimensions, rows, corpora, refresh, merge) {
        const store = open();
        refresh?.(store);
        store.transaction(() => {
          const inserted = rows.length ? store.putVectors(profile, dimensions, rows) : [];
          total += inserted.length;
          const candidates = new Set();
          for (const [corpus, fingerprints] of corpora) {
            if (!merge) {
              for (const { fingerprint } of store.sql(`SELECT fingerprint FROM corpus_fingerprints WHERE profile_fp=? AND corpus=?
                UNION SELECT fingerprint FROM pending_corpora WHERE profile_fp=? AND corpus=?`).iterate(profile, corpus, profile, corpus)) candidates.add(fingerprint);
              store.sql('DELETE FROM pending_corpora WHERE profile_fp=? AND corpus=?').run(profile, corpus);
            } else for (const fingerprint of fingerprints) store.sql('DELETE FROM pending_corpora WHERE profile_fp=? AND corpus=? AND fingerprint=?').run(profile, corpus, fingerprint);
            store.commitCorpus(profile, corpus, fingerprints, merge);
          }
          const removed = [];
          for (const fingerprint of candidates) {
            const result = store.dropUnreferencedVector(profile, fingerprint);
            if (result) removed.push(result);
          }
          total -= removed.length;
          updateGraph(store, dimensions ?? store.sql('SELECT dimensions FROM vectors WHERE profile_fp=? LIMIT 1').get(profile)?.dimensions ?? removed[0]?.dimensions ?? graph?.dimensions,
            inserted, removed);
        });
      },
    };
    return await action(session, { reason: profileExists ? 'valid' : legacy?.state && legacy.state.profile !== profile ? 'profile-mismatch' : legacy?.reason ?? migration,
      lockWaitMs: waited ? Date.now() - started : 0 });
  } finally {
    reader?.close();
    writer?.close();
    try { if (JSON.parse(readFileSync(lock, 'utf8')).token === token) rmSync(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
