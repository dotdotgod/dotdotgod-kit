export type ContextScope = 'transient' | 'session' | 'project';
export type DirectoryReason = 'excluded-path' | 'extension-filter' | 'file-byte-limit' | 'file-count-limit' | 'aggregate-byte-limit' | 'visited-entry-limit' | 'depth-limit' | 'file-symlink' | 'directory-symlink' | 'symlink-outside-root' | 'symlink-unresolvable' | 'special-file' | 'directory-read-failed' | 'entry-stat-failed' | 'index-failed';
export interface EnvironmentPolicy { mode: 'inherit-filtered-v1' | 'allowlist-v1'; platform: 'win32' | 'darwin' | 'posix'; allowedNames?: string[]; filteredNames: string[] }
export interface DirectoryManifestEntry { path: string; absolutePath: string; size: number; identity: { dev: number; ino: number; size: number; mtimeMs: number }; symlink: boolean }
export interface DirectoryManifest { root: string; directory: string; files: DirectoryManifestEntry[]; skipped: Array<{ path: string; reason: DirectoryReason }>; failed: Array<{ path: string; reason: DirectoryReason; error?: string }>; aborted: boolean; truncated: boolean; visitedEntries: number; aggregateBytes: number }
export interface HtmlNormalization { text: string; title: string | null; links: Array<{ text: string; href: string }>; extractor: 'html-v1'; fallbackReason: 'malformed-html' | null; mimeType: 'text/html' | 'application/xhtml+xml'; charset: 'utf-8' | 'us-ascii'; inputBytes: number; outputBytes: number; truncated: boolean }
export interface ExecutionInput { label?: string; command?: string; executable?: string; args?: string[]; shell?: boolean; cwd?: string; timeoutMs?: number; outputLimit?: number; directLimit?: number; outputMode?: 'auto' | 'direct' | 'indexed' | 'discard'; scope?: ContextScope; ttlMs?: number; env?: Record<string, string | null>; environmentMode?: 'inherit-filtered-v1' | 'allowlist-v1'; allowedEnv?: string[] }
export interface IndexInput { path: string; root?: string; source?: string; scope?: ContextScope; ttlMs?: number; maxBytes?: number; includeExtensions?: string[]; excludePaths?: string[]; followFileSymlinks?: boolean; maxDepth?: number; maxVisitedEntries?: number; maxFiles?: number; maxAggregateBytes?: number }
export interface FetchInput { url: string; source?: string; scope?: ContextScope; ttlMs?: number; timeoutMs?: number; maxBytes?: number; browser?: boolean }
export interface IngestionJob { id: string; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; kind: 'index' | 'fetch'; input: Record<string, unknown>; result: unknown; error: string | null; createdAt: number; updatedAt: number }
export interface DoctorResult { ok: boolean; status: 'OK' | 'WARN' | 'FAIL'; node: string; platform: string; root: string; dbPath: string; checks: Array<{ id: string; status: 'OK' | 'WARN' | 'FAIL'; message: string; details?: unknown }> }

export function contextDbPath(root?: string): string;
export class ContextStore {
  constructor(root?: string);
  root: string;
  path: string;
  close(): void;
  index(input: { id?: string; scope?: ContextScope; sessionId?: string | null; label?: string; kind?: string; text: string; metadata?: Record<string, unknown>; ttlMs?: number | null; provenance?: Record<string, unknown> }): Record<string, unknown>;
  search(input: { query: string; scope?: ContextScope; sessionId?: string; source?: string; limit?: number }): unknown[];
  stats(): { path: string; sources: number; chunks: number; byScope: Array<{ scope: ContextScope; count: number }> };
  purge(input: { scope?: ContextScope; sessionId?: string; sourceId?: string }): { removed: number };
  createJob(input: { id?: string; kind: 'index' | 'fetch'; input: Record<string, unknown> }): IngestionJob;
  getJob(id: string): IngestionJob | null;
  claimNextJob(): IngestionJob | null;
  finishJob(id: string, state: 'completed' | 'failed' | 'cancelled', value?: unknown): IngestionJob | null;
  cancelJob(id: string): { changed: number; job: IngestionJob | null };
  listPendingJobs(limit?: number): IngestionJob[];
}
export function healContextDatabase(root?: string): { ok: true; backupPath: string; fromVersion: number; toVersion: number; rebuilt: boolean };
export function validateSessionId(value: unknown): string;
export function resolveSessionId(value?: unknown): string;
export class IngestionJobRunner { sessionId?: string; constructor(store: ContextStore, options?: { sessionId?: string; renderer?: BrowserRenderer; root?: string }); enqueue(kind: 'index' | 'fetch', input: Record<string, unknown>): IngestionJob; status(id: string): IngestionJob | null; cancel(id: string): { changed: number; job: IngestionJob | null }; pump(): Promise<void> }
export type BrowserRenderer = (input: { url: string; signal?: AbortSignal; timeoutMs: number; maxBytes: number }) => Promise<{ body?: Buffer; text?: string; url?: string; contentType?: string; status?: number }>;
export const INGESTION_JOB_LIMITS: Readonly<{ maxPendingJobs: number; concurrency: 1 }>;
export function executeCommand(input: ExecutionInput, options?: { root?: string; store?: ContextStore; sessionId?: string; signal?: AbortSignal | undefined; env?: Record<string, string | undefined>; captureLimitBytes?: number }): Promise<Record<string, any>>;
export function executeBatch(input: { commands: ExecutionInput[]; concurrency?: number; cwd?: string; timeoutMs?: number }, options?: Record<string, any>): Promise<Record<string, any>>;
export function executeFile(input: ExecutionInput & { path: string; language: 'javascript' | 'python' | 'shell'; code: string }, options?: Record<string, any>): Promise<Record<string, any>>;
export function indexFile(store: ContextStore, input: IndexInput, sessionId?: string, signal?: AbortSignal): Record<string, any>;
export function fetchAndIndex(store: ContextStore, input: FetchInput, sessionId?: string, signal?: AbortSignal, capabilities?: { renderer?: BrowserRenderer }): Promise<Record<string, any>>;
export function composeEnvironment(input?: { inherited?: Record<string, string | undefined>; overrides?: Record<string, string | null>; platform?: string; mode?: 'inherit-filtered-v1' | 'allowlist-v1'; allow?: string[] }): { env: Record<string, string>; policy: EnvironmentPolicy };
export const DIRECTORY_INGESTION_LIMITS: Readonly<{ maxDepth: number; maxVisitedEntries: number; maxFiles: number; maxFileBytes: number; maxAggregateBytes: number }>;
export function walkDirectoryManifest(input: IndexInput & { signal?: AbortSignal }): DirectoryManifest;
export function verifyManifestFile(entry: DirectoryManifestEntry, root: string): string;
export function readManifestFile(entry: DirectoryManifestEntry, root: string, maxBytes?: number): Buffer;
export function normalizeHtml(value: unknown, options?: { contentType?: string; maxInputBytes?: number; maxOutputBytes?: number }): HtmlNormalization;
export function runDoctor(input?: { root?: string; dbPath?: string; stats?: Record<string, unknown>; fetchPolicy?: { mode?: string; encodings?: string[] } }): DoctorResult;
export function projectLoad(input: Record<string, any>): Promise<Record<string, any>>;
export function projectImpact(input: Record<string, any>): Promise<Record<string, any>>;
export function projectInitialize(input: Record<string, any>): Promise<Record<string, any>>;
export function startServer(): Promise<void>;
