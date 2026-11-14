import { createBashToolDefinition, createReadToolDefinition, createEditToolDefinition, createWriteToolDefinition, createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition, type ExtensionAPI, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { connectChild, type ChildClient } from "./client.ts";
import type { Json } from "./channel.ts";
import { classifyPlanCommand } from "../tools.ts";
import { canonicalPath, markdownDecision } from "../policy/markdown.ts";
import { environmentFingerprint, resolveInvocation } from "../policy/invocation.ts";
import { guardGit } from "../policy/execution.ts";
import type { PlanPolicy } from "../policy/storage.ts";

const NATIVE = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const DENIED = "Inherited planning child: parent authority unavailable or operation denied.";

export default function bootstrap(pi: ExtensionAPI) {
  let client: ChildClient | undefined;
  let started = false;
  let detachAbort: (() => void) | undefined;
  pi.registerFlag("dd-plan", { type: "boolean", description: "Required inherited planning mode", default: true });
  pi.registerFlag("dd-plan-parent", { type: "string", description: "Private parent credential locator" });
  // Install before asynchronous startup; these handlers also guard nested calls.
  pi.on("user_bash", async () => ({ result: { output: DENIED, exitCode: 1, cancelled: false, truncated: false } }));
  pi.on("session_before_switch", () => ({ cancel: true }));
  pi.on("session_before_fork", () => ({ cancel: true }));
  pi.on("session_before_tree", () => ({ cancel: true }));
  pi.registerCommand("dd:plan", { description: "Inherited mode cannot be disabled", handler: async (_args, ctx) => { ctx.ui.notify("Inherited planning mode cannot be disabled.", "warning"); } });
  pi.on("tool_call", async (event, ctx) => {
    const current = client;
    if (!current || current.signal.aborted || !NATIVE.includes(event.toolName)) return { block: true, reason: DENIED };
    try {
      const input = event.input as Record<string, Json>;
      let invocation: ReturnType<typeof resolveInvocation> | undefined;
      let target: string | undefined;
      const write = event.toolName === "edit" || event.toolName === "write";
      if (event.toolName === "bash") {
        if (typeof input.command !== "string" || classifyPlanCommand(input.command).kind === "deny") return { block: true, reason: DENIED };
        invocation = resolveInvocation({ command: input.command }, ctx.cwd);
      }
      if (write) {
        if (typeof input.path !== "string") return { block: true, reason: DENIED };
        const ceiling = current.policy.ceiling as { policies: PlanPolicy[]; roots: string[] };
        if (!Array.isArray(ceiling?.policies) || !Array.isArray(ceiling.roots)) return { block: true, reason: DENIED };
        const markdown = { allow: ceiling.policies.flatMap((policy) => policy.markdown.allow), deny: ceiling.policies.flatMap((policy) => policy.markdown.deny) };
        if (markdownDecision(ctx.cwd, input.path, ceiling.roots, { markdown } as PlanPolicy) !== "allow") return { block: true, reason: DENIED };
        target = canonicalPath(ctx.cwd, input.path);
      }
      const normalized = { ...input, ...(target ? { path: target } : {}) };
      const decision = await current.authorize({ toolName: event.toolName, input: normalized, ...(invocation ? { invocation: { ...invocation } } : {}) });
      if (!decision.allow || current.signal.aborted || current !== client) return { block: true, reason: DENIED };
      if (target) {
        if (canonicalPath(ctx.cwd, input.path as string) !== target) return { block: true, reason: "Write target changed during authorization." };
        input.path = target;
      }
      if (invocation) {
        const rechecked = resolveInvocation({ command: input.command as string }, ctx.cwd);
        if (JSON.stringify(rechecked) !== JSON.stringify(invocation)) return { block: true, reason: "Execution context changed during authorization." };
        input.command = guardGit(invocation).command;
      }
    } catch (error) { return { block: true, reason: error instanceof Error ? error.message : DENIED }; }
  });
  const factories = [createReadToolDefinition, createGrepToolDefinition, createFindToolDefinition, createLsToolDefinition, createEditToolDefinition, createWriteToolDefinition,
    (cwd: string) => createBashToolDefinition(cwd, { exposeSessionEnvironment: false, spawnHook: (context) => ({ ...context, env: { ...process.env } }) })];
  for (const factory of factories) {
    const definition: ToolDefinition = factory(process.cwd()) as ToolDefinition;
    pi.registerTool({ ...definition, execute: (id, args, signal, update, ctx) => (factory(ctx.cwd) as ToolDefinition).execute(id, args, signal, update, ctx) });
  }
  pi.on("session_start", async (event, ctx) => {
    pi.setActiveTools([]);
    if (started || event.reason !== "startup") { client?.close("Session replaced"); return; }
    started = true;
    const locator = pi.getFlag("dd-plan-parent");
    if (typeof locator !== "string" || !process.env.HC_TERMINAL_ID || pi.getFlag("dd-plan") === false) return;
    try {
      const connected = await connectChild({ locator, terminalId: process.env.HC_TERMINAL_ID, sessionId: ctx.sessionManager.getSessionId() });
      client = connected;
      const aborted = () => {
        // A disposed/replaced host context is already inactive.
        try { pi.setActiveTools([]); ctx.abort(); } catch { /* Host has ended this runtime. */ }
      };
      connected.signal.addEventListener("abort", aborted, { once: true });
      detachAbort = () => connected.signal.removeEventListener("abort", aborted);
      pi.setActiveTools(NATIVE);
      await connected.acknowledgeReady(environmentFingerprint(process.env));
      if (connected.signal.aborted) { pi.setActiveTools([]); await ctx.abort(); }
    } catch { client?.close("Bootstrap initialization failed"); client = undefined; pi.setActiveTools([]); await ctx.abort(); }
  });
  pi.on("session_shutdown", (event, ctx) => { detachAbort?.(); detachAbort = undefined; client?.close(`Session shutdown: ${event.reason}`); client = undefined; ctx.abort(); });
}
