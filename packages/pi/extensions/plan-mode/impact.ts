import { isAbsolute, relative, resolve } from "node:path";
import { getDotdotgodCliArgs } from "./tools.ts";

function formatCandidatePath(candidate: Record<string, unknown>): string | undefined {
	const path = typeof candidate.path === "string" ? candidate.path : undefined;
	if (!path) return undefined;
	const title = typeof candidate.title === "string" && candidate.title ? `#${candidate.title}` : "";
	const score = typeof candidate.score === "number" ? ` score=${candidate.score}` : "";
	return `${path}${title}${score}`;
}

export function formatReferenceExpansionSummary(data: unknown, candidateLimit = 3, impactLimit = 3): string {
	const payload = data && typeof data === "object" ? (data as Record<string, unknown>) : undefined;
	const refs = Array.isArray(payload?.refs) ? payload.refs : [];
	if (refs.length === 0) return "";

	const lines = ["Reference expansion:"];
	for (const refValue of refs) {
		const ref = refValue && typeof refValue === "object" ? (refValue as Record<string, unknown>) : undefined;
		if (!ref) continue;
		const query = String(ref.query ?? ref.input ?? "unknown");
		const source = typeof ref.source === "string" ? ` ${ref.source}` : "";
		const confidence = typeof ref.confidence === "string" ? ` confidence=${ref.confidence}` : "";
		const ambiguous = ref.ambiguous === true ? " ambiguous" : "";
		const omitted = typeof ref.omitted === "number" && ref.omitted > 0 ? `; omitted=${ref.omitted}` : "";
		lines.push(`- ${query}:${source}${confidence}${ambiguous}${omitted}`);

		const candidates = Array.isArray(ref.candidates) ? ref.candidates : [];
		for (const candidateValue of candidates.slice(0, candidateLimit)) {
			const candidate = candidateValue && typeof candidateValue === "object" ? (candidateValue as Record<string, unknown>) : undefined;
			if (!candidate) continue;
			const formatted = formatCandidatePath(candidate);
			if (formatted) lines.push(`  - ${formatted}`);
		}

		const impact = ref.impact && typeof ref.impact === "object" ? (ref.impact as Record<string, unknown>) : undefined;
		const related = Array.isArray(impact?.related) ? impact.related : [];
		const impactPaths = related
			.slice(0, impactLimit)
			.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : undefined))
			.map((item) => (typeof item?.path === "string" ? item.path : undefined))
			.filter((path): path is string => Boolean(path));
		if (impactPaths.length > 0) lines.push(`  impact=${impactPaths.join(", ")}`);
	}
	return lines.length > 1 ? lines.join("\n") : "";
}

function impactRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function impactPathOf(item: Record<string, unknown>): string {
	return String(item.path ?? item.id ?? item.name ?? item.command ?? "unknown");
}

export function formatCompactImpactSummary(changedPath: string, payload: unknown, topLimit = 5): string {
	const data = impactRecord(payload);
	const impact = impactRecord(data?.impact);
	const groups = impactRecord(impact?.groups);
	if (!data || !impact || !groups) return `- Impact: skipped or unavailable for ${changedPath}.`;

	const groupCount = (name: string): number => {
		const items = impactRecord(groups[name])?.items;
		return Array.isArray(items) ? items.length : 0;
	};
	const related = Array.isArray(impact.related) ? impact.related : [];
	const topItems = related
		.filter((item): item is Record<string, unknown> => Boolean(impactRecord(item)) && impactPathOf(item as Record<string, unknown>) !== changedPath && impactPathOf(item as Record<string, unknown>) !== `file:${changedPath}`)
		.slice(0, topLimit)
		.map((item) => {
			const score = typeof item.impactScore === "number" ? ` score=${Math.round(item.impactScore * 10) / 10}` : "";
			const reasons = Array.isArray(item.reasons) ? item.reasons.slice(0, 3).map(String).join("+") : "";
			return `${impactPathOf(item)}${score}${reasons ? ` reasons=${reasons}` : ""}`;
		});
	const top = topItems.length > 0 ? `; top=${topItems.join(" | ")}` : "";
	return `- Impact: changed=${changedPath}; docs=${groupCount("docs")}; tests=${groupCount("tests")}; files=${groupCount("files")}; commands=${groupCount("commands")}; events=${groupCount("events")}${top}`;
}

