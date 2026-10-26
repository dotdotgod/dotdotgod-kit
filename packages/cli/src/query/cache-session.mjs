import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { isValidNormalizedVectorValues, readVectorCache, profileFingerprint } from './store.mjs';

// One atomic state file keeps completed snapshots and unfinished batches consistent.
export async function vectorCacheSession(root, identity, action) {
  const directory = join(root, '.dotdotgod', 'vectors');
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
  try {
    const path = join(directory, 'snapshots.json');
    const fingerprint = profileFingerprint(identity);
    let state; let reason = 'missing';
    try {
      state = JSON.parse(readFileSync(path, 'utf8'));
      if (state.schema !== 1) { reason = 'schema-mismatch'; state = null; }
      else if (state.profile !== fingerprint) { reason = 'profile-mismatch'; state = null; }
      else {
        if (state.dimensions !== null && (!Number.isInteger(state.dimensions) || state.dimensions < 1)) throw new Error('Invalid cache dimensions.');
        for (const rows of [state.docs, state.code, state.pending]) {
          if (!Array.isArray(rows) || rows.some((row) => typeof row.chunk?.fingerprint !== 'string' || !Array.isArray(row.vector) || row.vector.length !== state.dimensions || !isValidNormalizedVectorValues(row.vector, state.dimensions))) throw new Error('Invalid cache rows.');
        }
        reason = 'valid';
      }
    } catch (error) { state = null; reason = error.code === 'ENOENT' ? 'missing' : 'corrupt'; }
    if (!state) {
      state = { schema: 1, profile: fingerprint, dimensions: null, docs: [], code: [], pending: [] };
      if (reason === 'missing') {
        const legacyDiagnostics = {};
        const legacy = readVectorCache(root, identity, legacyDiagnostics);
        reason = legacyDiagnostics.reason;
        if (legacy) {
          state.dimensions = legacy.manifest.dimensions;
          legacy.chunks.forEach((chunk, i) => state[chunk.kind === 'symbol' ? 'code' : 'docs'].push({ chunk, vector: Array.from(legacy.vectors.subarray(i * state.dimensions, (i + 1) * state.dimensions)) }));
          reason = 'legacy-migrated';
        }
      }
    }
    const save = () => {
      const temporary = `${path}.tmp-${token}`;
      try { writeFileSync(temporary, JSON.stringify(state)); renameSync(temporary, path); }
      finally { rmSync(temporary, { force: true }); }
    };
    return await action(state, save, { reason, lockWaitMs: waited ? Date.now() - started : 0 });
  } finally {
    try { if (JSON.parse(readFileSync(lock, 'utf8')).token === token) rmSync(lock); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
