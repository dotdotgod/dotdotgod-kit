import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DotdotgodCliCandidate {
	command: string;
	args: string[];
	label: string;
}

export interface DotdotgodCliCandidateOptions {
	packageRoot?: string;
	includeGlobal?: boolean;
}

export function buildDotdotgodCliCandidates(cwd: string, args: string[], options: DotdotgodCliCandidateOptions = {}): DotdotgodCliCandidate[] {
	const candidates: DotdotgodCliCandidate[] = [];
	const localCliPath = join(cwd, "packages/cli/bin/dotdotgod.mjs");
	const localCli = existsSync(localCliPath) ? localCliPath : undefined;
	if (localCli) candidates.push({ command: process.execPath, args: [localCli, ...args], label: "local workspace CLI" });

	const packageRoot = options.packageRoot ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const bundledCliPath = join(packageRoot, "node_modules/@dotdotgod/cli/bin/dotdotgod.mjs");
	const bundledCli = existsSync(bundledCliPath) ? bundledCliPath : undefined;
	if (bundledCli && bundledCli !== localCli) candidates.push({ command: process.execPath, args: [bundledCli, ...args], label: "bundled @dotdotgod/cli" });

	if (options.includeGlobal !== false) candidates.push({ command: "dotdotgod", args, label: "dotdotgod" });
	return candidates;
}
