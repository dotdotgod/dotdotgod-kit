export function formatToolMarkdown(name: string, value: unknown): string;
export type ContextScope = 'transient' | 'session' | 'project';
export type DirectoryReason = 'excluded-path' | 'extension-filter' | 'file-byte-limit' | 'file-count-limit' | 'aggregate-byte-limit' | 'visited-entry-limit' | 'depth-limit' | 'file-symlink' | 'directory-symlink' | 'symlink-unresolvable' | 'special-file' | 'directory-read-failed' | 'entry-stat-failed' | 'index-failed';
export interface EnvironmentPolicy { mode: 'inherit-filtered-v1' | 'allowlist-v1'; platform: 'win32' | 'darwin' | 'posix'; allowedNames?: string[]; filteredNames: string[] }
export interface DirectoryManifestEntry { path: string; absolutePath: string; size: number; identity: { dev: number; ino: number; size: number; mtimeMs: number }; symlink: boolean }
export interface DirectoryManifest { root: string; directory: string; files: DirectoryManifestEntry[]; skipped: Array<{ path: string; reason: DirectoryReason }>; failed: Array<{ path: string; reason: DirectoryReason; error?: string }>; aborted: boolean; truncated: boolean; visitedEntries: number; aggregateBytes: number }
export interface HtmlNormalization { text: string; title: string | null; links: Array<{ text: string; href: string }>; extractor: 'html-v1'; fallbackReason: 'malformed-html' | null; mimeType: 'text/html' | 'application/xhtml+xml'; charset: 'utf-8' | 'us-ascii'; inputBytes: number; outputBytes: number; truncated: boolean }
export interface ExecutionInput { label?: string; command?: string; executable?: string; args?: string[]; shell?: boolean; cwd?: string; timeoutMs?: number; outputLimit?: number; directLimit?: number; outputMode?: 'auto' | 'direct' | 'indexed' | 'discard'; scope?: ContextScope; env?: Record<string, string | null>; environmentMode?: 'inherit-filtered-v1' | 'allowlist-v1'; allowedEnv?: string[] }
export interface IndexInput { path: string; root?: string; source?: string; scope?: ContextScope; maxBytes?: number; includeExtensions?: string[]; excludePaths?: string[]; followFileSymlinks?: boolean; maxDepth?: number; maxVisitedEntries?: number; maxFiles?: number; maxAggregateBytes?: number }
export interface FetchInput { url: string; source?: string; scope?: ContextScope; timeoutMs?: number; maxBytes?: number; browser?: boolean }
export interface IndexResult { id: string; chunks: number; bytes: number; scope: ContextScope; expiresAt: number }
export interface FetchResult extends IndexResult {}
export interface IngestionJob { id: string; state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; kind: 'index' | 'fetch'; input: Record<string, unknown>; sessionId: string | null; result: unknown; error: string | null; createdAt: number; updatedAt: number; expiresAt: number }
export interface DoctorResult { ok: boolean; status: 'OK' | 'WARN' | 'FAIL'; node: string; platform: string; root: string; dbPath: string; checks: Array<{ id: string; status: 'OK' | 'WARN' | 'FAIL'; message: string; details?: unknown }> }

