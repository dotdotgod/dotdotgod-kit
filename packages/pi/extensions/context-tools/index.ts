import { createRequire } from "node:module";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isMcpTool, mcpTool } from "../shared/mcp.ts";

const require = createRequire(import.meta.url);

export default function contextTools(pi: ExtensionAPI): void {
  const resumed = new Map<string, string>();
  // Pi owns MCP startup, discovery, reconnect, cancellation and shutdown.
  // There are no native forwarding aliases or duplicated schemas.
  pi.registerMcpServer("dotdotgod_context", {
    command: process.execPath,
    args: [require.resolve("@dotdotgod/context/bin/server.mjs")],
    exposure: "codemode",
    toolExposure: { project_impact: "direct", impact_status: "direct" },
    timeout: 660,
    description: "Dotdotgod project memory, execution, indexing and bounded retrieval. Discover exact MCP tool names. For unknown output size use execute commands arrays with outputMode auto. MCP results are envelopes: inspect isError and structuredContent, then every command status and indexed.id. Search fail OR error OR reason with a source ID; empty results do not prove success. Report an unsupported cause as unverified. Never bypass host permissions or Plan Mode; do not use these tools to bypass a blocked command.",
  });
  pi.on("tool_call", (event, ctx) => {
    if (!isMcpTool(event.toolName)) return;
    const host = ctx.sessionManager.getSessionId();
    const project = event.toolName.startsWith(mcpTool("project_")) || event.toolName === mcpTool("impact_status");
    (event.input as Record<string, unknown>).contextSessionId = project ? host : resumed.get(host) ?? host;
  });
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== mcpTool("session_resume") || event.isError) return;
    const value = event.structuredContent as { structuredContent?: { ok?: boolean } } | undefined;
    if (value?.structuredContent?.ok) resumed.set(ctx.sessionManager.getSessionId(), String(event.input.sessionId));
  });
}
