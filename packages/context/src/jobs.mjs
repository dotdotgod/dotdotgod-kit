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
    this.controllers = new Map();
    this.schedule();
  }

  enqueue(kind, input) {
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
    if (this.scheduled || this.running) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; void this.pump(); });
  }

  async pump() {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
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
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally { this.running = false; }
  }
}

export const INGESTION_JOB_LIMITS = Object.freeze({ maxPendingJobs: MAX_PENDING_JOBS, concurrency: 1 });
