import { randomUUID } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { Worker, parentPort, workerData } from 'node:worker_threads';
import { isInitializedProject } from './hook-state.mjs';
import { readMemoryConfig } from '../memory/config.mjs';
import { checkedDocumentationRoot, isSharedMemoryPath } from '../memory/documentation-map.mjs';
import { containedStat, docChunks, gitChanges, inspectFile, pathEligibility, sameStat } from '../storage/change-detector.mjs';
import { activeWorkerLease, enqueueDirtyPath, inspectIndexPath, openReadOnly, openWriter, workerLease } from '../storage/index-store.mjs';
import { outlinePolicy } from '../symbols/discovery.mjs';
import { outlineChunks, outlineRecord } from '../symbols/store.mjs';
import { resolveEmbedder, withEmbeddingOperation } from '../query/embedder.mjs';
import { embeddingProfileIdentity, resolveEmbeddingProfile } from '../query/embedding-config.mjs';
import { isValidNormalizedVectorValues, profileFingerprint } from '../query/store.mjs';
import { updateVectorGraph } from '../query/cache-session.mjs';

const REVOKED = Symbol('background index work revoked');
const REVOKED_FILE = new Error('Source changed while indexing.');
const GIT_TIMEOUT = 2000;
const MAX_DIRECTORY_WATCHES = 128;
const defaultOptions = { leaseTtlMs: 10_000, renewMs: 4000, tier1Ms: 200, tier2Ms: 1500, retryMs: 1500, watch, resolveEmbedder };
const configKey = (config) => JSON.stringify([config.documentation.root, config.areas, config.load.documentationSummary.exclude]);
const corpusFor = (eligible, path) => eligible(path, 'docs') ? 'docs' : eligible(path, 'code') ? 'code' : null;
const policyPath = (path) => path === 'dotdotgod.config.json' || path.split('/').at(-1) === '.gitignore';
const sqliteBusy = (error) => Number.isInteger(error?.errcode) && (error.errcode & 255) === 5;
const transient = (error) => error?.status === 429 || error?.status === 408 || error?.status >= 500
  || /rate limit|timed?\s*out|timeout|fetch failed|network error|ECONNRESET|EAI_AGAIN/i.test(error?.message ?? '');

function eligibleConfig(root) {
  if (!isInitializedProject(root)) return null;
  const config = readMemoryConfig(root);
  if (config.errors.length || !config.indexing.watch || checkedDocumentationRoot(root, config.documentation.root) !== root) return null;
  return config;
}

// A production MCP runs maintenance off its JSON-RPC event loop, including the first WAL open and HNSW rebuilds.
export function startBackgroundIndexer(root) {
  const stopped = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(new URL(import.meta.url), { workerData: { backgroundIndexRoot: root, stopped } });
  worker.on('error', () => {});
  const exited = new Promise((resolve) => worker.once('exit', resolve));
  worker.unref();
  return {
    async close() {
      if (!Atomics.exchange(stopped, 0, 1)) {
        worker.ref();
        worker.postMessage('close');
      }
      await exited;
    },
  };
}

export class BackgroundIndexWorker {
  constructor(root, options = {}) {
    this.root = resolve(root);
    this.options = { ...defaultOptions, ...options };
    this.watchers = [];
    this.embedDue = Infinity;
    this.retryAt = 0;
    this.retryCount = 0;
    this.tier1Due = 0;
    this.workVersion = 0;
  }

  start() {
    if (this.started || this.closed) return;
    this.started = true;
    if (!isInitializedProject(this.root)) return;
    try { this.root = realpathSync(this.root); if (!this.config()) return; } catch { return; }
    this.leaseStep();
  }

  config() { return eligibleConfig(this.root); }
  stopped() { return this.closed || (this.options.stopped && Atomics.load(this.options.stopped, 0) !== 0); }
  owns(token) { return !this.stopped() && token && token === this.token && workerLease(this.store)?.token === token; }
  ready(token) {
    if (!this.owns(token) || workerLease(this.store).expiresAt <= Date.now()) throw REVOKED;
  }

