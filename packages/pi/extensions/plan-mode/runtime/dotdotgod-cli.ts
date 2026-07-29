import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { buildDotdotgodCliCandidates } from "../../shared/dotdotgod-cli.ts";
import { formatCompactImpactSummary, normalizeImpactPath, shouldTrackImpactPath } from "../impact.ts";

export interface PlanCliCommandResult {
	ok: boolean;
	label?: string;
	data?: unknown;
	stdout?: string;
	error?: string;
}

export function runDotdotgodCli(cwd: string, args: string[]): PlanCliCommandResult {
	const candidates = buildDotdotgodCliCandidates(cwd, args);

	const errors: string[] = [];
	for (const candidate of candidates) {
		const result = spawnSync(candidate.command, candidate.args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
			timeout: 10_000,
			maxBuffer: 1024 * 1024,
		});
		const stdout = result.stdout?.trim() ?? "";
		if (stdout) {
			try {
				return { ok: true, label: candidate.label, data: JSON.parse(stdout), stdout };
			} catch {
				if (result.status === 0) return { ok: true, label: candidate.label, stdout };
			}
		}
		errors.push(`${candidate.label}: ${result.error?.message ?? result.stderr?.trim() ?? `exit ${String(result.status)}`}`);
	}

	return { ok: false, error: errors.join("; ") };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

export function formatPlanCliContextSummary(validate: PlanCliCommandResult, impacts: Array<{ path: string; result: PlanCliCommandResult }>): string {
	const lines = ["dotdotgod CLI planning context:"];
	if (!validate.ok) return "";
	const validateData = asRecord(validate.data);
	const errors = Array.isArray(validateData?.errors) ? validateData.errors.length : 0;
	lines.push(`- Validate: source=${validate.label ?? "dotdotgod"}; ok=${String(validateData?.ok ?? true)}; errors=${errors}`);


	for (const impact of impacts) {
		lines.push(impact.result.ok ? formatCompactImpactSummary(impact.path, impact.result.data) : `- Impact: skipped or unavailable for ${impact.path}.`);
	}
	return lines.join("\n");
}

export function fingerprintPath(cwd: string, path: string): string | undefined {
	try {
		const stat = statSync(resolve(cwd, path));
		return `${stat.size}:${Math.round(stat.mtimeMs)}`;
	} catch {
		return undefined;
	}
}

export function collectGitChangedPaths(cwd: string): string[] {
	const commands = [
		["diff", "--name-only"],
		["diff", "--cached", "--name-only"],
		["ls-files", "--others", "--exclude-standard"],
	];
	const paths = new Set<string>();
	for (const args of commands) {
		const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5_000 });
		if (result.status !== 0) continue;
		for (const line of (result.stdout ?? "").split(/\r?\n/)) {
			const normalized = normalizeImpactPath(cwd, line);
			if (normalized && shouldTrackImpactPath(normalized)) paths.add(normalized);
		}
	}
	return [...paths];
}
