import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile, stat, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { channel, deferred, encodeFrame, MAX_FRAME_BYTES, type Message } from "../extensions/plan-mode/children/channel.ts";
import { createParentRegistry } from "../extensions/plan-mode/children/parent.ts";
import { connectChild } from "../extensions/plan-mode/children/client.ts";

test("private credentials, held hello, policy readiness, authorization and cleanup", async () => {
  const registry = createParentRegistry({ parentSessionId: "parent", authorize: async (_binding, operation) => ({ allow: operation === "read", reasonCode: "policy" }) });
  const launch = await registry.createPendingLaunch({ root: "/project", policyGeneration: 1, ceiling: { read: true } });
  try {
    assert.equal((await stat(launch.credentialLocator)).mode & 0o777, 0o600);
    assert.equal((await stat(dirname(launch.credentialLocator))).mode & 0o777, 0o700);
    const connecting = connectChild({ locator: launch.credentialLocator, terminalId: "t1", sessionId: "child" });
    launch.attachTerminal("t1");
    const child = await connecting;
    assert.deepEqual(child.policy.ceiling, { read: true });
    await assert.rejects(access(launch.credentialLocator));
    await assert.rejects(child.authorize("read"), /ready/);
    await child.acknowledgeReady("env");
    const binding = await launch.waitReady();
    assert.equal(binding.childSessionId, "child");
    assert.equal((await child.authorize("read")).allow, true);
    assert.equal((await child.authorize("write")).allow, false);
    await launch.revoke("narrowed");
    await new Promise<void>((resolve) => child.signal.aborted ? resolve() : child.signal.addEventListener("abort", () => resolve(), { once: true }));
    await assert.rejects(child.authorize("read"));
  } finally { await registry.close(); }
  await assert.rejects(access(dirname(launch.credentialLocator)));
});

async function rawChild(launch: { credentialLocator: string }) {
  const credentials = JSON.parse(await readFile(launch.credentialLocator, "utf8"));
  const socket = connect(credentials.endpoint);
  await once(socket, "connect");
  const messages: Message[] = [];
  const waiters: Array<(message: Message) => void> = [];
  const transport = channel(socket, (message) => { const waiter = waiters.shift(); if (waiter) waiter(message); else messages.push(message); }, () => {});
  const next = () => messages.length ? Promise.resolve(messages.shift()!) : new Promise<Message>((resolve) => waiters.push(resolve));
  const send = (kind: string, fields: Record<string, import("../extensions/plan-mode/children/channel.ts").Json> = {}) => transport.send({ kind, version: 1, launchId: credentials.launchId, childSessionId: "child", policyGeneration: 1, ...fields });
  return { socket, send, next, credentials };
}

for (const fault of ["capability", "terminal", "session", "generation", "duplicate-ready", "duplicate-request"]) {
  test(`parent revokes ${fault}`, async () => {
    let calls = 0;
    const registry = createParentRegistry({ parentSessionId: "p", authorize: () => { calls++; return { allow: true, reasonCode: "ok" }; } });
    const launch = await registry.createPendingLaunch({ root: "/", policyGeneration: 1, ceiling: {} });
    const raw = await rawChild(launch);
    try {
      launch.attachTerminal("t1");
      raw.send("hello", { capability: fault === "capability" ? "wrong" : raw.credentials.capability, terminalId: fault === "terminal" ? "t2" : "t1" });
      if (fault === "capability" || fault === "terminal") {
        await assert.rejects(launch.waitReady());
      } else {
        const policy = await raw.next();
        raw.send("ready", { policyId: policy.policyId!, environmentFingerprint: "env" });
        await launch.waitReady();
        if (fault === "duplicate-ready") raw.send("ready", { policyId: policy.policyId!, environmentFingerprint: "env" });
        else {
          raw.send("authorize", { requestId: 1, operation: "read", ...(fault === "session" ? { childSessionId: "other" } : {}), ...(fault === "generation" ? { policyGeneration: 2 } : {}) });
          if (fault === "duplicate-request") { await raw.next(); raw.send("authorize", { requestId: 1, operation: "read" }); }
        }
        await once(launch.signal, "abort");
      }
      assert.equal(calls, fault === "duplicate-request" ? 1 : 0);
      assert.equal(launch.signal.aborted, true);
    } finally { raw.socket.destroy(); await registry.close(); }
    await assert.rejects(access(launch.credentialLocator));
  });
}

test("startup timeout removes credentials and prevents readiness", async () => {
  const registry = createParentRegistry({ parentSessionId: "p", timeoutMs: 20, authorize: () => ({ allow: false, reasonCode: "no" }) });
  const launch = await registry.createPendingLaunch({ root: "/", policyGeneration: 1, ceiling: {} });
  await assert.rejects(launch.waitReady(), /timeout/);
  await registry.close();
  await assert.rejects(access(dirname(launch.credentialLocator)));
});

for (const cancelled of [true, false]) test(cancelled ? "cancellation revokes all pending calls" : "authorization deadline revokes pending calls", async () => {
  const entered = deferred<void>();
  const registry = createParentRegistry({ parentSessionId: "p", authorize: async (_b, _o, signal) => { entered.resolve(); await once(signal, "abort"); return { allow: true, reasonCode: "late" }; } });
  const launch = await registry.createPendingLaunch({ root: "/", policyGeneration: 1, ceiling: {} });
  launch.attachTerminal("t1");
  const child = await connectChild({ locator: launch.credentialLocator, terminalId: "t1", sessionId: "s" });
  try {
    await child.acknowledgeReady("env"); await launch.waitReady();
    const controller = new AbortController();
    const request = child.authorize("read", { signal: controller.signal, timeoutMs: 30 });
    const rejected = assert.rejects(request, cancelled ? /cancelled/ : /timeout/);
    await entered.promise;
    if (cancelled) controller.abort();
    await rejected;
    assert.equal(child.signal.aborted, true);
  } finally { child.close(); await registry.close(); }
});

