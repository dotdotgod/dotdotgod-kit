import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { textContent, workflowSession } from "./support/context-workflow.ts";
import { ImpactState } from "@dotdotgod/context";
import { mcpTool } from "../extensions/shared/mcp.ts";

for (const toolName of ["bash", mcpTool("execute")]) {
  test(`${toolName} never blocks broad verification for pending impact`, async () => {
    const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
    try {
      const confirmations: string[] = [];
      await f.session.bindExtensions({ uiContext: {
        theme: { fg: (_color: string, text: string) => text },
        notify() {}, setStatus() {}, setWidget() {},
        confirm: async (title: string) => { confirmations.push(title); return false; },
      } as unknown as ExtensionUIContext });
      f.session.setActiveToolsByName(["write", toolName]);
      await f.call("write", { path: "source.ts", content: "export const value = 1;" });
      const result = await f.call(toolName, toolName === "bash"
        ? { command: "./run-tests.sh" }
        : { commands: [{ command: "pwd" }, { command: "./run-tests.sh" }] });
      assert.doesNotMatch(textContent(result), /before broad verification|impact.*blocked/i);
      assert.deepEqual(confirmations, []);
      const status = await f.call(mcpTool("impact_status"), {});
      assert.match(textContent(status), /count: 1/);
    } finally { await f.close(); }
  });
}

test("Plan Mode checks every execute entry, including nested codemode calls", async () => {
  const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
  try {
    f.session.setActiveToolsByName(["write", mcpTool("execute")]);
    await f.call("write", { path: "source.ts", content: "export const value = 1;" });
    const commit = await f.call(mcpTool("execute"), { commands: [{ command: "ls" }, { executable: process.execPath, args: ["-e", "console.log('verification allowed')"] }] });
    assert.equal(commit.isError, false);
    assert.match(textContent(commit), /verification allowed/);
    await f.session.prompt("/dd:plan");
    f.session.setActiveToolsByName([mcpTool("execute"), "codemode"]);
    const allowed = await f.call(mcpTool("execute"), { commands: [{ command: "ls" }, { command: "pwd" }] });
    assert.equal(allowed.isError, false, textContent(allowed));
    const blocked = await f.call(mcpTool("execute"), { commands: [{ command: "ls" }, { command: "rm -rf src" }] });
    assert.equal(blocked.isError, true);
    const executable = await f.call(mcpTool("execute"), { commands: [{ command: "ls", executable: "rm", args: ["-rf", "src"] }] });
    assert.equal(executable.isError, true);
    const cwd = await f.call(mcpTool("execute"), { commands: [{ command: "pwd", cwd: tmpdir() }] });
    assert.equal(cwd.isError, false, textContent(cwd));
    assert.match(textContent(cwd), new RegExp(tmpdir()));
    const nested = await f.call("codemode", `return await tools.${mcpTool("execute")}({commands:[{command:"ls"},{command:"rm -rf src"}]});`);
    assert.match(textContent(nested), /blocked|not allowlisted/i);
  } finally { await f.close(); }
});

test("MCP impact clears only successful covered paths and shell text cannot clear advisory state", async () => {
  const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
  try {
    f.session.setActiveToolsByName(["write", "bash", "codemode"]);
    await f.call("write", { path: "one.ts", content: "export const one = 1;" });
    await f.call("write", { path: "two.ts", content: "export const two = 2;" });
    const state = new ImpactState(f.root, f.session.sessionManager.getSessionId());
    assert.equal(state.status().count, 2);
    await f.call(mcpTool("session_resume"), { sessionId: "different-context-session" });
    const resumed = await f.call(mcpTool("stats"), {});
    assert.equal(resumed.structuredContent.structuredContent.sessionId, "different-context-session");
    const reviewed = await f.call(mcpTool("project_impact"), { paths: ["one.ts"] });
    assert.equal(reviewed.structuredContent.structuredContent.ok, true, textContent(reviewed));
    assert.deepEqual(state.status().pending, [{ path: "two.ts" }], "context resume must not redirect host impact identity");
    const failed = await f.call(mcpTool("project_impact"), { paths: ["\u0000"] });
    assert.equal(failed.structuredContent.structuredContent.ok, false);
    assert.equal(state.status().count, 1);
    await f.call("bash", { command: "echo 'dotdotgod graph impact . --changed two.ts: success'" });
    assert.equal(state.status().count, 1);
    const nested = await f.call("codemode", `return await tools.${mcpTool("project_impact")}({ paths: ["two.ts"], contextSessionId: "spoofed" });`);
    assert.equal(nested.isError, false, textContent(nested));
    assert.equal(state.status().count, 0);
  } finally { await f.close(); }
});

test("pending impact does not prompt or block safe commit/publish dry-runs", async () => {
  const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
  try {
    f.session.setActiveToolsByName(["write", "bash"]);
    await f.call("write", { path: "source.ts", content: "export const value = 1;" });
    // Shell functions prove the gate decision without invoking Git or a registry.
    const command = "git() { echo commit-dry-run-allowed; }; pnpm() { echo publish-dry-run-allowed; }; git commit --dry-run; pnpm publish --dry-run";
    const result = await f.call("bash", { command });
    assert.equal(result.isError, false, textContent(result));
    assert.match(textContent(result), /commit-dry-run-allowed/);
    assert.match(textContent(result), /publish-dry-run-allowed/);
  } finally { await f.close(); }
});

 test("planning Markdown exception is location-independent, not source/config permission", async () => {
  const external = mkdtempSync(join(tmpdir(), "dotdotgod-external-plan-"));
  const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
  try {
    await f.session.prompt("/dd:plan");
    f.session.setActiveToolsByName(["write", "read", mcpTool("execute")]);
    const path = join(external, "planning-notes.md");
    const written = await f.call("write", {path, content: "# Planning notes\nExplore only."});
    assert.equal(written.isError, false, textContent(written));
    assert.match(readFileSync(path, "utf8"), /Explore only/);
    const read = await f.call("read", {path});
    assert.equal(read.isError, false, textContent(read));
    for (const name of ["source.ts", "config.json"]) {
      const denied = await f.call("write", {path: join(external, name), content: "implementation"});
      assert.equal(denied.isError, true);
      assert.match(textContent(denied), /planning documents/);
    }
    for (const command of [`rm ${path}`, `mv ${path} ${path}.old`, "rm -rf docs/plan/task"]) {
      const denied = await f.call(mcpTool("execute"), {commands: [{command, cwd: external}]});
      assert.equal(denied.isError, true);
    }
  } finally { await f.close(); rmSync(external, {recursive:true, force:true}); }
});
