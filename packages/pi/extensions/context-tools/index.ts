import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  ContextStore,
  executeBatch,
  executeCommand,
  executeFile,
  fetchAndIndex,
  indexFile,
  projectInitialize,
} from "@dotdotgod/context";

const stores = new Map<string, ContextStore>();
const sessionId = crypto.randomUUID();

function storeFor(root: string): ContextStore {
  let store = stores.get(root);
  if (!store) { store = new ContextStore(root); stores.set(root, store); }
  return store;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], details: value };
}

const Command = Type.Object({
  label: Type.Optional(Type.String()), command: Type.Optional(Type.String()), executable: Type.Optional(Type.String()), args: Type.Optional(Type.Array(Type.String())),
  shell: Type.Optional(Type.Boolean()), cwd: Type.Optional(Type.String()), timeoutMs: Type.Optional(Type.Number()), outputLimit: Type.Optional(Type.Number()),
  directLimit: Type.Optional(Type.Number()), outputMode: Type.Optional(Type.Union([Type.Literal("auto"), Type.Literal("direct"), Type.Literal("indexed"), Type.Literal("discard")])),
  scope: Type.Optional(Type.Union([Type.Literal("transient"), Type.Literal("session"), Type.Literal("project")])), ttlMs: Type.Optional(Type.Number()),
});

export default function contextTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "dotdotgod_execute", label: "dotdotgod execute", description: "Run one command while keeping large stdout/stderr outside model context.", parameters: Command,
    async execute(_id, params, signal, _update, ctx) { const store = storeFor(ctx.cwd); return result(await executeCommand(params, { root: ctx.cwd, store, sessionId, signal })); },
  });
  pi.registerTool({
    name: "dotdotgod_batch_execute", label: "dotdotgod batch execute", description: "Run labeled commands with bounded concurrency and index large outputs.",
    parameters: Type.Object({ commands: Type.Array(Command, { minItems: 1, maxItems: 100 }), concurrency: Type.Optional(Type.Number()), cwd: Type.Optional(Type.String()), timeoutMs: Type.Optional(Type.Number()) }),
    async execute(_id, params, signal, _update, ctx) { const store = storeFor(ctx.cwd); return result(await executeBatch(params, { root: ctx.cwd, store, sessionId, signal })); },
  });
  pi.registerTool({
    name: "dotdotgod_execute_file", label: "dotdotgod execute file", description: "Process a local file in a child runtime; only bounded stdout/stderr enters context.",
    parameters: Type.Intersect([Command, Type.Object({ path: Type.String(), language: Type.Union([Type.Literal("javascript"), Type.Literal("python"), Type.Literal("shell")]), code: Type.String() })]),
    async execute(_id, params, signal, _update, ctx) { const store = storeFor(ctx.cwd); return result(await executeFile(params, { root: ctx.cwd, store, sessionId, signal })); },
  });
  pi.registerTool({
    name: "dotdotgod_context_index", label: "dotdotgod context index", description: "Index a local text file without returning its raw bytes.",
    parameters: Type.Object({ path: Type.String(), source: Type.Optional(Type.String()), scope: Type.Optional(Type.String()), ttlMs: Type.Optional(Type.Number()), maxBytes: Type.Optional(Type.Number()) }),
    async execute(_id, params, _signal, _update, ctx) { return result({ ok: true, ...indexFile(storeFor(ctx.cwd), { ...params, root: ctx.cwd }, sessionId) }); },
  });
  pi.registerTool({
    name: "dotdotgod_context_search", label: "dotdotgod context search", description: "Search indexed command, file, and fetched content with bounded excerpts.",
    parameters: Type.Object({ query: Type.String(), scope: Type.Optional(Type.String()), source: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()), sessionOnly: Type.Optional(Type.Boolean()) }),
    async execute(_id, params, _signal, _update, ctx) { return result({ ok: true, results: storeFor(ctx.cwd).search({ ...params, sessionId: params.sessionOnly ? sessionId : undefined }) }); },
  });
  pi.registerTool({
    name: "dotdotgod_fetch_and_index", label: "dotdotgod fetch and index", description: "Fetch and locally index a bounded HTTP(S) resource.",
    parameters: Type.Object({ url: Type.String(), source: Type.Optional(Type.String()), scope: Type.Optional(Type.String()), ttlMs: Type.Optional(Type.Number()), timeoutMs: Type.Optional(Type.Number()), maxBytes: Type.Optional(Type.Number()) }),
    async execute(_id, params, _signal, _update, ctx) { return result({ ok: true, ...await fetchAndIndex(storeFor(ctx.cwd), params, sessionId) }); },
  });
  pi.registerTool({
    name: "dotdotgod_context_stats", label: "dotdotgod context stats", description: "Report project-local context store statistics.", parameters: Type.Object({}),
    async execute(_id, _params, _signal, _update, ctx) { return result({ ok: true, sessionId, ...storeFor(ctx.cwd).stats() }); },
  });
  pi.registerTool({
    name: "dotdotgod_context_purge", label: "dotdotgod context purge", description: "Permanently delete one explicitly selected context scope, session, or source.",
    parameters: Type.Object({ confirm: Type.Literal(true), scope: Type.Optional(Type.String()), sessionId: Type.Optional(Type.String()), sourceId: Type.Optional(Type.String()) }),
    async execute(_id, params, _signal, _update, ctx) { return result({ ok: true, ...storeFor(ctx.cwd).purge(params) }); },
  });
  pi.registerTool({
    name: "dotdotgod_project_initialize", label: "dotdotgod project initialize", description: "Initialize project memory; defaults to dry-run and requires confirmation for writes.",
    parameters: Type.Object({ root: Type.Optional(Type.String()), dryRun: Type.Optional(Type.Boolean()), confirmWrite: Type.Optional(Type.Boolean()), projectName: Type.Optional(Type.String()), template: Type.Optional(Type.String()), dotdotSetting: Type.Optional(Type.Boolean()) }),
    async execute(_id, params, _signal, _update, ctx) { return result(await projectInitialize({ ...params, root: params.root ?? ctx.cwd })); },
  });
}
