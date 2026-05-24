import { execFileSync } from "node:child_process";
import { buildDotdotgodCliCandidates } from "../dotdotgod-cli.ts";

export interface LoadSnapshotRunResult {
	ok: boolean;
	command?: string;
	data?: unknown;
	error?: string;
}

function parseLoadSnapshotJson(stdout: string): unknown {
	const trimmed = stdout.trim();
	if (!trimmed) throw new Error("load-snapshot returned empty output");
	return JSON.parse(trimmed) as unknown;
}

export function runDotdotgodLoadSnapshot(cwd: string, timeoutMs = 10_000): LoadSnapshotRunResult {
	const candidates = buildDotdotgodCliCandidates(cwd, ["load-snapshot", cwd, "--json"]);

	const errors: string[] = [];
	for (const candidate of candidates) {
		try {
			const stdout = execFileSync(candidate.command, candidate.args, {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
			});
			return { ok: true, command: candidate.label, data: parseLoadSnapshotJson(stdout) };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${candidate.label}: ${message}`);
		}
	}

	return { ok: false, error: errors.join("; ") || "dotdotgod load-snapshot failed" };
}

