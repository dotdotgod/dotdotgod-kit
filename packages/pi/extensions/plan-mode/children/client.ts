import { connect } from "node:net";
import { readFile } from "node:fs/promises";
import { channel, deferred, DEFAULT_TIMEOUT_MS, type Json } from "./channel.ts";
import type { Decision } from "./parent.ts";

export type ChildPolicy = { policyGeneration: number; policyId: string; ceiling: Json };
export type ConnectOptions = { locator: string; terminalId: string; sessionId: string; timeoutMs?: number; signal?: AbortSignal };

export async function connectChild(options: ConnectOptions) {
  if (process.platform === "win32") throw new Error("Child IPC requires local POSIX sockets");
  const credential: unknown = JSON.parse(await readFile(options.locator, "utf8"));
  if (!credential || typeof credential !== "object") throw new Error("Invalid credential");
  const value = credential as Record<string, unknown>;
  if (value.version !== 1 || typeof value.endpoint !== "string" || typeof value.launchId !== "string" || typeof value.capability !== "string") throw new Error("Invalid credential");
  if (!options.terminalId || !options.sessionId) throw new Error("Missing child identity");
  const launchId = value.launchId;
  const controller = new AbortController();
  const policyReady = deferred<ChildPolicy>();
  let policy: ChildPolicy | undefined;
  let acknowledged = false;
  let nextRequest = 0;
  const pending = new Map<number, { resolve: (value: Decision) => void; reject: (error: Error) => void; dispose: () => void }>();
  const socket = connect(value.endpoint);
  const transport = channel(socket, (message) => {
    if (message.launchId !== launchId) throw new Error("Launch binding mismatch");
    if (message.kind === "revoke") { fail(new Error(String(message.reasonCode))); return; }
    if (message.kind === "policy") {
      if (policy || !Number.isSafeInteger(message.policyGeneration) || typeof message.policyId !== "string" || !("ceiling" in message)) throw new Error("Invalid policy");
      policy = deepFreeze({ policyGeneration: message.policyGeneration as number, policyId: message.policyId, ceiling: message.ceiling! });
      clearTimeout(startupTimer);
      policyReady.resolve(policy);
      return;
    }
    if (message.kind !== "decision" || !acknowledged || message.policyGeneration !== policy?.policyGeneration || !Number.isSafeInteger(message.requestId) || typeof message.allow !== "boolean" || typeof message.reasonCode !== "string") throw new Error("Invalid or stale decision");
    const request = pending.get(message.requestId as number);
    if (!request) throw new Error("Duplicate or unmatched decision");
    pending.delete(message.requestId as number);
    request.dispose();
    request.resolve({ allow: message.allow, reasonCode: message.reasonCode });
  }, fail);
  function fail(error: Error) {
    if (controller.signal.aborted) return;
    controller.abort(error);
    clearTimeout(startupTimer);
    options.signal?.removeEventListener("abort", cancelled);
    policyReady.reject(error);
    for (const request of pending.values()) { request.dispose(); request.reject(error); }
    pending.clear();
    transport.close();
  }
  function cancelled() { fail(new Error("Child connection cancelled")); }
  const startupTimer = setTimeout(() => fail(new Error("Startup timeout")), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  options.signal?.addEventListener("abort", cancelled, { once: true });
  if (options.signal?.aborted) cancelled();
  socket.once("connect", () => {
    try { transport.send({ kind: "hello", version: 1, launchId, capability: value.capability as string, terminalId: options.terminalId, childSessionId: options.sessionId }); }
    catch (error) { fail(error as Error); }
  });
  const receivedPolicy = await policyReady.promise;
  const send = (kind: string, fields: Record<string, Json>) => transport.send({ kind, version: 1, launchId, childSessionId: options.sessionId, policyGeneration: receivedPolicy.policyGeneration, ...fields });
  return {
    policy: receivedPolicy,
    signal: controller.signal,
    async acknowledgeReady(environmentFingerprint: string) {
      if (acknowledged || controller.signal.aborted) throw new Error("Already ready or revoked");
      try { send("ready", { policyId: receivedPolicy.policyId, environmentFingerprint }); acknowledged = true; }
      catch (error) { fail(error as Error); throw error; }
    },
    async authorize(operation: Json, requestOptions: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Decision> {
      if (!acknowledged) throw new Error("Child is not ready");
      if (controller.signal.aborted) throw new Error("Child revoked");
      if (requestOptions.signal?.aborted) { fail(new Error("Authorization cancelled")); throw new Error("Authorization cancelled"); }
      const requestId = ++nextRequest;
      const result = deferred<Decision>();
      const abort = () => fail(new Error("Authorization cancelled"));
      const timer = setTimeout(() => fail(new Error("Authorization timeout")), requestOptions.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const dispose = () => { clearTimeout(timer); requestOptions.signal?.removeEventListener("abort", abort); };
      pending.set(requestId, { ...result, dispose });
      requestOptions.signal?.addEventListener("abort", abort, { once: true });
      try { send("authorize", { requestId, operation }); } catch (error) { fail(error as Error); }
      return result.promise;
    },
    close(reasonCode = "Child closed") {
      if (!controller.signal.aborted) { try { send("revoke", { reasonCode }); } catch { /* Local close still revokes. */ } }
      fail(new Error(reasonCode));
    },
  };
}
export type ChildClient = Awaited<ReturnType<typeof connectChild>>;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); }
  return value;
}