  write(token, action) {
    return this.store.transaction(() => {
      this.ready(token);
      const result = action();
      if (this.stopped()) throw REVOKED;
      return result;
    });
  }

  leaseStep() {
    if (this.stopped()) return;
    try {
      const config = this.config();
      if (!config) this.stopLeading();
      else if (this.token) {
        const renewed = this.store.transaction(() => {
          if (!this.owns(this.token) || workerLease(this.store).expiresAt <= Date.now()) return false;
          this.store.setMeta('worker_lease', JSON.stringify({ pid: process.pid, token: this.token, expiresAt: Date.now() + this.options.leaseTtlMs }));
          return true;
        });
        if (!renewed) this.stopLeading();
      } else this.tryLead(config);
    } catch (error) { if (!sqliteBusy(error)) this.stopLeading(); }
    const delay = this.token ? this.options.renewMs : this.options.leaseTtlMs / 2;
    this.leaseTimer = setTimeout(() => this.leaseStep(), delay).unref();
  }

  tryLead(config) {
    let reader;
    try {
      reader = openReadOnly(this.root);
      if (reader && activeWorkerLease(workerLease(reader))) return;
    } finally { reader?.close(); }
    const store = openWriter(this.root, undefined, { nonblocking: true });
    const token = randomUUID();
    let claimed;
    try {
      claimed = store.transaction(() => {
        if (this.stopped() || activeWorkerLease(workerLease(store))) return false;
        store.setMeta('worker_lease', JSON.stringify({ pid: process.pid, token, expiresAt: Date.now() + this.options.leaseTtlMs }));
        return true;
      });
    } finally { if (!claimed) store.close(); }
    if (!claimed) return;
    this.store = store;
    this.token = token;
    this.scan = { force: false };
    this.policy = undefined;
    this.watcherFailed = false;
    this.profileKey = undefined;
    this.embedDue = Infinity;
    this.startWatchers(config);
    this.scheduleTierOne(0);
  }

  closeWatchers() {
    for (const watcher of this.watchers.splice(0)) watcher.close();
  }

