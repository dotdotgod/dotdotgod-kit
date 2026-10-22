import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { AgentToolCallOutcome } from "@earendil-works/pi-agent-core";

export const MCP_PREFIX = "mcp__dotdotgod_context__";
export const mcpTool = (name: string): string => `${MCP_PREFIX}${name}`;
export const isMcpTool = (name: string): boolean => name.startsWith(MCP_PREFIX);

export function unwrapMcpOutcome(result: AgentToolCallOutcome) {
  const envelope = result.result.details as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;
  const structured = result.result.structuredContent as { structuredContent?: Record<string, unknown>; isError?: boolean } | undefined;
  const details = structured?.structuredContent ?? envelope?.structuredContent ?? result.result.structuredContent ?? result.result.details;
  return { ...result.result, isError: result.isError || structured?.isError === true || envelope?.isError === true, details, structuredContent: details };
}

export async function callProjectTool(ctx: ExtensionToolContext, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
  return unwrapMcpOutcome(await ctx.executeTool(mcpTool(name), args, signal ? { signal } : {}));
}
