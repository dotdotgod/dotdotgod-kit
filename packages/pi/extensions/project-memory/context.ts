import { lstatSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

export const PROJECT_MEMORY_LOAD_TOOL = "project_memory_load";
export const PROJECT_MEMORY_CONTEXT_TYPE = "project-memory-context";
export const PROJECT_MEMORY_EXPLICIT_LOAD_MARKER = "[PROJECT MEMORY EXPLICIT LOAD]";

export function isInitializedProject(root: string): boolean {
	try {
		if (lstatSync(join(root, "dotdotgod.config.json"), { throwIfNoEntry: false })?.isFile()) return true;
	} catch { /* check .dotdotgod */ }
	try {
		return lstatSync(join(root, ".dotdotgod"), { throwIfNoEntry: false })?.isDirectory() === true;
	} catch { return false; }
}

export function formatProjectMemoryToolOutput(text: string, expanded: boolean, expandHint: string): string {
	if (expanded) return text;
	const lines = text.split(/\r?\n/);
	if (lines.length <= 3) return text;
	return [lines[0], lines[1], `... (${lines.length - 2} more lines, ${expandHint})`].join("\n");
}

interface HostCompletionRequest {
	model?: string;
	messages: [{ role: "system"; content: string }, { role: "user"; content: string }];
	signal: AbortSignal;
}

export async function hostComplete(ctx: ExtensionContext, request: HostCompletionRequest): Promise<string> {
	const registry = ctx.modelRegistry;
	const id = request.model;
	const slash = id?.indexOf("/") ?? -1;
	const model = id
		? (slash > 0 ? registry.find(id.slice(0, slash), id.slice(slash + 1)) : undefined)
			?? registry.getAvailable().find(candidate => candidate.id === id)
		: ctx.model;
	if (!model || !registry.hasConfiguredAuth(model)) {
		throw Object.assign(new Error("Host model or authentication unavailable."), { errorCode: "host_auth_unavailable" });
	}

	const [system, user] = request.messages;
	const response = await registry.streamSimple(model, {
		systemPrompt: system.content,
		messages: [{ role: "user", content: [{ type: "text", text: user.content }], timestamp: Date.now() }],
	}, { signal: request.signal, maxTokens: 200, temperature: 0 }).result();
	if (response.stopReason === "error" || response.stopReason === "aborted") throw new Error("Host model request failed.");
	return response.content.map(part => part.type === "text" ? part.text : "").join("");
}