  *entries(config, directories = false) {
    const allowed = pathEligibility(this.root, config, 'worker');
    const pending = [''];
    while (pending.length) {
      const dir = pending.pop();
      if (dir && !containedStat(this.root, dir, 'directory')) continue;
      if (directories) yield dir;
      let entries;
      try { entries = readdirSync(join(this.root, dir), { withFileTypes: true }); }
      catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue; throw error; }
      for (const entry of entries) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.isDirectory() && allowed(path, 'directory')) pending.push(path);
        else if (!directories && entry.isFile() && corpusFor(allowed, path)) yield path;
      }
    }
  }

  startWatchers(config) {
    if (this.watcherFailed || this.stopped()) return;
    this.closeWatchers();
    const token = this.token;
    const recursive = process.platform === 'darwin' || process.platform === 'win32';
    const fallback = () => {
      if (token !== this.token || this.stopped()) return;
      this.watcherFailed = true;
      this.closeWatchers();
      this.scan = { force: true };
    };
    try {
      for (const dir of recursive ? [''] : this.entries(config, true)) {
        const watcher = this.options.watch(join(this.root, dir), { recursive, persistent: false }, (event, filename) => {
          if (token !== this.token || this.stopped()) return;
          try { this.observe(token, event, filename && (dir ? `${dir}/${filename}` : String(filename)).replaceAll('\\', '/')); }
          catch (error) { if (error !== REVOKED) this.scan = { force: true }; }
        });
        watcher.on('error', fallback);
        this.watchers.push(watcher);
        // shortcut: cap Linux directory handles, use hooks for unwatched subtrees until scalable watching is available.
        if (this.watchers.length >= MAX_DIRECTORY_WATCHES) break;
      }
    } catch { fallback(); }
  }

  observe(token, event, path) {
    const config = this.config();
    if (!config) return;
    const allowed = pathEligibility(this.root, config, 'worker');
    const policyEdit = path && policyPath(path);
    if (policyEdit && path.includes('/') && !allowed(path.slice(0, path.lastIndexOf('/')), 'directory')) return;
    if (path && !policyEdit && !corpusFor(allowed, path) && !allowed(path, 'directory')) return;
    const directoryChange = event === 'rename' && path && allowed(path, 'directory') && (
      lstatSync(join(this.root, path), { throwIfNoEntry: false })?.isDirectory()
      || this.store.sql('SELECT 1 FROM dir_hashes WHERE dir_path=?').get(path)
    );
    if (!path || policyEdit || directoryChange) {
      if (policyEdit) this.controller?.abort();
      this.scan = { force: true, rewatch: !path || Boolean(directoryChange) || path?.endsWith('.gitignore') };
    } else if (corpusFor(allowed, path)) {
      this.write(token, () => enqueueDirtyPath(this.store, path, 'watch'));
    } else return;
    this.tier1Due = Date.now() + this.options.tier1Ms;
  }

  async catchUp(token, config, scan) {
    const store = this.store;
    const previous = store.meta('worker_policy');
    const git = gitChanges(this.root, store, 'worker_', GIT_TIMEOUT);
    const outlines = outlinePolicy(this.root);
    const policy = JSON.stringify([configKey(config), outlines]);
    const fast = !scan.force && store.meta('worker_dirty_since_scan') === '0'
      && previous === policy && git.paths && ![...git.paths].some(policyPath);
    const reparse = store.meta('outline_policy') !== outlines;
    this.write(token, () => store.setMeta('worker_dirty_since_scan', '1'));
    const allowed = pathEligibility(this.root, config, 'worker');
    const old = fast ? null : new Map(store.sql("SELECT * FROM files WHERE kind IN ('doc','code')").all().map((row) => [row.path, row]));
    const paths = fast ? git.paths : this.entries(config);
    const pending = [];
    const flush = () => this.write(token, () => {
      const enqueue = store.sql('INSERT OR IGNORE INTO dirty_queue VALUES (?, ?, ?)');
      for (const path of pending.splice(0)) enqueue.run(path, 'catch-up', Date.now());
    });
    let visited = 0;
    for (const path of paths) {
      const cached = old ? old.get(path) : store.file(path);
      old?.delete(path);
      const corpus = corpusFor(allowed, path);
      const stat = corpus && containedStat(this.root, path);
      if ((stat && (!sameStat(stat, cached) || cached.kind !== (corpus === 'docs' ? 'doc' : 'code') || (cached.kind === 'code' && (reparse || !['parsed', 'unsupported'].includes(cached.status))))) || (!stat && cached)) pending.push(path);
      if (++visited % 100 === 0) { flush(); await yieldTurn(); this.ready(token); }
    }
    for (const path of old?.keys() ?? []) {
      pending.push(path);
      if (pending.length >= 100) { flush(); await yieldTurn(); this.ready(token); }
    }
    if (pending.length) flush();
    this.ready(token);
    if (this.scan === scan) this.scan = null;
    this.policy = { policy, outlines, git, config: configKey(config), reparse, scanUnpublished: true, observedEdit: false };
  }

  scheduleTierOne(delay = this.options.tier1Ms) {
    if (!this.token || this.stopped()) return;
    clearTimeout(this.tier1Timer);
    this.tier1Timer = setTimeout(() => {
      if (this.tier1Pending || !this.token || this.stopped()) return this.scheduleTierOne();
      const token = this.token;
      this.tier1Pending = this.tick(token).catch(() => {}).finally(() => {
        this.tier1Pending = null;
        this.scheduleTierOne();
      });
    }, delay).unref();
  }

  async tick(token) {
    this.ready(token);
    const config = this.config();
    if (!config) { this.stopLeading(); return; }
    if (this.policy && this.policy.config !== configKey(config)) this.scan ??= { force: true, rewatch: true };
    if (this.controller) {
      try { if (this.scan || JSON.stringify(this.profile(config)) !== this.profileKey) this.controller.abort(); }
      catch { this.controller.abort(); }
    }
    if (Date.now() < this.tier1Due) return;
    if (this.scan) {
      const scan = this.scan;
      if (scan.rewatch) this.startWatchers(config);
      await this.catchUp(token, config, scan);
      this.ready(token);
      if (this.scan) return;
      this.workVersion++;
      this.embedDue = Date.now() + this.options.tier2Ms;
    }
    const rows = this.store.sql('SELECT * FROM dirty_queue WHERE enqueued_at<=? ORDER BY enqueued_at,path LIMIT 20').all(Date.now());
    if (rows.length) {
      this.workVersion++;
      this.embedDue = Date.now() + this.options.tier2Ms;
    }
    const allowed = pathEligibility(this.root, config, 'worker');
    for (const row of rows) {
      this.ready(token);
      try { await this.indexPath(token, row, allowed); }
      catch (error) {
        if (error === REVOKED || sqliteBusy(error)) throw error;
        // Keep racing/unreadable inputs in the queue without starving newer paths.
        this.write(token, () => this.store.sql('UPDATE dirty_queue SET enqueued_at=? WHERE path=? AND enqueued_at=?')
          .run(Date.now() + 2000, row.path, row.enqueued_at));
      }
      await yieldTurn();
    }
    this.ready(token);
    if (this.scan || this.store.sql('SELECT 1 FROM dirty_queue WHERE enqueued_at<=? LIMIT 1').get(Date.now())) return;
    if ((rows.length || this.policy.scanUnpublished) && !this.store.sql('SELECT 1 FROM dirty_queue LIMIT 1').get()) this.publishMetadata(token, config);
    this.scheduleEmbeddings(token, config);
  }

  async indexPath(token, row, allowed) {
    const { path, enqueued_at: revision } = row;
    const store = this.store;
    const cached = store.file(path);
    const corpus = corpusFor(allowed, path);
    const code = corpus === 'code';
    const kind = code ? 'code' : 'doc';
    const reuse = cached?.kind === kind && ['parsed', 'unsupported'].includes(cached.status)
      && !(code && row.reason === 'catch-up' && this.policy?.reparse);
    const file = corpus && inspectFile(this.root, path, reuse ? cached : null, { code });
    let record;
    let chunks;
    if (file && !(reuse && sameStat(cached, file))) {
      record = { ...file, kind, status: 'parsed', symbols: [], imports: [] };
      if (code) {
        if (reuse && cached.sha256 === file.hash) record = { ...outlineRecord(store, cached), ...file, kind };
        else if (!file.language) record.status = 'unsupported';
        else {
          const { extractSymbols } = await import('../symbols/parser.mjs');
          this.ready(token);
          Object.assign(record, await extractSymbols(path, file.source, file.language));
        }
        chunks = outlineChunks({ files: [record] });
      } else chunks = docChunks(file);
    }
    if (file && !sameStat(file, containedStat(this.root, path))) throw REVOKED_FILE;
    this.write(token, () => {
      if (record || (!file && cached)) {
        const previous = store.sql('SELECT DISTINCT corpus,fingerprint FROM chunks WHERE path=?').all(path);
        if (record) store.replaceFile(record, record.symbols, chunks);
        else { store.clearFile(path); store.updateDirectories(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'); }
        this.pruneVectors(previous);
      }
      if (row.reason !== 'catch-up') {
        this.policy.observedEdit = true;
        store.setMeta('worker_dirty_since_scan', '1');
      }
      store.sql('DELETE FROM dirty_queue WHERE path=? AND enqueued_at=?').run(path, revision);
    });
  }

  pruneVectors(previous) {
    const store = this.store;
    const removed = new Map();
    for (const { corpus, fingerprint } of previous) {
      const memberships = store.sql(`DELETE FROM corpus_fingerprints WHERE corpus=? AND fingerprint=?
        AND NOT EXISTS (SELECT 1 FROM chunks WHERE corpus=? AND fingerprint=?) RETURNING profile_fp`)
        .all(corpus, fingerprint, corpus, fingerprint);
      for (const { profile_fp: profile } of memberships) {
        store.adjustCorpusCount(profile, corpus, -1);
        const row = store.dropUnreferencedVector(profile, fingerprint);
        if (row) {
          if (!removed.has(profile)) removed.set(profile, []);
          removed.get(profile).push(row);
        }
      }
    }
    for (const [profile, rows] of removed) this.updateGraph(profile, rows[0].dimensions, [], rows);
  }

  updateGraph(profile, dimensions, inserted, removed) {
    const graph = this.graphProfile === profile ? this.graph : null;
    this.graph = null;
    this.graphProfile = profile;
    this.graph = updateVectorGraph(this.root, profile, this.store, dimensions, undefined, inserted, removed, graph);
  }

  publishMetadata(token, config) {
    const { policy, outlines, git } = this.policy;
    this.write(token, () => {
      const store = this.store;
      store.setMeta('docs_root', config.documentation.root);
      store.setMeta('outline_policy', outlines);
      store.setMeta('outline_count', String(store.sql("SELECT count(*) AS n FROM files WHERE kind='code'").get().n));
      for (const prefix of ['', 'worker_']) {
        store.setMeta(`${prefix}last_git_head`, git.head ?? '');
        store.setMeta(`${prefix}last_git_dirty`, JSON.stringify(git.dirty ?? []));
      }
      store.setMeta('worker_policy', policy);
      if (this.policy.scanUnpublished && !this.policy.observedEdit) store.setMeta('worker_dirty_since_scan', '0');
    });
    this.policy.scanUnpublished = false;
  }

  profile(config) {
    return config.indexing.backgroundEmbeddings ? resolveEmbeddingProfile(this.root, this.options).profile : null;
  }

  scheduleEmbeddings(token, config) {
    if (this.tier2Pending) return;
    let profile;
    try { profile = this.profile(config); } catch { return; }
    const key = JSON.stringify(profile);
    if (this.profileKey !== key) {
      this.profileKey = key;
      this.fatalEmbedding = false;
      this.retryCount = 0;
      this.retryAt = 0;
      if (this.embedDue === Infinity) this.embedDue = Date.now() + this.options.tier2Ms;
    }
    if (!profile || this.fatalEmbedding || Date.now() < Math.max(this.retryAt, this.embedDue)) return;
    const controller = new AbortController();
    this.controller = controller;
    const policy = this.policy.config;
    this.tier2Pending = this.embed(token, profile, key, policy, controller.signal).catch((error) => {
      if (token !== this.token || this.stopped() || controller.signal.aborted || error === REVOKED || sqliteBusy(error)) return;
      if (error?.status !== 401 && error?.status !== 403 && transient(error)) {
        this.retryAt = Date.now() + Math.min(60_000, this.options.retryMs * 2 ** this.retryCount++);
      } else this.fatalEmbedding = true;
    }).finally(() => { this.controller = null; this.tier2Pending = null; });
  }

  async embed(token, profile, key, policy, signal) {
    const profileFp = profileFingerprint(embeddingProfileIdentity(profile));
    const store = this.store;
    const version = this.workVersion;
    let rows = [];
    const guardedConfig = () => {
      this.ready(token);
      signal.throwIfAborted();
      if (this.scan || this.workVersion !== version) throw REVOKED;
      let config;
      try {
        config = this.config();
        if (config && configKey(config) === policy && JSON.stringify(this.profile(config)) === key) return config;
      } catch { /* A replaced/invalid policy cannot authorize a request. */ }
      throw REVOKED;
    };
    const stillAllowed = (row, config, allowed) => allowed(row.path, row.corpus) && isSharedMemoryPath(row.path, config)
      && sameStat(row, containedStat(this.root, row.path))
      && store.sql('SELECT 1 FROM chunks WHERE rowid=? AND fingerprint=?').get(row.id, row.fingerprint);
    const beforeRequest = () => {
      const config = guardedConfig();
      const allowed = pathEligibility(this.root, config, 'worker');
      if (!rows.every((row) => stillAllowed(row, config, allowed))) throw REVOKED;
    };
    await withEmbeddingOperation({ ...this.options, cwd: this.root, profile, signal, beforeRequest }, async (options) => {
      let embed;
      for (const corpus of ['docs', 'code']) {
        let after = 0;
        for (;;) {
          const config = guardedConfig();
          if (store.sql('SELECT 1 FROM dirty_queue WHERE enqueued_at<=? LIMIT 1').get(Date.now())) return;
          const candidates = store.sql(`SELECT c.rowid AS id,c.path,c.corpus,c.fingerprint,c.meta_json,f.mtime_ms,f.size,f.ino,
            v.dimensions FROM chunks c JOIN files f ON f.path=c.path
            LEFT JOIN vectors v ON v.profile_fp=? AND v.fingerprint=c.fingerprint
            LEFT JOIN corpus_fingerprints m ON m.profile_fp=? AND m.corpus=c.corpus AND m.fingerprint=c.fingerprint
            WHERE c.corpus=? AND c.rowid>? AND (v.id IS NULL OR m.fingerprint IS NULL) ORDER BY c.rowid LIMIT 16`)
            .all(profileFp, profileFp, corpus, after);
          if (!candidates.length) break;
          after = candidates.at(-1).id;
          const allowed = pathEligibility(this.root, config, 'worker');
          rows = candidates.filter((row) => stillAllowed(row, config, allowed));
          if (rows.length) {
            const missing = rows.filter((row) => row.dimensions === null);
            let inserts = [];
            let dimensions = rows.find((row) => row.dimensions !== null)?.dimensions;
            if (missing.length) {
              embed ??= (await this.options.resolveEmbedder(this.root, options)).embed;
              beforeRequest();
              const result = await embed(missing.map((row) => JSON.parse(row.meta_json).passage), 'document');
              dimensions ??= result[0]?.length;
              if (!dimensions || result.length !== missing.length || result.some((row) => !isValidNormalizedVectorValues(row, dimensions))) throw new Error('Invalid background embedding batch.');
              inserts = missing.map(({ fingerprint }, index) => ({ fingerprint, vector: result[index] }));
            }
            this.ready(token);
            this.write(token, () => {
              beforeRequest();
              const inserted = store.putVectors(profileFp, dimensions, inserts);
              for (const { fingerprint } of rows) store.sql('DELETE FROM pending_corpora WHERE profile_fp=? AND corpus=? AND fingerprint=?').run(profileFp, corpus, fingerprint);
              store.commitCorpus(profileFp, corpus, rows.map((row) => row.fingerprint), true);
              this.updateGraph(profileFp, dimensions, inserted, []);
            });
            this.retryAt = 0;
            this.retryCount = 0;
          }
          await yieldTurn();
        }
      }
      guardedConfig();
      this.embedDue = Infinity;
    });
  }

  stopLeading() {
    const token = this.token;
    this.token = null;
    this.controller?.abort();
    clearTimeout(this.tier1Timer);
    this.closeWatchers();
    if (!this.store) return;
    try {
      this.store.transaction(() => {
        if (workerLease(this.store)?.token === token) this.store.sql("DELETE FROM meta WHERE key='worker_lease'").run();
      });
    } catch { /* The lease expires if a concurrent writer prevented release. */ }
    finally { this.store.close(); this.store = null; this.graph = null; }
  }

  close() {
    if (!this.closing) {
      this.closed = true;
      clearTimeout(this.leaseTimer);
      clearTimeout(this.tier1Timer);
      this.controller?.abort();
      this.closeWatchers();
      this.closing = Promise.all([this.tier1Pending, this.tier2Pending]).finally(() => this.stopLeading());
    }
    return this.closing;
  }
}

if (parentPort && workerData?.backgroundIndexRoot) {
  const worker = new BackgroundIndexWorker(workerData.backgroundIndexRoot, { stopped: workerData.stopped });
  parentPort.once('message', async () => {
    try { await worker.close(); } finally { parentPort.close(); }
  });
  worker.start();
  if (!worker.leaseTimer) parentPort.close();
}
