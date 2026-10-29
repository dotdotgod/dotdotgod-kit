import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { AgentToolCallOutcome } from "@earendil-works/pi-agent-core";
import type { JsonValue } from "@earendil-works/pi-ai";

export const MCP_PREFIX = "mcp__dotdotgod_context__";
export const mcpTool = (name: string): string => `${MCP_PREFIX}${name}`;
export const isMcpTool = (name: string): boolean => name.startsWith(MCP_PREFIX);

export function unwrapMcpOutcome(result: AgentToolCallOutcome) {
  const rawDetails: unknown = result.result.details;
  const rawStructured = result.result.structuredContent;
  const envelope = isRecord(rawDetails) ? rawDetails : undefined;
  const structured = isRecord(rawStructured) ? rawStructured : undefined;
  const details: unknown = structured?.structuredContent ?? envelope?.structuredContent ?? rawStructured ?? rawDetails;
  const structuredContent = isJsonValue(details) ? details : rawStructured;
  return { ...result.result, isError: result.isError || structured?.isError === true || envelope?.isError === true, details,
    ...(structuredContent !== undefined ? { structuredContent } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isJsonValue(value: unknown, seen = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (value === undefined || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item: unknown) => isJsonValue(item, seen))
    : isRecord(value) && Object.values(value).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

export async function callProjectTool(ctx: ExtensionToolContext, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  return unwrapMcpOutcome(await ctx.executeTool(mcpTool(name), args, signal ? { signal } : {}));
}
