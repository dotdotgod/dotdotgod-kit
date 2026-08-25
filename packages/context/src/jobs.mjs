import { fetchAndIndex, indexFile } from './content.mjs';

const MAX_PENDING_JOBS = 100;

export class IngestionJobRunner {
  constructor(store, { sessionId, renderer, root } = {}) {
    this.store = store;
    this.sessionId = sessionId;
    this.root = root ?? store.root;
    this.renderer = renderer;
    this.running = false;
    this.scheduled = false;
    this.closed = false;
    this.pumpPromise = undefined;
    this.controllers = new Map();
    this.schedule();
  }

  enqueue(kind, input) {
    if (this.closed) throw new Error('Ingestion job runner is closed.');
    if (!['index', 'fetch'].includes(kind)) throw new Error('Unsupported ingestion job kind.');
    const job = this.store.createJob({ kind, input, sessionId: this.sessionId ?? null });
    this.schedule();
    return job;
  }

  status(id) { return this.store.getJob(id); }

  cancel(id) {
    this.controllers.get(id)?.abort();
    return this.store.cancelJob(id);
  }

  schedule() {
    if (this.closed || this.scheduled || this.running) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      if (this.closed) return;
      const pending = this.pump();
      this.pumpPromise = pending;
      const clearPending = () => {
        if (this.pumpPromise === pending) this.pumpPromise = undefined;
      };
      void pending.then(clearPending, clearPending);
    });
  }

  async close() {
    this.closed = true;
    for (const controller of this.controllers.values()) controller.abort();
    if (this.scheduled) await Promise.resolve();
    await this.pumpPromise;
  }

  async pump() {
    if (this.closed || this.running) return;
    this.running = true;
    try {
      for (;;) {
        if (this.closed) break;
        const job = this.store.claimNextJob();
        if (!job) break;
        const controller = new AbortController();
        this.controllers.set(job.id, controller);
        try {
          const value = job.kind === 'index'
            ? indexFile(this.store, { ...job.input, root: this.root }, job.sessionId ?? undefined, controller.signal)
            : await fetchAndIndex(this.store, job.input, job.sessionId ?? undefined, controller.signal, { renderer: this.renderer });
          const current = this.store.getJob(job.id);
          if (current?.state === 'running') this.store.finishJob(job.id, 'completed', value);
        } catch (error) {
          const current = this.store.getJob(job.id);
          if (current?.state === 'running') this.store.finishJob(job.id, controller.signal.aborted ? 'cancelled' : 'failed', error instanceof Error ? error.message : String(error));
        } finally { this.controllers.delete(job.id); }
        if (!this.closed) await new Promise((resolve) => setImmediate(resolve));
      }
    } finally { this.running = false; }
  }
}

export const INGESTION_JOB_LIMITS = Object.freeze({ maxPendingJobs: MAX_PENDING_JOBS, concurrency: 1 });
