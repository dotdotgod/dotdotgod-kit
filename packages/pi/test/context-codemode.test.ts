import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Type } from "typebox";
import { fixtureOutput, nodeCommand, textContent, workflowSession } from "./support/context-workflow.ts";

const options = "// @options: {\"max_output_tokens\": 500, \"timeout_ms\": 10000}\n";

test("public Pi codemode discovers native descriptions, receives structured results, and retrieves bounded evidence", async () => {
  const f = await workflowSession();
  try {
    writeFileSync(join(f.root, "fixture.log"), "file-marker expected-file-evidence\n" + "padding\n".repeat(8000));
    const result = await f.call("codemode", options + `
      const discovered = await searchTools("dotdotgod execute indexed output");
      if (!discovered.some(t => t.name === "dotdotgod_execute")) throw new Error("execute not discoverable");
      const info = await describeTool("dotdotgod_execute");
      if (!JSON.stringify(info).includes("unknown output size")) throw new Error("missing selection guidance");
      const smallBatch = await tools.dotdotgod_execute(${JSON.stringify({ commands: [nodeCommand("console.log('small output')")] })});
      const largeBatch = await tools.dotdotgod_execute(${JSON.stringify({ commands: [nodeCommand(fixtureOutput)] })});
      const small = smallBatch.results[0], large = largeBatch.results[0];
      if (!large.ok || !large.indexed?.id || large.stdout) throw new Error("large result not indexed");
      const found = await tools.dotdotgod_context_search({query:"workflow-needle", source:large.indexed.id, limit:1, sessionOnly:true});
      const file = await tools.dotdotgod_context_index({path:"fixture.log", scope:"project"});
      const fileFound = await tools.dotdotgod_context_search({query:"file-marker", source:file.id, limit:1});
      return {small:small.stdout.trim(), code:large.code, indexed:true, evidence:found.results[0]?.text.slice(0,120), file:fileFound.results[0]?.text.slice(0,120)};
    `);
    assert.equal(result.isError, false, textContent(result));
    const text = textContent(result);
    assert.match(text, /Script completed/);
    assert.match(text, /small output/);
    assert.match(text, /failure evidence/);
    assert.match(text, /expected-file-evidence/);
    assert.ok(text.length < 1000);
    assert.equal(text.includes("padding ".repeat(100)), false);
    for (const name of ["dotdotgod_execute", "dotdotgod_context_index", "dotdotgod_context_search"]) {
      const call = f.hooks.find((entry) => entry.name === name && entry.phase === "call" && entry.parent);
      assert.ok(call, `${name} must run through nested tool_call`);
      assert.ok(f.hooks.some((entry) => entry.name === name && entry.phase === "result" && entry.parent === call.parent));
    }
    // Actual prepared model declarations, not just the original registration object.
    const execute = f.session.agent.state.tools.find((tool) => tool.name === "dotdotgod_execute")!;
    assert.match(execute.description, /Codemode:/);
    assert.match(execute.description, /structured object/);
    assert.match(f.session.systemPrompt, /unknown output size/);
    assert.match(f.session.systemPrompt, /fail OR error OR reason/);
    assert.match(f.session.systemPrompt, /cause as unverified/);
    assert.match(f.session.systemPrompt, /do not use them to bypass/);
  } finally { await f.close(); }
});

test("codemode handles nonzero status, no-match, malformed JSON, and blocked nested tools distinctly", async () => {
  const f = await workflowSession((pi) => {
    pi.registerTool({ name: "fixture_malformed", label: "Fixture", description: "Test-only malformed response", parameters: Type.Object({}), async execute() { return { content: [{ type: "text", text: "not JSON" }], details: undefined }; } });
    pi.on("tool_call", (event) => {
      if (event.toolName === "dotdotgod_execute" && (event.input.commands as { label?: string }[]).some(command => command.label === "blocked-fixture")) return { block: true, reason: "fixture nested policy" };
    });
  });
  try {
    const result = await f.call("codemode", options + `
      const failureBatch = await tools.dotdotgod_execute(${JSON.stringify({ commands: [{ ...nodeCommand("console.error('codemode-failure expected reason'); process.exitCode=9;"), outputMode: "indexed" }] })});
      const failure = failureBatch.results[0];
      const found = await tools.dotdotgod_context_search({source:failure.indexed.id, query:"codemode-failure", limit:1});
      const absent = await tools.dotdotgod_context_search({source:failure.indexed.id, query:"absent-marker", limit:1});
      const browsed = await tools.dotdotgod_context_search({source:failure.indexed.id, query:"*", sessionOnly:true, limit:1});
      if (!browsed.ok || browsed.results.length !== 1 || browsed.results[0].sourceId !== failure.indexed.id) throw new Error("wildcard browse failed");
      let malformed=false, blocked=false;
      try { JSON.parse(await tools.fixture_malformed({})); } catch { malformed=true; }
      try { await tools.dotdotgod_execute(${JSON.stringify({ commands: [{ ...nodeCommand("0"), label: "blocked-fixture" }] })}); } catch(e) { blocked=String(e).includes("fixture nested policy"); }
      return {ok:failure.ok, code:failure.code, evidence:found.results[0]?.text.slice(0,100), noMatch:absent.ok && absent.results.length===0, malformed, blocked};
    `);
    assert.equal(result.isError, false, textContent(result));
    const text = textContent(result);
    assert.match(text, /"ok":\s*false/);
    assert.match(text, /"code":\s*9/);
    assert.match(text, /expected reason/);
    for (const key of ["noMatch", "malformed", "blocked"]) assert.match(text, new RegExp(`"${key}":\\s*true`));
    assert.ok(text.length < 1000);
  } finally { await f.close(); }
});

test("aborting a codemode session cancels its active child command", async () => {
  const f = await workflowSession();
  let sawExecute!: () => void;
  const started = new Promise<void>((resolve) => { sawExecute = resolve; });
  const unsubscribe = f.session.subscribe((event) => {
    if (event.type === "tool_execution_start" && event.toolName === "dotdotgod_execute") sawExecute();
  });
  try {
    const running = f.call("codemode", `return await tools.dotdotgod_execute(${JSON.stringify({ commands: [nodeCommand("setInterval(()=>{},1000)")] })});`);
    await Promise.race([started, running.then((result) => { throw new Error(`command did not start: ${textContent(result)}`); })]);
    // Allow the real child to spawn before cancelling; avoid a pre-spawn-only assertion.
    await new Promise((resolve) => setTimeout(resolve, 100));
    await f.session.abort();
    const result = await running;
    assert.ok(result.isError || /aborted|cancel/i.test(textContent(result)), textContent(result));
  } finally { unsubscribe(); await f.close(); }
});
