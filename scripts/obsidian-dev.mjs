import { mkdir, writeFile, readFile } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { openSync } from "node:fs";
import { resolve } from "node:path";

// Deliberately isolated from the user's normal Obsidian profile and vaults.
const root = resolve(import.meta.dirname, "..", ".obsidian-dev");
const profile = resolve(root, "profile");
const vault = resolve(root, "vault");
const command = process.argv[2] ?? "status";

async function provision() {
  await mkdir(resolve(vault, ".obsidian"), { recursive: true });
  await mkdir(profile, { recursive: true });
  // Do not overwrite an existing test workspace or its settings.
  const files = {
    "README.md": "# Traceability debugging vault\n\n[[REQUIREMENT]] → [[DESIGN]]\n",
    "REQUIREMENT.md": "# Login requirement\n\nImplemented by [[DESIGN]].\n",
    "DESIGN.md": "# Login design\n\nSource: [auth.ts](src/auth.ts)\nTest: [auth.test.ts](test/auth.test.ts)\n",
    "src/auth.ts": "export const authenticate = (token: string) => token.length > 0;\n",
    "test/auth.test.ts": "// Graph fixture only; not an executable test suite.\nimport { authenticate } from '../src/auth';\n",
    ".obsidian/core-plugins.json": JSON.stringify(["file-explorer", "global-search", "switcher", "graph", "backlink", "outgoing-link", "command-palette"]),
    ".obsidian/community-plugins.json": "[]",
  };
  for (const [path, content] of Object.entries(files)) {
    const target = resolve(vault, path);
    await mkdir(resolve(target, ".."), { recursive: true });
    try { await writeFile(target, content, { flag: "wx" }); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
  }
  await writeFile(resolve(profile, "obsidian.json"), JSON.stringify({
    vaults: { dotdotgodDebug: { path: vault, ts: Date.now(), open: true } },
  }));
}

async function connect() {
  const port = (await readFile(resolve(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
  if (!/^\d+$/.test(port)) throw new Error("Invalid debugging port");
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const page = targets.find(t => t.type === "page" && t.url.startsWith("app://obsidian.md"));
  if (!page) throw new Error("Obsidian page is not ready");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((yes, no) => { ws.onopen = yes; ws.onerror = no; });
  let sequence = 0;
  const call = (method, params = {}) => new Promise((yes, no) => {
    const id = ++sequence;
    const timer = setTimeout(() => { ws.removeEventListener("message", receive); no(new Error(`${method} timed out`)); }, 10_000);
    function receive(event) {
      const result = JSON.parse(event.data);
      if (result.id !== id) return;
      clearTimeout(timer);
      ws.removeEventListener("message", receive);
      if (result.error) no(new Error(JSON.stringify(result.error)));
      else yes(result.result);
    }
    ws.addEventListener("message", receive);
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, call };
}

if (command === "start") {
  const processes = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
  const existing = processes.split("\n").find(line => line.includes("/Contents/MacOS/Obsidian ") && line.includes(`--user-data-dir=${profile}`));
  if (existing) {
    try {
      const connection = await connect();
      connection.ws.close();
      console.log(JSON.stringify({ reused: true, vault, profile }));
      process.exit(0);
    } catch {
      // Only stop the exact isolated profile, never another Obsidian instance.
      const pid = Number(existing.trim().split(/\s/)[0]);
      process.kill(pid, "SIGTERM");
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try { process.kill(pid, 0); } catch { break; }
        await new Promise(r => setTimeout(r, 200));
      }
      try { process.kill(pid, 0); throw new Error("Isolated instance did not stop; refusing duplicate launch"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  }
  await provision();
  const log = openSync(resolve(root, "app.log"), "a");
  const child = spawn("/Applications/Obsidian.app/Contents/MacOS/Obsidian", [
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
  ], { detached: true, stdio: ["ignore", log, log] });
  child.unref();
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const connection = await connect();
      try {
        const result = await connection.call("Runtime.evaluate", { expression: `typeof app !== 'undefined' && app.vault.adapter.basePath === ${JSON.stringify(vault)} && app.workspace.layoutReady`, returnByValue: true });
        ready = result.result?.value === true;
      } finally { connection.ws.close(); }
      if (ready) break;
    } catch { /* App initialization is bounded by the loop. */ }
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) throw new Error(`Obsidian not ready; inspect ${resolve(root, "app.log")}`);
  console.log(JSON.stringify({ pid: child.pid, vault, profile }));
} else if (["status", "graph", "screenshot", "eval"].includes(command)) {
  const { ws, call } = await connect();
  try {
    if (command === "screenshot") {
      const result = await call("Page.captureScreenshot", { format: "png" });
      const path = resolve(root, "graph.png");
      await writeFile(path, Buffer.from(result.data, "base64"));
      console.log(path);
    } else {
      const expression = command === "eval" ? process.argv[3] : command === "graph"
        ? `app.commands.executeCommandById('graph:open')`
        : `JSON.stringify({vault: app.vault.adapter.basePath, files: app.vault.getFiles().map(f=>f.path), graphViews: app.workspace.getLeavesOfType('graph').length})`;
      const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      console.log(result.result.value);
    }
  } finally { ws.close(); }
} else {
  throw new Error("Usage: node scripts/obsidian-dev.mjs start|status|graph|screenshot");
}
