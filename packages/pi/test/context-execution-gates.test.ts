import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { textContent, workflowSession } from "./support/context-workflow.ts";

for (const toolName of ["bash", "dotdotgod_execute"]) {
  test(`${toolName} preserves the pending-impact gate for ./run-tests.sh`, async () => {
    const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
    try {
      const confirmations: string[] = [];
      await f.session.bindExtensions({ uiContext: {
        theme: { fg: (_color: string, text: string) => text },
        notify() {}, setStatus() {}, setWidget() {},
        confirm: async (title: string) => { confirmations.push(title); return false; },
      } as unknown as ExtensionUIContext });
      f.session.setActiveToolsByName(["write", toolName, "dotdotgod_context_heal"]);
      await f.call("write", { path: "source.ts", content: "export const value = 1;" });
      const blocked = await f.call(toolName, toolName === "bash"
        ? { command: "./run-tests.sh" }
        : { commands: [{ command: "pwd" }, { command: "./run-tests.sh" }] });
      assert.equal(blocked.isError, true);
      assert.match(textContent(blocked), /before broad verification/);
      assert.deepEqual(confirmations, ["Run broad verification before impact check?"]);
    } finally { await f.close(); }
  });
}

test("Plan Mode checks every execute entry, including nested codemode calls", async () => {
  const f = await workflowSession(undefined, [new URL("../extensions/plan-mode/index.ts", import.meta.url).pathname]);
  try {
    f.session.setActiveToolsByName(["write", "dotdotgod_execute"]);
    await f.call("write", { path: "source.ts", content: "export const value = 1;" });
    const commit = await f.call("dotdotgod_execute", { commands: [{ command: "ls" }, { executable: "git", args: ["commit", "-m", "fixture"] }] });
    assert.equal(commit.isError, true);
    assert.match(textContent(commit), /impact.*pending/i);
    await f.session.prompt("/dd:plan");
    f.session.setActiveToolsByName(["dotdotgod_execute", "codemode", "dotdotgod_context_heal"]);
    const allowed = await f.call("dotdotgod_execute", { commands: [{ command: "ls" }, { command: "pwd" }] });
    assert.equal(allowed.isError, false, textContent(allowed));
    const blocked = await f.call("dotdotgod_execute", { commands: [{ command: "ls" }, { command: "rm -rf src" }] });
    assert.equal(blocked.isError, true);
    const executable = await f.call("dotdotgod_execute", { commands: [{ command: "ls", executable: "rm", args: ["-rf", "src"] }] });
    assert.equal(executable.isError, true);
    const cwd = await f.call("dotdotgod_execute", { commands: [{ command: "ls", cwd: "docs" }] });
    assert.equal(cwd.isError, true);
    const nested = await f.call("codemode", `return await tools.dotdotgod_execute({commands:[{command:"ls"},{command:"rm -rf src"}]});`);
    assert.match(textContent(nested), /blocked|not allowlisted/i);
  } finally { await f.close(); }
});
