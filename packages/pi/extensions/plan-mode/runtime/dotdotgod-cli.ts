import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { formatCompactImpactSummary, normalizeImpactPath, shouldTrackImpactPath } from "../utils.ts";

export interface PlanCliCommandResult {
	ok: boolean;
	label?: string;
	data?: unknown;
	stdout?: string;
	error?: string;
}

export function runDotdotgodCli(cwd: string, args: string[]): PlanCliCommandResult {
	const localCli = join(cwd, "packages/cli/bin/dotdotgod.mjs");
	const candidates = existsSync(localCli)
		? [
			{ command: process.execPath, args: [localCli, ...args], label: "local workspace CLI" },
			{ command: "dotdotgod", args, label: "dotdotgod" },
		]
		: [{ command: "dotdotgod", args, label: "dotdotgod" }];

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

export function formatPlanCliContextSummary(validate: PlanCliCommandResult, snapshot: PlanCliCommandResult, impacts: Array<{ path: string; result: PlanCliCommandResult }>): string {
	const lines = ["dotdotgod CLI planning context:"];
	if (!validate.ok) return "";
	const validateData = asRecord(validate.data);
	const errors = Array.isArray(validateData?.errors) ? validateData.errors.length : 0;
	lines.push(`- Validate: source=${validate.label ?? "dotdotgod"}; ok=${String(validateData?.ok ?? true)}; errors=${errors}`);

	const snapshotData = asRecord(snapshot.data);
	const cache = asRecord(snapshotData?.cache);
	const metadata = asRecord(snapshotData?.metadata);
	const graph = asRecord(snapshotData?.graph) ?? asRecord(cache?.graph);
	if (snapshot.ok && snapshotData) {
		lines.push(`- Index: status=${String(cache?.status ?? "unknown")}; schema=${String(cache?.schemaVersion ?? metadata?.schemaVersion ?? "unknown")}; indexedFiles=${String(cache?.indexedFiles ?? "unknown")}; graph=${String(graph?.nodes ?? "unknown")} nodes/${String(graph?.edges ?? "unknown")} edges; refreshed=${String(metadata?.cacheRefreshed ?? false)}; reason=${String(metadata?.refreshReason ?? "unknown")}`);
	}

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
