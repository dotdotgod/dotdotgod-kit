import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import contextTools from "../extensions/context-tools/index.ts";
import { workflowSession, textContent } from "./support/context-workflow.ts";
import { mcpTool } from "../extensions/shared/mcp.ts";

test("Pi registers one host-managed MCP server without native aliases or schemas", () => {
  const tools = new Map<string, any>(), servers: any[] = [];
  contextTools({ registerTool: (tool: any) => tools.set(tool.name, tool), registerMcpServer: (...args: any[]) => servers.push(args), on() {} } as any);
  assert.equal(servers.length, 1);
  assert.equal(servers[0][0], "dotdotgod_context");
  assert.equal(servers[0][1].exposure, "codemode");
  assert.equal(tools.size, 0);
  assert.deepEqual(servers[0][1].toolExposure, { project_impact: "direct", impact_status: "direct" });
});

test("automatic Load retains compact Pi guidance and retries a blocked MCP request", async () => {
  let denied = false;
  const f = await workflowSession(pi => {
    pi.on("tool_call", event => {
      if (event.toolName === mcpTool("project_load") && !denied) {
        denied = true;
        return { block: true, reason: "fixture temporary load denial" };
      }
    });
  }, [new URL("../extensions/project-memory/index.ts", import.meta.url).pathname]);
  try {
    mkdirSync(join(f.root, "docs"));
    writeFileSync(join(f.root, "AGENTS.md"), "# Agent rules");
    writeFileSync(join(f.root, "docs/README.md"), "# Project docs");
    const failed = await f.call("project_memory_load", { focus: "" });
    assert.equal(failed.isError, true);
    assert.match(textContent(failed), /temporary load denial/);
    const loaded = await f.call("project_memory_load", { focus: "" });
    assert.equal(loaded.isError, false, textContent(loaded));
    assert.match(textContent(loaded), /Help: dotdotgod --help/);
    assert.match(textContent(loaded), /compact mode/);
    assert.match(textContent(loaded), /AGENTS.md/);
    assert.match(textContent(loaded), /docs\/\n  - README.md/);
    assert.match(textContent(loaded), /Evidence boundary/);
    const completed = f.session.sessionManager.getEntries().filter(entry => entry.type === "custom" && entry.customType === "project-memory-load");
    assert.equal(completed.length, 1);
  } finally { await f.close(); }
});

test("Pi MCP directory ingestion and real Code Mode envelopes share one searchable store", async () => {
  const f = await workflowSession();
  try {
    mkdirSync(join(f.root, "docs"));
    writeFileSync(join(f.root, "docs/a.md"), "# MCP\nshared-directory-needle");
    const indexed = await f.call(mcpTool("index"), { path: "docs", scope: "project", includeExtensions: [".md"] });
    assert.deepEqual(indexed.structuredContent.structuredContent.indexed.map((entry: any) => entry.path), ["docs/a.md"]);
    assert.ok(f.session.getAllTools().every(tool => !tool.name.startsWith("dotdotgod_")), "no native compatibility aliases");
    const script = await f.call("codemode", `const result = await tools.mcp__dotdotgod_context__search({query:"shared-directory-needle",limit:1}); if (result.isError || !result.structuredContent.ok) throw Error("MCP failed"); return result.structuredContent.results[0].text;`);
    assert.equal(script.isError, false, textContent(script));
    assert.match(textContent(script), /shared-directory-needle/);
    assert.ok(f.hooks.some(item => item.name === "mcp__dotdotgod_context__search" && item.parent));
  } finally { await f.close(); }
});
