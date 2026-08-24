import { spawnSync } from "node:child_process";
import { buildDotdotgodCliCandidates } from "../shared/dotdotgod-cli.ts";

export interface DocumentationMapData {
	ok: true;
	root: string;
	documentationRoot: string;
	depth: number;
	exclude: string[];
	paths: string[];
	tree: string;
}

export interface DocumentationMapRunResult {
	ok: boolean;
	command?: string;
	error?: string;
	data?: DocumentationMapData;
}

function isDocumentationMapData(value: unknown, depth: number): value is DocumentationMapData {
	if (!value || typeof value !== "object") return false;
	const data = value as Partial<DocumentationMapData>;
	return data.ok === true
		&& typeof data.root === "string"
		&& typeof data.documentationRoot === "string"
		&& data.depth === depth
		&& Array.isArray(data.exclude) && data.exclude.every((item) => typeof item === "string")
		&& Array.isArray(data.paths) && data.paths.every((item) => typeof item === "string")
		&& typeof data.tree === "string";
}

export function runDotdotgodMap(cwd: string, depth: number): DocumentationMapRunResult {
	const errors: string[] = [];
	for (const candidate of buildDotdotgodCliCandidates(cwd, ["map", cwd, "--depth", String(depth), "--json"])) {
		const result = spawnSync(candidate.command, candidate.args, {
			cwd,
			encoding: "utf8",
			timeout: 30_000,
			maxBuffer: 10 * 1024 * 1024,
		});
		if (result.status === 0) {
			try {
				const data: unknown = JSON.parse(result.stdout);
				if (isDocumentationMapData(data, depth)) return { ok: true, command: candidate.label, data };
				errors.push(`${candidate.label}: invalid map JSON`);
			} catch (error) {
				errors.push(`${candidate.label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
			}
		} else {
			const detail = result.error?.message ?? (result.stderr.trim() || `exit ${String(result.status)}`);
			errors.push(`${candidate.label}: ${detail}`);
		}
	}
	return { ok: false, error: errors.join("; ") || "dotdotgod map failed" };
}
