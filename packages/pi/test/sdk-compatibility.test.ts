import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFauxCore } from "@earendil-works/pi-ai";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";

test("Pi 1.0 public loader starts existing plan/project-memory extensions", async () => {
  const root = mkdtempSync(join(tmpdir(), "dotdotgod-sdk-upgrade-"));
  const agentDir = join(root, "agent");
  mkdirSync(agentDir);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: root, agentDir, settingsManager, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    additionalExtensionPaths: ["plan-mode", "project-memory"].map((name) => new URL(`../extensions/${name}/index.ts`, import.meta.url).pathname),
  });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await resourceLoader.reload();
    assert.deepEqual(resourceLoader.getExtensions().errors, []);
    const modelRuntime = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: null, modelsStorePath: join(agentDir, "models-cache.json"), refreshOnCreate: false });
    const faux = createFauxCore({ models: [{ id: "sdk-compatibility-fixture" }] });
    modelRuntime.registerProvider("faux", { baseUrl: "https://fixture.invalid", api: faux.api, apiKey: "fixture-only", streamSimple: faux.streamSimple, models: [{ id: "sdk-compatibility-fixture", name: "SDK fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200000, maxTokens: 1000 }] });
    ({ session } = await createAgentSession({ cwd: root, agentDir, model: modelRuntime.getModel("faux", "sdk-compatibility-fixture")!, modelRuntime, resourceLoader, settingsManager, sessionManager: SessionManager.inMemory(root) }));
    session.agent.streamFunction = faux.streamSimple;
    const errors: unknown[] = [];
    await session.bindExtensions({ onError: (error) => { errors.push(error); } });
    assert.deepEqual(errors, []);
    const names = session.getAllTools().map((tool) => tool.name);
    assert.ok(names.includes("project_memory_load"));
    assert.ok(names.every(name => !name.startsWith("dotdotgod_")));
    assert.equal(names.includes("subagent"), false);
  } finally { session?.dispose(); rmSync(root, { recursive: true, force: true }); }
});
