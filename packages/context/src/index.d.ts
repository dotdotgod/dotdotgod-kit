export class ContextStore {
  constructor(root?: string);
  root: string;
  path: string;
  close(): void;
  index(input: Record<string, unknown>): Record<string, unknown>;
  search(input: Record<string, unknown>): unknown[];
  stats(): Record<string, unknown>;
  purge(input: Record<string, unknown>): Record<string, unknown>;
}
export function executeCommand(input: Record<string, any>, options?: Record<string, any>): Promise<Record<string, any>>;
export function executeBatch(input: Record<string, any>, options?: Record<string, any>): Promise<Record<string, any>>;
export function executeFile(input: Record<string, any>, options?: Record<string, any>): Promise<Record<string, any>>;
export function indexFile(store: ContextStore, input: Record<string, any>, sessionId?: string): Record<string, any>;
export function fetchAndIndex(store: ContextStore, input: Record<string, any>, sessionId?: string, signal?: AbortSignal): Promise<Record<string, any>>;
export function runDoctor(input?: Record<string, any>): Record<string, any>;
export function projectLoad(input: Record<string, any>): Promise<Record<string, any>>;
export function projectImpact(input: Record<string, any>): Promise<Record<string, any>>;
export function projectInitialize(input: Record<string, any>): Promise<Record<string, any>>;
export function startServer(): Promise<void>;
