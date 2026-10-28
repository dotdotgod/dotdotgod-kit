import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("Pi MCP pins its session root instead of inheriting a parent context project", () => {
  const foreignRoot = mkdtempSync(join(tmpdir(), "dotdotgod-parent-root-"));
  try {
    const fixture = new URL("./support/context-workflow.ts", import.meta.url).href;
    const plan = new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname;
    const source = `
      import assert from 'node:assert/strict';
      import { realpathSync } from 'node:fs';
      import { workflowSession } from ${JSON.stringify(fixture)};
      const f = await workflowSession(undefined, [${JSON.stringify(plan)}]);
      try {
        f.session.setActiveToolsByName(['write', 'codemode']);
        await f.call('write', {path:'one.ts', content:'export const one=1;'});
        const status = await f.call('mcp__dotdotgod_context__impact_status', {});
        assert.equal(status.structuredContent.structuredContent.count, 1);
        const stats = await f.call('mcp__dotdotgod_context__stats', {});
        assert.ok(realpathSync(stats.structuredContent.structuredContent.path).startsWith(realpathSync(f.root) + '/'));
        await f.call('mcp__dotdotgod_context__session_resume', {sessionId:'resumed-context'});
        const review = await f.call('mcp__dotdotgod_context__project_impact', {paths:['one.ts']});
        assert.equal(review.structuredContent.structuredContent.ok, true);
        const cleared = await f.call('mcp__dotdotgod_context__impact_status', {});
        assert.equal(cleared.structuredContent.structuredContent.count, 0);
      } finally { await f.close(); }
    `;
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source], {
      env: { ...process.env, DOTDOTGOD_PROJECT_ROOT: foreignRoot }, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(foreignRoot, { recursive: true, force: true }); }
});
