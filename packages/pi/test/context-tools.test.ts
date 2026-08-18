import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import contextTools from "../extensions/context-tools/index.ts";

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
