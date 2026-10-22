import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "typebox";
import { resolve } from "node:path";
import { workflowSession, textContent } from "./support/context-workflow.ts";

test("real SDK separates model Markdown from codemode structuredContent", async () => {
  const f = await workflowSession(pi => {
    pi.registerTool({ name: "fixture_structured", label: "Fixture", description: "Structured fixture", parameters: Type.Object({}), outputSchema: Type.Object({ ok: Type.Boolean() }), async execute() {
      return { content: [{ type: "text", text: "## Fixture\n- Success: true" }], details: { ok: true }, structuredContent: { ok: true } };
    } });
  }, [resolve("extensions/plan-mode/index.ts")]);
  try {
    const direct = await f.call("fixture_structured", {});
    assert.match(textContent(direct), /^## Fixture/);
    const script = await f.call("codemode", "const value = await tools.fixture_structured({}); if (typeof value !== 'object' || value.ok !== true) throw new Error('not structured'); const status = await tools.mcp__dotdotgod_context__impact_status({}); if (status.isError || !status.structuredContent.ok) throw new Error('MCP envelope missing'); let rejected = false; try { await tools.mcp__dotdotgod_context__project_impact({ paths: [] }); } catch { rejected = true; } if (!rejected) throw new Error('MCP schema failure missing'); return 'object received; MCP envelope retained';");
    assert.equal(script.isError, false, textContent(script));
    assert.match(textContent(script), /object received/);
  } finally { await f.close(); }
});
