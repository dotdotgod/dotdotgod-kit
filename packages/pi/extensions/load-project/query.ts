import { spawnSync } from "node:child_process";
import { buildDotdotgodCliCandidates } from "../shared/dotdotgod-cli.ts";
import type { QueryRunResult } from "./prompt.ts";

export function runDotdotgodQuery(cwd: string, query: string): QueryRunResult {
	const errors: string[] = [];
	for (const candidate of buildDotdotgodCliCandidates(cwd, ["query", cwd, query, "--limit", "30", "--json"])) {
		const result = spawnSync(candidate.command, candidate.args, { cwd, encoding: "utf8", timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
		if (result.status === 0) {
			try {
				const data = JSON.parse(result.stdout) as NonNullable<QueryRunResult["data"]>;
				return { ok: true, command: candidate.label, data };
			} catch (error) {
				errors.push(`${candidate.label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
			}
		} else {
			const detail = result.error?.message ?? (result.stderr.trim() || `exit ${String(result.status)}`);
			errors.push(`${candidate.label}: ${detail}`);
		}
	}
	return { ok: false, error: errors.join("; ") || "dotdotgod query failed" };
}
