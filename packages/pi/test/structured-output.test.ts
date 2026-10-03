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
    const script = await f.call("codemode", "const value = await tools.fixture_structured({}); if (typeof value !== 'object' || value.ok !== true) throw new Error('not structured'); const status = await tools.dotdotgod_impact_status({}); if (typeof status !== 'object' || !status.ok) throw new Error('status not structured'); const impact = await tools.dotdotgod_graph_impact({}); if (typeof impact !== 'string' || !impact.includes('required')) throw new Error('graph impact changed'); return 'object received; graph impact text unchanged';");
    assert.equal(script.isError, false, textContent(script));
    assert.match(textContent(script), /object received/);
  } finally { await f.close(); }
});