export function contextDbPath(root?: string): string;
export class ContextStore {
  constructor(root?: string);
  root: string;
  path: string;
  close(): void;
  index(input: { id?: string; scope?: ContextScope; sessionId?: string | null; label?: string; kind?: string; text: string; metadata?: Record<string, unknown>; provenance?: Record<string, unknown> }): Record<string, unknown>;
  search(input: { query: string; scope?: ContextScope; sessionId?: string; source?: string; limit?: number }): unknown[];
  stats(): { path: string; sources: number; chunks: number; byScope: Array<{ scope: ContextScope; count: number }> };
  purge(input: { scope?: ContextScope; sessionId?: string; sourceId?: string }): { removed: number };
  createJob(input: { id?: string; kind: 'index' | 'fetch'; input: Record<string, unknown>; sessionId?: string | null }): IngestionJob;
  getJob(id: string): IngestionJob | null;
  claimNextJob(): IngestionJob | null;
  finishJob(id: string, state: 'completed' | 'failed' | 'cancelled', value?: unknown): IngestionJob | null;
  cancelJob(id: string): { changed: number; job: IngestionJob | null };
  listPendingJobs(limit?: number): IngestionJob[];
}
export function healContextDatabase(root?: string): { ok: true; backupPath: string; fromVersion: number; toVersion: number; rebuilt: true };
export function validateSessionId(value: unknown): string;
export function resolveSessionId(value?: unknown): string;
export class IngestionJobRunner { sessionId?: string; constructor(store: ContextStore, options?: { sessionId?: string; renderer?: BrowserRenderer; root?: string }); enqueue(kind: 'index' | 'fetch', input: Record<string, unknown>): IngestionJob; status(id: string): IngestionJob | null; cancel(id: string): { changed: number; job: IngestionJob | null }; close(): Promise<void>; pump(): Promise<void> }
export interface BrowserRendererResult { body?: Buffer; text?: string; url?: string; contentType?: string; status?: number }
export type BrowserRenderer = (input: Readonly<{ url: string; signal: AbortSignal; timeoutMs: number; maxBytes: number }>) => Promise<BrowserRendererResult>;
export const INGESTION_JOB_LIMITS: Readonly<{ maxPendingJobs: number; concurrency: 1 }>;
export const PHASE3_TOOL_INPUT_SCHEMAS: Readonly<Record<'session_resume' | 'ingestion_job_start' | 'ingestion_job_status' | 'ingestion_job_cancel' | 'context_heal', Readonly<Record<string, unknown>>>>;
export function executeCommand(input: ExecutionInput, options?: { root?: string; store?: ContextStore; sessionId?: string; signal?: AbortSignal | undefined; env?: Record<string, string | undefined>; captureLimitBytes?: number }): Promise<Record<string, any>>;
export function executeBatch(input: { commands: ExecutionInput[]; concurrency?: number; cwd?: string; timeoutMs?: number }, options?: Record<string, any>): Promise<Record<string, any>>;
export function executeFile(input: ExecutionInput & { path: string; language: 'javascript' | 'python' | 'shell'; code: string }, options?: Record<string, any>): Promise<Record<string, any>>;
export function indexFile(store: ContextStore, input: IndexInput, sessionId?: string, signal?: AbortSignal): IndexResult | (Record<string, unknown> & { indexed: IndexResult[] });
export function fetchAndIndex(store: ContextStore, input: FetchInput, sessionId?: string, signal?: AbortSignal, capabilities?: { renderer?: BrowserRenderer }): Promise<FetchResult>;
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
export interface ImpactSnapshot { path: string; revision: string; fingerprint: string | null }
export interface ImpactStatus { ok: true; count: number; pending: Array<{ path: string }>; truncated: boolean; sessionBound?: boolean; guidance?: string }
export class ImpactState {
  constructor(root: string, sessionId: string);
  mark(paths: string[]): { becameNonEmpty: boolean };
  snapshot(paths?: string[]): ImpactSnapshot[];
  complete(snapshot: ImpactSnapshot[]): void;
  clearPaths(paths: string[]): number;
  claimUnnotified(limit?: number): ImpactStatus;
  recordPlanNotice(fingerprint: string): void;
  claimPlanNotice(): boolean;
  clearPlanNotice(): boolean;
  status(limit?: number): ImpactStatus;
}
export function resolveDocumentationRoot(root: string): string;
export function sanitizeDisplayPath(path: string): string;
export function impactReminder(status: ImpactStatus): string | undefined;
export function impactPath(root: string, path: string, docRoot?: string): string | undefined;
export function impactFingerprint(root: string, path: string): string | undefined;
export function withImpactReview<T extends { ok?: boolean }>(root: string, sessionId: string, paths: string[], review: () => Promise<T>, signal?: AbortSignal): Promise<T & { checked: string[]; impactStatus: ImpactStatus }>;
export function parseHookInput(raw?: string): Record<string, unknown>;
export function extractHookSessionId(input: Record<string, unknown>): string | null;
export function isInitializedProject(dir: string): boolean;
export function findInitializedRoot(startDir: string): string | null;
export function selectWorkspaceForPath(workspaces: string[], targetPath: string): string | null;
export function parseApplyPatchPaths(patchText: string): string[];
export function isDotdotgodMcpTool(name: string, suffix: string, prefixes: string[]): boolean;
export function hasFailedToolResult(input: Record<string, unknown>): boolean;
export function readArtifactBounded(artifactDir: string, fileName?: string, maxBytes?: number): Buffer | null;
export function formatHookError(error: unknown): string;
export function runHookSafely(fn: () => unknown): void;
