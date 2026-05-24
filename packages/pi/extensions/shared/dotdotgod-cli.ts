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

export function resolvePiPackageRoot(): string {
	return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

export function resolveLocalWorkspaceCli(cwd: string): string | undefined {
	const localCli = join(cwd, "packages/cli/bin/dotdotgod.mjs");
	return existsSync(localCli) ? localCli : undefined;
}

export function resolveBundledCli(packageRoot = resolvePiPackageRoot()): string | undefined {
	const bundledCli = join(packageRoot, "node_modules/@dotdotgod/cli/bin/dotdotgod.mjs");
	return existsSync(bundledCli) ? bundledCli : undefined;
}

export function buildDotdotgodCliCandidates(cwd: string, args: string[], options: DotdotgodCliCandidateOptions = {}): DotdotgodCliCandidate[] {
	const candidates: DotdotgodCliCandidate[] = [];
	const localCli = resolveLocalWorkspaceCli(cwd);
	if (localCli) candidates.push({ command: process.execPath, args: [localCli, ...args], label: "local workspace CLI" });

	const bundledCli = resolveBundledCli(options.packageRoot);
	if (bundledCli && bundledCli !== localCli) candidates.push({ command: process.execPath, args: [bundledCli, ...args], label: "bundled @dotdotgod/cli" });

	if (options.includeGlobal !== false) candidates.push({ command: "dotdotgod", args, label: "dotdotgod" });
	return candidates;
}
