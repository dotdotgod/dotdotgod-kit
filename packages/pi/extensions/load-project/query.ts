import { spawnSync } from "node:child_process";
import { buildDotdotgodCliCandidates } from "../shared/dotdotgod-cli.ts";
import type { QueryRunResult } from "./prompt.ts";

// Only surface the CLI's supported error field, never arbitrary stdout or JSON dumps.
export function queryFailureDetail(result: { error?: { message: string }; stdout: string; stderr: string; status: number | null }): string {
	let detail = result.error?.message;
	if (!detail && result.stdout.length <= 64 * 1024) {
		try {
			const payload = JSON.parse(result.stdout);
			if (payload?.ok === false && typeof payload.error === "string" && payload.error.trim()) detail = payload.error.trim();
		} catch { /* Non-JSON failures use stderr or exit status below. */ }
	}
	detail ??= result.stderr.trim() || `exit ${String(result.status)}`;
	return detail.length > 1000 ? `${detail.slice(0, 1000)}…` : detail;
}

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
			const detail = queryFailureDetail(result);
			errors.push(`${candidate.label}: ${detail}`);
		}
	}
	return { ok: false, error: errors.join("; ") || "dotdotgod query failed" };
}