test("concurrent decisions may complete in reverse order", async () => {
  const first = deferred<{ allow: boolean; reasonCode: string }>();
  const registry = createParentRegistry({ parentSessionId: "p", authorize: (_b, operation) => operation === 1 ? first.promise : { allow: false, reasonCode: "second" } });
  const launch = await registry.createPendingLaunch({ root: "/", policyGeneration: 1, ceiling: {} });
  launch.attachTerminal("t1");
  const child = await connectChild({ locator: launch.credentialLocator, terminalId: "t1", sessionId: "s" });
  try {
    await child.acknowledgeReady("env"); await launch.waitReady();
    const one = child.authorize(1); const two = child.authorize(2);
    assert.equal((await two).reasonCode, "second");
    first.resolve({ allow: true, reasonCode: "first" });
    assert.equal((await one).allow, true);
  } finally { child.close(); await registry.close(); }
});

for (const fault of ["stale", "duplicate", "unmatched"]) test(`client revokes ${fault} decision`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "dd-fake-"));
  const endpoint = join(directory, "s"); const locator = join(directory, "c");
  const server = createServer();
  server.listen(endpoint); await once(server, "listening");
  await writeFile(locator, JSON.stringify({ version: 1, launchId: "l", capability: "secret", endpoint }));
  const accepting = once(server, "connection");
  const connecting = connectChild({ locator, terminalId: "t", sessionId: "s" });
  const [socket] = await accepting;
  let wire: ReturnType<typeof channel>;
  wire = channel(socket, (message) => {
    const send = (kind: string, fields = {}) => wire.send({ kind, version: 1, launchId: "l", ...fields });
    if (message.kind === "hello") send("policy", { policyGeneration: 1, policyId: "p", ceiling: {} });
    if (message.kind === "authorize") {
      const decision = { requestId: fault === "unmatched" ? 99 : message.requestId, policyGeneration: fault === "stale" ? 2 : 1, allow: true, reasonCode: "yes" };
      send("decision", decision);
      if (fault === "duplicate") send("decision", decision);
    }
  }, () => {});
  const child = await connecting;
  try {
    await child.acknowledgeReady("env");
    if (fault === "duplicate") { await child.authorize("read"); if (!child.signal.aborted) await once(child.signal, "abort"); }
    else await assert.rejects(child.authorize("read"));
    assert.equal(child.signal.aborted, true);
  } finally { child.close(); socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});

test("hello is held until terminal registration and readiness verification blocks delivery", async () => {
  const verify = deferred<void>();
  const registry = createParentRegistry({ parentSessionId: "p", verifyReady: () => verify.promise, authorize: () => ({ allow: false, reasonCode: "no" }) });
  const launch = await registry.createPendingLaunch({ root: "/", policyGeneration: 1, ceiling: {} });
  const raw = await rawChild(launch);
  try {
    raw.send("hello", { capability: raw.credentials.capability, terminalId: "t" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(launch.binding, undefined);
    launch.attachTerminal("t");
    const policy = await raw.next();
    raw.send("ready", { policyId: policy.policyId!, environmentFingerprint: "env" });
    let delivered = false;
    const delivery = launch.waitReady().then(() => { delivered = true; });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(delivered, false);
    verify.resolve(); await delivery;
    assert.equal(delivered, true);
  } finally { raw.socket.destroy(); await registry.close(); }
});

for (const oversized of [false, true]) test(`actual socket ${oversized ? "rejects oversized" : "accepts fragmented exact-byte"} UTF-8 frame`, async () => {
  const directory = await mkdtemp(join(tmpdir(), "dd-frame-"));
  const endpoint = join(directory, "s"); const server = createServer();
  server.listen(endpoint); await once(server, "listening");
  const accepting = once(server, "connection"); const writer = connect(endpoint); await once(writer, "connect");
  const [reader] = await accepting;
  const result = deferred<Message>();
  channel(reader, result.resolve, result.reject);
  try {
    const base: Message = { kind: "x", version: 1, launchId: "l", text: "" };
    const count = MAX_FRAME_BYTES - encodeFrame(base).length;
    const exact = encodeFrame({ ...base, text: "é".repeat(Math.floor(count / 2)) + "x".repeat(count % 2) });
    if (oversized) {
      writer.write(Buffer.alloc(MAX_FRAME_BYTES, 120)); writer.write("x");
      await assert.rejects(result.promise, /1 MiB/);
    } else {
      for (let offset = 0; offset < exact.length; offset += 7919) writer.write(exact.subarray(offset, offset + 7919));
      assert.equal((await result.promise).kind, "x");
    }
  } finally { writer.destroy(); reader.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});

test("UTF-8 frames enforce exact 1 MiB boundary including newline", () => {
  const base: Message = { kind: "x", version: 1, launchId: "l", text: "" };
  const overhead = encodeFrame(base).length;
  const exact = { ...base, text: "é".repeat(Math.floor((MAX_FRAME_BYTES - overhead) / 2)) + "x".repeat((MAX_FRAME_BYTES - overhead) % 2) };
  assert.equal(encodeFrame(exact).length, MAX_FRAME_BYTES);
  assert.throws(() => encodeFrame({ ...exact, text: exact.text + "x" }), /1 MiB/);
});
