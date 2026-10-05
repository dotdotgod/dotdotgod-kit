import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { ContextOrchestrationController } from "../extensions/plan-mode/controllers/context-orchestration.ts";
import { ContextShapingController } from "../extensions/plan-mode/controllers/context-shaping.ts";
import { ModeLifecycleController } from "../extensions/plan-mode/controllers/mode-lifecycle.ts";
import { PlanArtifactController } from "../extensions/plan-mode/controllers/plan-artifact.ts";

test("planning advisory runs impact/expansion once without validation or compaction, and degrades safely", () => {
  const root = mkdtempSync(join(tmpdir(), "planning-context-"));
  const originalPath = process.env.PATH;
  try {
    writeFileSync(join(root, "dotdotgod"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    process.env.PATH = root;
    mkdirSync(join(root, "packages/cli/bin"), { recursive: true });
    mkdirSync(join(root, "docs/spec"), { recursive: true });
    writeFileSync(join(root, "docs/spec/API.md"), "# API\n");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/app.ts"), "export const value = 1;\n");
    const cli = join(root, "packages/cli/bin/dotdotgod.mjs");
    writeFileSync(cli, `import { appendFileSync } from 'node:fs';
appendFileSync('calls.log', JSON.stringify(process.argv.slice(2))+'\\n');
console.log(JSON.stringify({ok:true, refs:[{query:'API', candidates:[{path:'docs/spec/API.md'}]}]}));`);
    const lifecycle = new ModeLifecycleController();
    lifecycle.enablePlanning(["read"]);
    const artifact = new PlanArtifactController();
    artifact.lastPlanningRequest = "Review src/app.ts and [[docs/spec/API.md]]";
    const shaping = new ContextShapingController();
    let persisted = 0;
    const controller = new ContextOrchestrationController(lifecycle, artifact, shaping, {
      getFlag: () => false, persistState: () => { persisted++; },
    });
    const ctx = { cwd: root, getContextUsage: () => ({ percent: 99, tokens: 200000 }),
      compact: () => { assert.fail("Plan Mode must not request compaction"); },
    } as unknown as ExtensionContext;
    controller.refreshPlanningAdvisoryContext(ctx);
    const calls = readFileSync(join(root, "calls.log"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.ok(calls.some(args => args[0] === "graph"));
    assert.ok(calls.some(args => args[0] === "expand"));
    assert.ok(calls.every(args => args[0] !== "validate"));
    assert.equal(shaping.advisoryContextStatus, "ready");
    assert.match(shaping.advisorySummary ?? "", /Reference expansion/);
    assert.doesNotMatch(shaping.advisorySummary ?? "", /Validate:/);
    controller.refreshPlanningAdvisoryContext(ctx);
    assert.equal(persisted, 1);
    writeFileSync(cli, "process.exit(1);");
    shaping.resetForPlanning();
    controller.refreshPlanningAdvisoryContext(ctx);
    assert.equal(shaping.advisoryContextStatus, "unavailable");
    assert.equal(lifecycle.mode, "planning");
    lifecycle.startExecution(lifecycle.beginReview()!);
    shaping.resetForPlanning();
    controller.refreshPlanningAdvisoryContext(ctx);
    assert.equal(persisted, 2);
    const source = readFileSync(new URL("../extensions/plan-mode/index.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /requestPlanningCompaction|getPlanCompactionReason|\.compact\(/);
    assert.match(source, /contextOrchestration\.refreshPlanningAdvisoryContext\(ctx\)/);
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    rmSync(root, { recursive: true, force: true });
  }
});
