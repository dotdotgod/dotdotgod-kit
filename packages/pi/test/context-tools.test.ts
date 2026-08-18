import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import contextTools from "../extensions/context-tools/index.ts";
import { PHASE3_TOOL_INPUT_SCHEMAS } from "@dotdotgod/context";

type RegisteredTool = {
  name: string;
  parameters: Record<string, unknown>;
  execute: (...args: any[]) => Promise<any>;
};

function register() {
  const tools = new Map<string, RegisteredTool>();
  const pi = { registerTool(tool: RegisteredTool) { tools.set(tool.name, tool); } };
  contextTools(pi as any);
  return tools;
}

test("Pi registers native context tools with bounded directory and scope schemas", () => {
  const tools = register();
  assert.equal(tools.size, 15);
  assert.ok(tools.has("dotdotgod_context_index"));
  assert.ok(tools.has("dotdotgod_execute"));
  assert.ok(tools.has("dotdotgod_context_session_resume"));
  assert.ok(tools.has("dotdotgod_ingestion_job_start"));
  assert.ok(tools.has("dotdotgod_context_heal"));
  const names = { session_resume: "dotdotgod_context_session_resume", ingestion_job_start: "dotdotgod_ingestion_job_start", ingestion_job_status: "dotdotgod_ingestion_job_status", ingestion_job_cancel: "dotdotgod_ingestion_job_cancel", context_heal: "dotdotgod_context_heal" } as const;
  for (const [contract, toolName] of Object.entries(names)) assert.deepEqual(tools.get(toolName)?.parameters, PHASE3_TOOL_INPUT_SCHEMAS[contract as keyof typeof PHASE3_TOOL_INPUT_SCHEMAS]);
  const indexSchema = JSON.stringify(tools.get("dotdotgod_context_index")?.parameters);
  assert.match(indexSchema, /maxAggregateBytes/);
  assert.match(indexSchema, /maxVisitedEntries/);
  assert.match(indexSchema, /transient/);
  assert.match(indexSchema, /project/);
  assert.match(indexSchema, /minimum/);
  const fetchSchema = JSON.stringify(tools.get("dotdotgod_fetch_and_index")?.parameters);
  assert.match(fetchSchema, /transient/);
  assert.match(fetchSchema, /maximum|minimum/);
});

test("Pi phase 3 job cancellation uses the runner and healing invalidates cached state", async () => {
  const root = mkdtempSync(join(tmpdir(), "dotdotgod-pi-phase3-"));
  try {
    const tools = register(); const ctx = { cwd: root };
    const start = tools.get("dotdotgod_ingestion_job_start")!;
    const firstPromise = start.execute("start-1", { kind: "fetch", input: { url: "https://192.0.2.1/blocked" } }, undefined, () => {}, ctx);
    const secondPromise = start.execute("start-2", { kind: "index", input: { path: "missing.txt" } }, undefined, () => {}, ctx);
    const db = new DatabaseSync(join(root, ".dotdotgod", "context", "context.sqlite"), { readOnly: true });
    const secondId = db.prepare("SELECT id FROM ingestion_jobs ORDER BY created_at, rowid LIMIT 1 OFFSET 1").get()!.id as string; db.close();
    const cancelledPromise = tools.get("dotdotgod_ingestion_job_cancel")!.execute("cancel", { id: secondId }, undefined, () => {}, ctx);
    const [, , cancelled] = await Promise.all([firstPromise, secondPromise, cancelledPromise]);
    assert.equal(cancelled.details.job.state, "cancelled");
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const status = await tools.get("dotdotgod_ingestion_job_status")!.execute("status", { id: firstPromise && (await firstPromise).details.job.id }, undefined, () => {}, ctx);
      if (["completed", "failed"].includes(status.details.job.state)) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const healed = await tools.get("dotdotgod_context_heal")!.execute("heal", { confirm: true }, undefined, () => {}, ctx);
    assert.equal(healed.details.ok, true);
    const stats = await tools.get("dotdotgod_context_stats")!.execute("stats", {}, undefined, () => {}, ctx);
    assert.equal(stats.details.ok, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("Pi native directory index calls the shared core without an MCP child", async () => {
  const root = mkdtempSync(join(tmpdir(), "dotdotgod-pi-context-tools-"));
  try {
    const docs = join(root, "docs");
    mkdirSync(docs);
    writeFileSync(join(docs, "a.md"), "# Native\npi-native-directory-needle");
    writeFileSync(join(docs, "skip.txt"), "not selected");
    const tools = register();
    const tool = tools.get("dotdotgod_context_index");
    assert.ok(tool);
    const controller = new AbortController();
    const result = await tool.execute(
      "call-1",
      { path: "docs", scope: "project", includeExtensions: [".md"], maxAggregateBytes: 4096 },
      controller.signal,
      () => {},
      { cwd: root },
    );
    assert.deepEqual(result.details.indexed.map((entry: any) => entry.path), ["docs/a.md"]);
    assert.equal(result.details.skipped[0].reason, "extension-filter");
    assert.equal(JSON.stringify(result).includes("pi-native-directory-needle"), false);
    assert.equal(result.content.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
