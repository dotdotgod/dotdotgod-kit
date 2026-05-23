import * as path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const require = createRequire(import.meta.url);
let attempted = false;
let registered = false;

function resolveSubagentsPackageRoot(): string {
	return path.dirname(require.resolve("pi-subagents/package.json"));
}

function hasSubagentTool(pi: ExtensionAPI): boolean {
	return pi.getAllTools().some((tool) => tool.name === "subagent");
}

async function registerPackageLocalSubagents(pi: ExtensionAPI): Promise<void> {
	if (registered) return;
	if (hasSubagentTool(pi)) {
		registered = true;
		return;
	}
	const extensionUrl = pathToFileURL(path.join(resolveSubagentsPackageRoot(), "src", "extension", "index.ts")).href;
	const subagentsModule = await import(extensionUrl) as { default?: (api: ExtensionAPI) => void | Promise<void> };
	const registerSubagents = subagentsModule.default;
	if (typeof registerSubagents !== "function") {
		throw new Error("pi-subagents extension does not export a default factory function");
	}
	try {
		await registerSubagents(pi);
		registered = true;
	} catch (error) {
		if (hasSubagentTool(pi)) {
			registered = true;
			return;
		}
		throw error;
	}
}

export default function dotdotgodSubagents(pi: ExtensionAPI): void {
	pi.on("session_start", async () => {
		if (attempted || registered) return;
		attempted = true;
		await registerPackageLocalSubagents(pi);
	});

	pi.on("resources_discover", () => {
		const packageRoot = resolveSubagentsPackageRoot();
		return {
			skillPaths: [path.join(packageRoot, "skills")],
			promptPaths: [path.join(packageRoot, "prompts")],
		};
	});
}
