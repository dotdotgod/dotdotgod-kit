import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdirSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";

export interface ContextMetricEvent {
	event: string;
	cwd: string;
	data?: Record<string, unknown>;
}

function git(cwd: string, command: string): string | undefined {
	try {
		return execSync(`git ${command}`, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

function defaultMetricsPath(cwd: string): string {
	const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
	return join(cwd, "docs", "archive", "report", "context-metrics", `${stamp}.jsonl`);
}

export function isContextDebugEnabled(getFlag: (name: string) => unknown): boolean {
	return getFlag("dd-context-debug") === true;
}

export function recordContextMetric(
	ctx: ExtensionContext,
	getFlag: (name: string) => unknown,
	event: string,
	data: Record<string, unknown> = {},
): void {
	if (!isContextDebugEnabled(getFlag)) return;

	const configuredPath = getFlag("dd-context-debug-output");
	const outputPath = typeof configuredPath === "string" && configuredPath.trim()
		? configuredPath.trim()
		: defaultMetricsPath(ctx.cwd);
	const absolutePath = outputPath.startsWith("/") ? outputPath : join(ctx.cwd, outputPath);
	const usage = ctx.getContextUsage();
	const entry = {
		event,
		timestamp: new Date().toISOString(),
		cwd: ctx.cwd,
		usage: usage
			? { tokens: usage.tokens ?? null, contextWindow: usage.contextWindow ?? null, percent: usage.percent ?? null }
			: null,
		git: {
			commit: git(ctx.cwd, "rev-parse --short HEAD") ?? null,
			dirty: Boolean(git(ctx.cwd, "status --short")),
		},
		...data,
	};

	try {
		mkdirSync(dirname(absolutePath), { recursive: true });
		appendFileSync(absolutePath, `${JSON.stringify(entry)}\n`);
	} catch (error) {
		if (ctx.hasUI) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Context metrics debug write failed: ${message}`, "warning");
		}
	}
}