export interface PendingImpactItem {
	path: string;
	fingerprint?: string;
	reason: "edit" | "write" | "git-diff";
	touchedAt: string;
}

export interface ImpactCheckRecord {
	path: string;
	fingerprint?: string;
	ranAt: string;
	source: "tool" | "command" | "bash";
	summary?: string;
}

export function normalizeImpactPath(cwd: string, path: string): string | undefined {
	const raw = path.replace(/^@/, "").replace(/\\/g, "/").trim();
	if (!raw || raw.includes("\0") || /[;&|<>`$\n\r]/.test(raw)) return undefined;
	const absolute = isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw.replace(/^\.\//, ""));
	const relativePath = relative(resolve(cwd), absolute).replace(/\\/g, "/");
	if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return undefined;
	return relativePath.replace(/\/+/g, "/");
}

export function shouldTrackImpactPath(path: string): boolean {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	if (!normalized || normalized.startsWith("docs/plan/") || normalized.startsWith("docs/archive/")) return false;
	if (normalized.startsWith(".dotdotgod/") || normalized.startsWith("node_modules/") || normalized.startsWith("dist/") || normalized.startsWith("build/") || normalized.startsWith("coverage/")) return false;
	return /[.][A-Za-z0-9]+$/.test(normalized);
}

export function upsertPendingImpact(items: readonly PendingImpactItem[], item: PendingImpactItem, maxItems = 20): PendingImpactItem[] {
	const next = items.filter((existing) => existing.path !== item.path);
	next.push(item);
	return next.slice(-maxItems);
}

export function clearPendingImpactForPath(items: readonly PendingImpactItem[], path: string): PendingImpactItem[] {
	return items.filter((item) => item.path !== path);
}

export function mergeImpactCheckPaths(cwd: string, pendingItems: readonly PendingImpactItem[], gitChangedPaths: readonly string[]): string[] {
	const paths = [...pendingItems.map((item) => item.path), ...gitChangedPaths];
	return [...new Set(paths.map((path) => normalizeImpactPath(cwd, path)).filter((path): path is string => Boolean(path)).filter(shouldTrackImpactPath))];
}

export function pendingImpactSummary(items: readonly PendingImpactItem[], limit = 8): string {
	const shown = items.slice(0, limit).map((item) => `- ${item.path}`);
	const omitted = items.length > limit ? [`- ... ${items.length - limit} more`] : [];
	return [...shown, ...omitted].join("\n");
}

export function getChangedPathFromDotdotgodImpactCommand(command: string): string | undefined {
	const args = getDotdotgodCliArgs(command);
	if (!args || args[0] !== "graph" || args[1] !== "impact") return undefined;
	for (let i = 2; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--changed") return args[i + 1];
		if (arg?.startsWith("--changed=")) return arg.slice("--changed=".length);
	}
	return undefined;
}

export function isCommitLikeCommand(command: string): boolean {
	return /^\s*git\s+(commit|push)\b/i.test(command) || /^\s*(npm|pnpm|yarn)\s+publish\b/i.test(command);
}

export function isBroadVerificationCommand(command: string): boolean {
	return /^\s*(pnpm\s+run\s+verify|npm\s+test|pnpm\s+test|yarn\s+test|pytest\b|\.\/run-tests\.sh\b)/i.test(command);
}

export function formatExpandableToolOutput(text: string, expanded: boolean, expandHint: string, maxLines = 10): string {
	if (expanded) return text;
	const lines = text.split(/\r?\n/);
	if (lines.length <= maxLines) return text;
	const omitted = lines.length - maxLines;
	return [...lines.slice(0, maxLines), `... (${omitted} more lines, ${expandHint})`].join("\n");
}

export function formatMultiImpactSummary(results: Array<{ path: string; data?: unknown; error?: string; summary?: string }>, topLimit = 5): string {
	const structuredSummaries = results.map((result) => result.summary?.trim()).filter((summary): summary is string => Boolean(summary));
	if (structuredSummaries.length === results.length && results.every((result) => !result.error)) return structuredSummaries.join("\n---\n");

	const lines = ["dotdotgod graph impact summary:"];
	for (const result of results) {
		if (result.error) lines.push(`- Impact: failed for ${result.path}: ${result.error}`);
		else if (result.summary?.trim()) lines.push(result.summary.trim());
		else lines.push(formatCompactImpactSummary(result.path, result.data, topLimit));
	}
	return lines.join("\n");
}

