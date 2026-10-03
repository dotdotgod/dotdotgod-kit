import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fixtureOutput, nodeCommand, textContent, workflowSession } from "./support/context-workflow.ts";

const data = (result: Parameters<typeof textContent>[0] & { details?: any }) => { const value = result.details; return value.concurrency !== undefined ? value.results[0] : value; };
const execute = (f: Awaited<ReturnType<typeof workflowSession>>, command: ReturnType<typeof nodeCommand> & { outputMode?: string; timeoutMs?: number; label?: string }) => f.call("dotdotgod_execute", { commands: [command] });

test("native auto/indexed execution and file ingestion retain searchable source-scoped evidence", async () => {
  const f = await workflowSession();
  try {
    const small = data(await execute(f, nodeCommand("console.log('small output')")));
    assert.equal(small.ok, true);
    assert.equal(small.code, 0);
    assert.match(small.stdout, /small output/);
    assert.equal(small.indexed, undefined);
    for (const outputMode of ["auto", "indexed"]) {
      const largeResult = await execute(f, { ...nodeCommand(fixtureOutput), outputMode });
      const large = data(largeResult);
      assert.equal(large.ok, true);
      assert.ok(large.stdoutBytes > 12000);
      assert.ok(large.indexed.id);
      assert.equal(large.stdout, undefined);
      assert.ok(textContent(largeResult).length < 2000);
      const found = data(await f.call("dotdotgod_context_search", { source: large.indexed.id, query: "workflow-needle", sessionOnly: true, limit: 1 }));
      assert.equal(found.results.length, 1);
      assert.equal(found.results[0].sourceId, large.indexed.id);
      assert.match(found.results[0].text, /failure evidence/);
      assert.ok(found.results[0].text.length < 3000);
      const originalSession = data(await f.call("dotdotgod_context_stats", {})).sessionId;
      await f.call("dotdotgod_context_session_resume", { sessionId: "workflow-other-session" });
      const isolated = data(await f.call("dotdotgod_context_search", { source: large.indexed.id, query: "workflow-needle", sessionOnly: true, limit: 1 }));
      assert.deepEqual(isolated.results, []);
      await f.call("dotdotgod_context_session_resume", { sessionId: originalSession });
    }
    writeFileSync(join(f.root, "fixture.log"), "file-needle expected-file-evidence\n" + "padding\n".repeat(8000));
    writeFileSync(join(f.root, "distractor.log"), "file-needle wrong-source-evidence");
    const indexedResult = await f.call("dotdotgod_context_index", { path: "fixture.log", scope: "project" });
    const indexed = data(indexedResult);
    assert.equal(textContent(indexedResult).includes("expected-file-evidence"), false);
    await f.call("dotdotgod_context_index", { path: "distractor.log", scope: "project" });
    const found = data(await f.call("dotdotgod_context_search", { source: indexed.id, scope: "project", query: "file-needle", limit: 1 }));
    assert.equal(found.results.length, 1);
    assert.equal(found.results[0].sourceId, indexed.id);
    assert.match(found.results[0].text, /expected-file-evidence/);
    assert.equal(JSON.stringify(found).includes("wrong-source-evidence"), false);
    const absent = data(await f.call("dotdotgod_context_search", { source: indexed.id, query: "not-present-marker", limit: 1 }));
    assert.equal(absent.ok, true);
    assert.deepEqual(absent.results, []);
    const otherScope = data(await f.call("dotdotgod_context_search", { source: indexed.id, scope: "session", query: "file-needle", limit: 1 }));
    assert.deepEqual(otherScope.results, []);
  } finally { await f.close(); }
});

test("native discard/nonzero/timeout/policy rejection preserve distinct status and retained diagnostics", async () => {
  const f = await workflowSession((pi) => {
    pi.on("tool_call", (event) => {
      if (event.toolName === "dotdotgod_execute" && (event.input.commands as { label?: string }[]).some(command => command.label === "blocked-fixture")) return { block: true, reason: "fixture policy" };
    });
  });
  try {
    const before = data(await f.call("dotdotgod_context_stats", {}));
    const discarded = data(await execute(f, { ...nodeCommand(fixtureOutput), outputMode: "discard" }));
    assert.equal(discarded.ok, true);
    for (const key of ["stdout", "stderr", "indexed"]) assert.equal(discarded[key], undefined);
    assert.equal(data(await f.call("dotdotgod_context_stats", {})).sources, before.sources);
    const failed = data(await execute(f, { ...nodeCommand("console.error('diagnostic-needle expected failure'); console.error('padding '.repeat(8000)); process.exitCode=7;"), outputMode: "indexed" }));
    assert.equal(failed.ok, false);
    assert.equal(failed.code, 7);
    assert.equal(failed.timedOut, false);
    assert.equal(failed.captureLimitExceeded, false);
    assert.ok(failed.indexed.id);
    const found = data(await f.call("dotdotgod_context_search", { source: failed.indexed.id, query: "diagnostic-needle", limit: 1 }));
    assert.match(found.results[0].text, /expected failure/);
    const browsed = data(await f.call("dotdotgod_context_search", { source: failed.indexed.id, query: "*", sessionOnly: true, limit: 1 }));
    assert.equal(browsed.ok, true);
    assert.equal(browsed.results.length, 1);
    assert.equal(browsed.results[0].sourceId, failed.indexed.id);
    const timed = data(await execute(f, { ...nodeCommand("setInterval(()=>{},1000)"), timeoutMs: 20 }));
    assert.equal(timed.ok, false);
    assert.equal(timed.timedOut, true);
    const blocked = await execute(f, { ...nodeCommand("0"), label: "blocked-fixture" });
    assert.equal(blocked.isError, true);
    assert.match(textContent(blocked), /fixture policy/);
  } finally { await f.close(); }
});
