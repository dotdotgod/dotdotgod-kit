import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createParentRegistry } from "../extensions/plan-mode/children/parent.ts";
import bootstrap from "../extensions/plan-mode/children/bootstrap.ts";

test("bootstrap installs synchronous fail-closed gates without a parent", async () => {
  const handlers = new Map<string, Function>();
  const commands = new Map<string, any>();
  bootstrap({ on: (name: string, handler: Function) => handlers.set(name, handler), registerFlag() {}, registerCommand: (name: string, command: any) => commands.set(name, command), registerTool() {}, getFlag: () => undefined, setActiveTools() {} } as any);
  const ctx = { abort: async () => {}, ui: { notify() {} } };
  assert.equal((await handlers.get("tool_call")!({ toolName: "read", input: { path: "x" } }, ctx)).block, true);
  assert.equal(handlers.get("session_before_switch")!({}, ctx).cancel, true);
  assert.equal(handlers.get("session_before_fork")!({}, ctx).cancel, true);
  assert.equal(handlers.get("session_before_tree")!({}, ctx).cancel, true);
  assert.ok(await handlers.get("user_bash")!({}, ctx));
  await handlers.get("session_start")!({ reason: "startup" }, ctx);
  assert.equal((await handlers.get("tool_call")!({ toolName: "unknown", input: {} }, ctx)).block, true);
  assert.ok(commands.has("dd:plan"));
});

test("public SDK child authorizes native tools, rejects hard denies and revokes on shutdown", async () => {
  const root = mkdtempSync(join(tmpdir(), "dd-bootstrap-"));
  const operations: any[] = [];
  const registry = createParentRegistry({ parentSessionId: "p", authorize: (_binding, operation) => { operations.push(operation); return { allow: true, reasonCode: "fixture" }; } });
  const launch = await registry.createPendingLaunch({ root, policyGeneration: 1, ceiling: { policies: [{ markdown: { allow: [], deny: [] } }, { markdown: { allow: ["notes/**"], deny: ["plans/PRIVATE.md"] } }], roots: ["plans/**"] } });
  launch.attachTerminal("fixture-terminal");
  const oldTerminal = process.env.HC_TERMINAL_ID;
  process.env.HC_TERMINAL_ID = "fixture-terminal";
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, extensionFactories: [(pi) => bootstrap({ ...pi, getFlag: (name) => name === "dd-plan-parent" ? launch.credentialLocator : true })] });
  const faux = createFauxCore({ models: [{ id: "child" }] });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await loader.reload();
    const runtime = await ModelRuntime.create({ authPath: join(root, "auth.json"), modelsPath: null, modelsStorePath: join(root, "models.json"), refreshOnCreate: false });
    runtime.registerProvider("faux", { baseUrl: "https://fixture.invalid", api: faux.api, apiKey: "fixture", streamSimple: faux.streamSimple, models: [{ id: "child", name: "Child", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1000 }] });
    ({ session } = await createAgentSession({ cwd: root, agentDir: root, model: runtime.getModel("faux", "child")!, modelRuntime: runtime, settingsManager, resourceLoader: loader, sessionManager: SessionManager.inMemory(root), noTools: "builtin" }));
    session.agent.streamFunction = faux.streamSimple;
    await session.bindExtensions({});
    await launch.waitReady();
    assert.deepEqual(session.getActiveToolNames().sort(), ["bash", "edit", "find", "grep", "ls", "read", "write"]);
    async function call(name: string, input: Record<string, import("../extensions/plan-mode/children/channel.ts").Json>) {
      faux.setResponses([fauxAssistantMessage(fauxToolCall(name, input)), fauxAssistantMessage("done")]);
      await session!.prompt("fixture");
      return [...session!.messages].reverse().find((message) => message.role === "toolResult");
    }
    writeFileSync(join(root, "hello.txt"), "hello");
    await call("read", { path: "hello.txt" });
    assert.equal(operations.at(-1).toolName, "read");
    await call("bash", { command: "pwd" });
    assert.ok(operations.at(-1).invocation.executable.startsWith("/"));
    const count = operations.length;
    await call("bash", { command: "touch forbidden" });
    await call("write", { path: "source.ts", content: "bad" });
    assert.equal(operations.length, count);
    await call("write", { path: "plans/PLAN.md", content: "plan" });
    assert.equal(readFileSync(join(root, "plans/PLAN.md"), "utf8"), "plan");
    assert.equal(operations.at(-1).input.path, join(realpathSync(root), "plans/PLAN.md"));
    await call("write", { path: "notes/NOTE.md", content: "note" });
    assert.equal(readFileSync(join(root, "notes/NOTE.md"), "utf8"), "note");
    const writes = operations.length;
    await call("write", { path: "plans/PRIVATE.md", content: "denied" });
    assert.equal(operations.length, writes);
    await launch.revoke("fixture-end");
    assert.equal(launch.signal.aborted, true);
  } finally {
    session?.dispose(); await registry.close();
    if (oldTerminal === undefined) delete process.env.HC_TERMINAL_ID; else process.env.HC_TERMINAL_ID = oldTerminal;
    rmSync(root, { recursive: true, force: true });
  }
});
