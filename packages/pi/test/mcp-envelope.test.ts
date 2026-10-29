import assert from "node:assert/strict";
import test from "node:test";
import type { AgentToolCallOutcome } from "@earendil-works/pi-agent-core";
import { unwrapMcpOutcome } from "../extensions/shared/mcp.ts";

test("MCP unwrap validates envelopes and preserves fallback precedence", () => {
  const unwrap = (details: unknown, structuredContent?: unknown, isError = false) =>
    unwrapMcpOutcome({ result: { content: [], details, structuredContent }, isError } as unknown as AgentToolCallOutcome);
  const first = { ok: true };
  const second = { ok: false };
  assert.equal(unwrap({ structuredContent: second }, { structuredContent: first }).details, first);
  assert.equal(unwrap({ structuredContent: second }).details, second);
  assert.equal(unwrap(second, first).details, first);
  assert.equal(unwrap(first).details, first);
  assert.equal(unwrap("plain", null).details, "plain");
  assert.deepEqual(unwrap([1, 2]).details, [1, 2]);
  assert.equal(unwrap({ isError: true }).isError, true);
  assert.equal(unwrap(null, { isError: true }).isError, true);
  assert.equal(unwrap(null, undefined, true).isError, true);
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(unwrap(cyclic).details, cyclic);
  assert.equal(unwrap(cyclic).structuredContent, undefined);
});
