import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ContextStore } from './store.mjs';
import { executeBatch, executeCommand, executeFile } from './execute.mjs';
import { fetchAndIndex, indexFile } from './content.mjs';
import { projectImpact, projectInitialize, projectLoad } from './project.mjs';
import { resolveWithinRoot } from './paths.mjs';

const root = process.env.DOTDOTGOD_PROJECT_ROOT || process.cwd();
const sessionId = process.env.DOTDOTGOD_SESSION_ID || crypto.randomUUID();
const store = new ContextStore(root);
const server = new McpServer({ name: 'dotdotgod-context', version: '0.2.23' });

const scopeSchema = z.enum(['transient', 'session', 'project']).optional();
const outputModeSchema = z.enum(['auto', 'direct', 'indexed', 'discard']).optional();
const commandSchema = {
  label: z.string().optional(), command: z.string().optional(), executable: z.string().optional(), args: z.array(z.string()).optional(),
  shell: z.boolean().optional(), cwd: z.string().optional(), timeoutMs: z.number().int().positive().optional(), outputLimit: z.number().int().positive().optional(),
  directLimit: z.number().int().positive().optional(), outputMode: outputModeSchema, scope: scopeSchema, ttlMs: z.number().int().nonnegative().optional(),
};

function success(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}
function failure(error) {
  const value = { ok: false, error: error instanceof Error ? error.message : String(error) };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(value, null, 2) }], structuredContent: value };
}
function projectInput(input) {
  return { ...input, root: resolveWithinRoot(root, input.root || '.') };
}
function register(name, description, inputSchema, handler, annotations) {
  server.registerTool(name, { description, inputSchema, annotations }, async (input, extra) => {
    try { return success(await handler(input, extra)); } catch (error) { return failure(error); }
  });
}

register('execute', 'Run one local command while keeping large stdout/stderr outside model context.', commandSchema,
  (input, extra) => executeCommand(input, { root, store, sessionId, signal: extra.signal }), { openWorldHint: true, destructiveHint: true });
register('batch_execute', 'Run labeled local commands sequentially or with bounded concurrency and index large outputs.', {
  commands: z.array(z.object(commandSchema)).min(1).max(100), concurrency: z.number().int().min(1).max(8).optional(), cwd: z.string().optional(), timeoutMs: z.number().int().positive().optional(),
}, (input, extra) => executeBatch(input, { root, store, sessionId, signal: extra.signal }), { openWorldHint: true, destructiveHint: true });
register('execute_file', 'Process a local file in an isolated child process; only bounded stdout/stderr is returned.', {
  path: z.string(), language: z.enum(['javascript', 'python', 'shell']).default('javascript'), code: z.string(), ...commandSchema,
}, (input, extra) => executeFile(input, { root, store, sessionId, signal: extra.signal }), { openWorldHint: false, destructiveHint: true });
register('index', 'Index a local text file into the project-local FTS5 store without returning its raw bytes.', {
  path: z.string(), root: z.string().optional(), source: z.string().optional(), scope: scopeSchema, ttlMs: z.number().int().nonnegative().optional(), maxBytes: z.number().int().positive().optional(),
}, (input) => ({ ok: true, ...indexFile(store, { ...input, root }, sessionId) }), { readOnlyHint: true });
register('search', 'Search indexed command, file, and fetched content and return bounded excerpts.', {
  query: z.string().min(1), scope: scopeSchema, source: z.string().optional(), limit: z.number().int().min(1).max(50).optional(), sessionOnly: z.boolean().optional(),
}, (input) => ({ ok: true, results: store.search({ ...input, sessionId: input.sessionOnly ? sessionId : undefined }) }), { readOnlyHint: true });
register('fetch_and_index', 'Fetch an HTTP(S) URL locally, index bounded text, and return metadata only.', {
  url: z.string().url(), source: z.string().optional(), scope: scopeSchema, ttlMs: z.number().int().nonnegative().optional(), timeoutMs: z.number().int().positive().optional(), maxBytes: z.number().int().positive().optional(),
}, (input) => fetchAndIndex(store, input, sessionId).then((value) => ({ ok: true, ...value })), { openWorldHint: true, readOnlyHint: true });
register('stats', 'Report local context store counts and location.', {}, () => ({ ok: true, sessionId, ...store.stats() }), { readOnlyHint: true });
register('doctor', 'Check local Node.js, SQLite FTS5, project storage, and MCP runtime readiness.', {}, () => ({ ok: true, node: process.version, platform: process.platform, root, sessionId, store: store.stats() }), { readOnlyHint: true });
register('purge', 'Permanently delete one explicit context scope, session, or source.', {
  confirm: z.literal(true), scope: scopeSchema, sessionId: z.string().optional(), sourceId: z.string().optional(),
}, (input) => ({ ok: true, ...store.purge(input) }), { destructiveHint: true });
register('dotdotgod_project_load', 'Load a bounded documentation map and optional semantic project query.', {
  root: z.string().optional(), focus: z.string().max(500).optional(), limit: z.number().int().min(1).max(30).optional(), maxDepth: z.number().int().min(1).max(5).optional(),
}, (input) => projectLoad(projectInput(input)), { readOnlyHint: true });
register('dotdotgod_project_impact', 'Run bounded graph impact for up to 20 changed paths.', {
  root: z.string().optional(), paths: z.array(z.string()).min(1).max(20),
}, (input) => projectImpact(projectInput(input)), { readOnlyHint: true });
register('dotdotgod_project_initialize', 'Initialize project memory; dry-run is default and writes require explicit confirmation.', {
  root: z.string().optional(), dryRun: z.boolean().optional(), confirmWrite: z.boolean().optional(), projectName: z.string().optional(), template: z.string().optional(), dotdotSetting: z.boolean().optional(),
}, (input) => projectInitialize(projectInput(input)), { destructiveHint: true });

export async function startServer() {
  await server.connect(new StdioServerTransport());
}
