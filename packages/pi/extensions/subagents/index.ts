import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function hasSubagentTool(pi: ExtensionAPI): boolean {
	return pi.getAllTools().some((tool) => tool.name === "subagent");
}

export default async function dotdotgodSubagents(pi: ExtensionAPI): Promise<void> {
	if (hasSubagentTool(pi)) return;
	const modulePath = ["..", "..", "node_modules", "pi-subagents", "src", "extension", "index.ts"].join("/");
	const subagentsModule = await import(modulePath) as { default?: (api: ExtensionAPI) => void | Promise<void> };
	const registerSubagents = subagentsModule.default;
	if (typeof registerSubagents !== "function") {
		throw new Error("pi-subagents extension does not export a default factory function");
	}
	try {
		await registerSubagents(pi);
	} catch (error) {
		if (hasSubagentTool(pi)) return;
		throw error;
	}
}
