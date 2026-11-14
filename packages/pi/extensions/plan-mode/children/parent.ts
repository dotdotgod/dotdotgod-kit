import { createServer, type Socket } from "node:net";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { channel, deferred, DEFAULT_TIMEOUT_MS, type Json, type Message } from "./channel.ts";

export type ChildBinding = { launchId: string; parentSessionId: string; root: string; policyGeneration: number; terminalId: string; childSessionId: string };
export type Decision = { allow: boolean; reasonCode: string };
export type LaunchOptions = { root: string; policyGeneration: number; ceiling: Json; metadata?: Json };
export type RegistryOptions = {
  parentSessionId: string;
  timeoutMs?: number;
  authorize: (binding: ChildBinding, operation: Json, signal: AbortSignal) => Decision | Promise<Decision>;
  verifyReady?: (binding: ChildBinding, fingerprint: string) => void | Promise<void>;
};

export function createParentRegistry(options: RegistryOptions) {
  if (process.platform === "win32") throw new Error("Child IPC requires local POSIX sockets");
  const launches = new Set<PendingLaunch>();
  let closed = false;
  return {
    async createPendingLaunch(input: LaunchOptions) {
      if (closed) throw new Error("Registry closed");
      const launch = await createLaunch(options, input);
      if (closed) { await launch.close(); throw new Error("Registry closed"); }
      launches.add(launch);
      return launch;
    },
    async close() { closed = true; await Promise.all([...launches].map((launch) => launch.close())); launches.clear(); },
  };
}
export type PendingLaunch = Awaited<ReturnType<typeof createLaunch>>;

async function createLaunch(options: RegistryOptions, input: LaunchOptions) {
  const ceiling = JSON.parse(JSON.stringify(input.ceiling)) as Json;
  const policyId = createHash("sha256").update(JSON.stringify(ceiling)).digest("hex");
  const directory = await mkdtemp(join(tmpdir(), "dd-child-"));
  const credentialLocator = join(directory, "credential.json");
  const endpoint = join(directory, "ipc.sock");
  const launchId = randomUUID();
  const capability = randomBytes(32).toString("hex");
  const ready = deferred<ChildBinding>();
  const controller = new AbortController();
  const sockets = new Set<Socket>();
  let transport: ReturnType<typeof channel> | undefined;
  let expectedTerminal: string | undefined;
  let binding: ChildBinding | undefined;
  let hello: Message | undefined;
  let state: "launching" | "authenticating" | "checking" | "ready" | "revoked" = "launching";
  let lastRequest = 0;
  let cleanup: Promise<void> | undefined;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    if (transport || state === "revoked") { socket.destroy(); return; }
    transport = channel(socket, receive, (error) => { void revoke(error.message); });
  });
  const timer = setTimeout(() => { void revoke("Startup timeout"); }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const send = (kind: string, fields: Record<string, Json>) => transport!.send({ kind, version: 1, launchId, ...fields });
  async function revoke(reasonCode: string) {
    if (state !== "revoked") {
      state = "revoked";
      clearTimeout(timer);
      controller.abort(new Error(reasonCode));
      ready.reject(new Error(reasonCode));
      try { if (transport) send("revoke", { reasonCode }); } catch { /* Disconnected peer is already denied. */ }
    }
    cleanup ??= (async () => {
      for (const socket of sockets) socket.end();
      for (const socket of sockets) socket.destroySoon();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(directory, { recursive: true, force: true });
    })();
    await cleanup;
  }
  async function authenticate() {
    if (!hello || !expectedTerminal || state !== "launching") return;
    state = "authenticating";
    if (hello.terminalId !== expectedTerminal) throw new Error("Terminal binding mismatch");
    binding = Object.freeze({ launchId, parentSessionId: options.parentSessionId, root: input.root, policyGeneration: input.policyGeneration, terminalId: expectedTerminal, childSessionId: hello.childSessionId as string });
    await rm(credentialLocator, { force: true });
    if (controller.signal.aborted) return;
    send("policy", { policyGeneration: input.policyGeneration, ceiling, policyId });
  }
  function receive(message: Message) {
    if (message.launchId !== launchId || state === "revoked") throw new Error("Launch binding mismatch");
    if (message.kind === "hello") {
      if (hello || state !== "launching" || typeof message.capability !== "string" || typeof message.terminalId !== "string" || typeof message.childSessionId !== "string" || !message.childSessionId) throw new Error("Invalid hello binding");
      const candidate = Buffer.from(message.capability);
      const secret = Buffer.from(capability);
      if (candidate.length !== secret.length || !timingSafeEqual(candidate, secret)) throw new Error("Authentication failed");
      hello = message;
      void authenticate().catch((error: Error) => revoke(error.message));
      return;
    }
    if (!binding || message.childSessionId !== binding.childSessionId || message.policyGeneration !== input.policyGeneration) throw new Error("Session or generation mismatch");
    if (message.kind === "ready") {
      if (state !== "authenticating" || message.policyId !== policyId || typeof message.environmentFingerprint !== "string") throw new Error("Invalid readiness");
      state = "checking";
      void Promise.resolve().then(() => options.verifyReady?.(binding!, message.environmentFingerprint as string)).then(() => {
        if (controller.signal.aborted) return;
        state = "ready";
        clearTimeout(timer);
        ready.resolve(binding!);
      }).catch((error: Error) => revoke(error.message));
      return;
    }
    if (message.kind === "revoke") { void revoke(typeof message.reasonCode === "string" ? message.reasonCode : "Child revoked"); return; }
    if (message.kind !== "authorize" || state !== "ready" || !Number.isSafeInteger(message.requestId) || (message.requestId as number) <= lastRequest || !("operation" in message)) throw new Error("Invalid authorization request");
    lastRequest = message.requestId as number;
    void Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new Error("Launch revoked");
      return options.authorize(binding!, message.operation!, controller.signal);
    }).then((decision) => {
      if (controller.signal.aborted) return;
      if (typeof decision.allow !== "boolean" || typeof decision.reasonCode !== "string") throw new Error("Invalid parent decision");
      send("decision", { requestId: message.requestId!, policyGeneration: input.policyGeneration, allow: decision.allow, reasonCode: decision.reasonCode });
    }).catch((error: Error) => revoke(error.message));
  }
  try {
    await chmod(directory, 0o700);
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(endpoint, () => { server.removeListener("error", reject); resolve(); }); });
    server.on("error", (error) => { void revoke(error.message); });
    await chmod(endpoint, 0o600);
    await writeFile(credentialLocator, JSON.stringify({ version: 1, endpoint, launchId, capability }), { mode: 0o600, flag: "wx" });
  } catch (error) { await revoke("Launch setup failed"); throw error; }
  return {
    launchId, credentialLocator,
    get binding() { return binding; },
    get signal() { return controller.signal; },
    attachTerminal(terminalId: string) {
      if (expectedTerminal || state === "revoked" || !terminalId) throw new Error("Terminal already attached or launch revoked");
      expectedTerminal = terminalId;
      void authenticate().catch((error: Error) => revoke(error.message));
    },
    waitReady: () => ready.promise,
    revoke,
    close: () => revoke("Parent closed"),
  };
}
