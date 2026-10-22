import { isAbsolute, relative, resolve } from "node:path";
import { isActivePlanPath, isArchivePath } from "./runtime/paths.ts";

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
	if (!normalized || isActivePlanPath(normalized) || isArchivePath(normalized)) return false;
	if (normalized.startsWith(".dotdotgod/") || normalized.startsWith("node_modules/") || normalized.startsWith("dist/") || normalized.startsWith("build/") || normalized.startsWith("coverage/")) return false;
	return /[.][A-Za-z0-9]+$/.test(normalized);
}
