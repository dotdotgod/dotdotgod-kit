import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxToolCall, type ToolCall } from "@earendil-works/pi-ai";
import { createAgentSession, createCodemodeExtension, createMcpExtension, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import contextTools from "../../extensions/context-tools/index.ts";
import { isMcpTool } from "../../extensions/shared/mcp.ts";

// Public SDK + deterministic stream: no model request, credentials, or ambient resources.
export async function workflowSession(extra?: ExtensionFactory, additionalExtensionPaths: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), "dotdotgod-workflow-"));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir);
  const hooks: Array<{ name: string; parent: string | undefined; phase: string }> = [];
  const structuredResults = new Map<string, unknown>();
  let shutdownMcp: ((event: any, ctx: any) => Promise<void>) | undefined;
  const mcp: ExtensionFactory = (pi) => createMcpExtension()({ ...pi, on: ((name: string, handler: any) => {
    if (name === "session_shutdown") shutdownMcp = handler;
    return (pi.on as any)(name, handler);
  }) as typeof pi.on });
  const settingsManager = SettingsManager.inMemory({ defaultTools: ["+codemode"], compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root, agentDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths,
    extensionFactories: [contextTools, mcp, createCodemodeExtension({ models: false }), (pi) => {
      pi.registerCommand("fixture-close-mcp", { description: "Fixture cleanup", handler: async (_args, ctx) => { await shutdownMcp?.({}, ctx); } });
      pi.on("tool_call", (event) => { hooks.push({ name: event.toolName, parent: event.parentToolCallId, phase: "call" }); });
      pi.on("tool_result", (event) => {
        hooks.push({ name: event.toolName, parent: event.parentToolCallId, phase: "result" });
        structuredResults.set(event.toolCallId, event.structuredContent);
      });
      pi.on("before_agent_start", () => {
        // Direct-call fixtures opt in to a discovered tool, not a native alias.
        if (requestedTool && isMcpTool(requestedTool)) pi.setActiveTools([...pi.getActiveTools(), requestedTool]);
      });
    }, ...(extra ? [extra] : [])],
  });
  const faux = createFauxCore({ models: [{ id: "workflow-fixture" }] });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await resourceLoader.reload();
    const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(agentDir, "models-cache.json"), refreshOnCreate: false });
    modelRuntime.registerProvider("faux", { baseUrl: "https://fixture.invalid", api: faux.api, apiKey: "fixture-only-not-a-credential", streamSimple: faux.streamSimple, models: [{ id: "workflow-fixture", name: "Workflow fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1000 }] });
    ({ session } = await createAgentSession({ cwd: root, agentDir, model: modelRuntime.getModel("faux", "workflow-fixture")!, modelRuntime, settingsManager, resourceLoader, sessionManager: SessionManager.inMemory(root) }));
    session.agent.streamFunction = faux.streamSimple;
    await session.bindExtensions({});
    assert.ok(session.getActiveToolNames().includes("codemode"));
  } catch (error) { session?.dispose(); rmSync(root, { recursive: true, force: true }); throw error; }
  const active = session;
  let requestedTool: string | undefined;
  async function call(name: string, args: ToolCall["arguments"] | string) {
    requestedTool = name;
    faux.setResponses([fauxAssistantMessage(fauxToolCall(name, typeof args === "string" ? { code: args } : args)), fauxAssistantMessage("fixture complete")]);
    await active.prompt("Run the deterministic fixture.");
    requestedTool = undefined;
    const message = [...active.messages].reverse().find((entry) => entry.role === "toolResult" && entry.toolName === name);
    assert.ok(message && message.role === "toolResult", `missing result for ${name}`);
    // Pi persists model text/details, not structuredContent, in transcript entries.
    // Preserve the actual tool_result payload separately for programmatic assertions.
    return { ...message, structuredContent: structuredResults.get(message.toolCallId) as any };
  }
  return {
    root, session: active, hooks, call,
    async close() {
      try {
        await active.prompt("/fixture-close-mcp");
      } finally { active.dispose(); rmSync(root, { recursive: true, force: true }); }
    },
  };
}

export function textContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.filter((entry) => entry.type === "text").map((entry) => entry.text).join("\n");
}
export const nodeCommand = (code: string) => ({ executable: process.execPath, args: ["-e", code], outputMode: "auto" });
export const fixtureOutput = "console.log('workflow-needle failure evidence'); console.log('padding '.repeat(8000));";
