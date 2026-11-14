import type { Socket } from "node:net";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonValue = Json;
export type Message = { kind: string; version: number; launchId: string; [key: string]: Json };
export const MAX_FRAME_BYTES = 1024 * 1024;
export const DEFAULT_TIMEOUT_MS = 180_000;

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  // A launch can fail before its owner starts waiting.
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

export function encodeFrame(message: Message): Buffer {
  const frame = Buffer.from(JSON.stringify(message) + "\n");
  if (frame.length > MAX_FRAME_BYTES) throw new Error("IPC frame exceeds 1 MiB");
  return frame;
}

export function channel(socket: Socket, receive: (message: Message) => void, failed: (error: Error) => void) {
  let buffered = Buffer.alloc(0);
  let ended = false;
  const fail = (error: Error) => {
    if (ended) return;
    ended = true;
    socket.destroy();
    failed(error);
  };
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("IPC disconnected")));
  socket.on("data", (chunk: Buffer) => {
    let start = 0;
    try {
      while (start < chunk.length) {
        const newline = chunk.indexOf(10, start);
        const end = newline < 0 ? chunk.length : newline + 1;
        if (buffered.length + end - start > MAX_FRAME_BYTES) throw new Error("IPC frame exceeds 1 MiB");
        buffered = Buffer.concat([buffered, chunk.subarray(start, end)]);
        start = end;
        if (newline < 0) break;
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffered));
        buffered = Buffer.alloc(0);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid IPC message");
        const message = value as Message;
        if (message.version !== 1 || typeof message.launchId !== "string" || typeof message.kind !== "string") throw new Error("Invalid IPC envelope");
        receive(message);
        if (ended) break;
      }
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  });
  return {
    send(message: Message) {
      if (ended || socket.destroyed) throw new Error("IPC closed");
      socket.write(encodeFrame(message));
    },
    close: () => fail(new Error("IPC closed")),
  };
}
