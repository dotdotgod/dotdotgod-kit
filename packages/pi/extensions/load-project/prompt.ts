import type { LoadSnapshotRunResult } from "./cli.ts";
import type { ProjectMemorySnapshot } from "./snapshot.ts";

interface LoadSnapshotLike {
	commandGuidance?: {
		source?: string;
		packageManager?: string;
		install?: string | null;
		validate?: string;
		loadSnapshot?: string;
		index?: string;
		status?: string;
		verify?: string | null;
	};
	cache?: {
		status?: string;
		ok?: boolean;
		indexedFiles?: number;
		currentFiles?: number;
		staleFiles?: number;
		schemaOk?: boolean;
		archiveBodiesIncluded?: boolean;
		graph?: { nodes?: number; edges?: number };
	};
	metadata?: {
		cacheRefreshed?: boolean;
		previousStatus?: string;
		changedFiles?: number;
		fullRebuild?: boolean;
		indexedFiles?: number;
		indexSizeBytes?: number;
		archiveBodiesIncluded?: boolean;
	};
	graph?: {
		nodes?: number;
		edges?: number;
		byType?: Record<string, number>;
	};
	memoryPolicy?: {
		sharedAreas?: string[];
		localAreas?: string[];
		freshAreas?: string[];
		staleAreas?: string[];
	};
	memoryAreas?: {
		areas?: Array<{
			area?: string;
			label?: string;
			role?: string;
			priority?: number;
			files?: string[];
			count?: number;
			omitted?: number;
		}>;
		total?: number;
		method?: string;
	};
	communities?: {
		communities?: Array<{
			id?: string;
			label?: string;
			files?: string[];
			docs?: string[];
			commands?: string[];
			events?: string[];
			tests?: string[];
			nodeCount?: number;
			edgeCount?: number;
			omitted?: number;
		}>;
		omitted?: number;
		total?: number;
		method?: string;
		fallback?: boolean;
	};
	pinnedFiles?: {
		paths?: Array<{ path?: string; status?: string; pinnedBy?: string[] }>;
		omittedPaths?: number;
		bodies?: Array<{ path?: string; status?: string; reason?: string; truncated?: boolean; chars?: number; content?: string }>;
		omittedBodies?: number;
	};
	bounds?: {
		fullGraphIncluded?: boolean;
		archiveBodiesIncluded?: boolean;
		archiveMapIncluded?: boolean;
	};
}

function asLoadSnapshot(value: unknown): LoadSnapshotLike | undefined {
	return value && typeof value === "object" ? (value as LoadSnapshotLike) : undefined;
}

function formatCount(value: unknown): string {
	return typeof value === "number" ? value.toLocaleString() : "unknown";
}

function formatTopTypes(byType: Record<string, number> | undefined, limit = 6): string {
	if (!byType) return "unknown";
	const entries = Object.entries(byType)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit);
	return entries.length > 0 ? entries.map(([type, count]) => `${type}:${count}`).join(", ") : "none";
}

function truncateList(items: string[] | undefined, limit: number): string {
	if (!items || items.length === 0) return "none";
	const shown = items.slice(0, limit);
	const suffix = items.length > limit ? `, +${items.length - limit} more` : "";
	return `${shown.join(", ")}${suffix}`;
}

export type LoadPromptMode = "full" | "compact";

export interface LoadPromptOptions {
	mode?: LoadPromptMode;
}

function formatLabels(items: Array<{ label?: string; area?: string; id?: string }> | undefined, limit: number): string {
	if (!items || items.length === 0) return "none";
	const labels = items.slice(0, limit).map((item) => item.label ?? item.area ?? item.id ?? "unnamed");
	const suffix = items.length > limit ? `, +${items.length - limit} more` : "";
	return `${labels.join(", ")}${suffix}`;
}

export function extractDocsPathMentions(text: string): string[] {
	const matches = text.match(/docs\/[A-Za-z0-9_\-./]+/g) ?? [];
	const cleaned = matches.map((mention) => mention.replace(/[.,;:]+$/, "").replace(/\/+$/, ""));
	return [...new Set(cleaned)];
}

export function formatLoadSnapshotSummary(result: LoadSnapshotRunResult, options: LoadPromptOptions = {}): string {
	const communityLimit = 5;
	if (!result.ok) {
		return `Load snapshot: unavailable; using bounded fallback snapshot. Reason: ${result.error ?? "unknown error"}`;
	}

	const snapshot = asLoadSnapshot(result.data);
	if (!snapshot) return "Load snapshot: unavailable; using bounded fallback snapshot. Reason: invalid snapshot shape";

	const full = options.mode !== "compact";
	const cache = snapshot.cache;
	const metadata = snapshot.metadata;
	const graph = snapshot.graph ?? cache?.graph;
	const memoryPolicy = snapshot.memoryPolicy;
	const memoryAreas = snapshot.memoryAreas;
	const communities = snapshot.communities;
	const archiveBodiesIncluded = snapshot.bounds?.archiveBodiesIncluded ?? cache?.archiveBodiesIncluded ?? metadata?.archiveBodiesIncluded;
	const lines = [
		"Load snapshot:",
		`- Source: ${result.command ?? "dotdotgod load-snapshot"}`,
		`- Cache: status=${cache?.status ?? "unknown"}, ok=${String(cache?.ok ?? "unknown")}, indexedFiles=${formatCount(cache?.indexedFiles)}, staleFiles=${formatCount(cache?.staleFiles)}, schemaOk=${String(cache?.schemaOk ?? "unknown")}`,
		`- Refresh: cacheRefreshed=${String(metadata?.cacheRefreshed ?? false)}, changedFiles=${formatCount(metadata?.changedFiles)}, fullRebuild=${String(metadata?.fullRebuild ?? false)}`,
		`- Graph: nodes=${formatCount(graph?.nodes)}, edges=${formatCount(graph?.edges)}`,
		`- Bounds: fullGraphIncluded=${String(snapshot.bounds?.fullGraphIncluded ?? false)}, archiveBodiesIncluded=${String(archiveBodiesIncluded ?? "unknown")}, archiveMapIncluded=${String(snapshot.bounds?.archiveMapIncluded ?? "unknown")}`,
	];

	if (memoryPolicy) {
		lines.push(
			`- Memory policy: shared=${truncateList(memoryPolicy.sharedAreas, communityLimit)}; local=${truncateList(memoryPolicy.localAreas, communityLimit)}; fresh=${truncateList(memoryPolicy.freshAreas, communityLimit)}; stale=${truncateList(memoryPolicy.staleAreas, communityLimit)}`,
		);
	}
	lines.push(
		`- Memory areas: total=${formatCount(memoryAreas?.total)}, top=${formatLabels(memoryAreas?.areas, communityLimit)}`,
		`- Communities: total=${formatCount(communities?.total)}, omitted=${formatCount(communities?.omitted)}, top=${formatLabels(communities?.communities, communityLimit)}`,
	);

	const pinned = snapshot.pinnedFiles;
	if (pinned && ((pinned.paths?.length ?? 0) > 0 || (pinned.omittedPaths ?? 0) > 0)) {
		const labels = (pinned.paths ?? []).map((entry) =>
			entry.status && entry.status !== "present" ? `${entry.path ?? "unknown"} (${entry.status})` : entry.path ?? "unknown",
		);
		const omittedSuffix = (pinned.omittedPaths ?? 0) > 0 ? `; omitted=${pinned.omittedPaths}` : "";
		lines.push(`- Pinned files: ${truncateList(labels, 10)}${omittedSuffix}`);
	}

	for (const community of communities?.communities?.slice(0, communityLimit) ?? []) {
		const parts = [
			`files=${truncateList(community.files, 3)}`,
			`docs=${truncateList(community.docs, 3)}`,
		];
		if (community.commands && community.commands.length > 0) parts.push(`commands=${truncateList(community.commands, 4)}`);
		if (full && community.events && community.events.length > 0) parts.push(`events=${truncateList(community.events, 4)}`);
		parts.push(`tests=${truncateList(community.tests, 3)}`, `omitted=${formatCount(community.omitted)}`);
		lines.push(`  - ${community.label ?? community.id ?? "community"}: ${parts.join("; ")}`);
	}

	if (full) {
		lines.push(`- Debug: previousStatus=${metadata?.previousStatus ?? "none"}, topTypes=${formatTopTypes(snapshot.graph?.byType)}, communityMethod=${communities?.method ?? "unknown"}, communityFallback=${String(communities?.fallback ?? "unknown")}, memoryAreaMethod=${memoryAreas?.method ?? "unknown"}`);
		const guidance = snapshot.commandGuidance;
		if (guidance) {
			lines.push(
				`- Commands: source=${guidance.source ?? "unknown"}, packageManager=${guidance.packageManager ?? "unknown"}, validate=${guidance.validate ?? "unknown"}, loadSnapshot=${guidance.loadSnapshot ?? "unknown"}, index=${guidance.index ?? "unknown"}, status=${guidance.status ?? "unknown"}`,
			);
			if (guidance.install) lines.push(`  - Install CLI if needed: ${guidance.install}`);
			if (guidance.verify) lines.push(`  - Verify: ${guidance.verify}`);
		}

		for (const area of memoryAreas?.areas?.slice(0, communityLimit) ?? []) {
			lines.push(
				`  - ${area.label ?? area.area ?? "memory area"}: role=${area.role ?? "unknown"}; priority=${formatCount(area.priority)}; files=${truncateList(area.files, 3)}; omitted=${formatCount(area.omitted)}`,
			);
		}

		if (pinned && (pinned.bodies?.length ?? 0) > 0) {
			lines.push(`- Pinned file contents: ${pinned.bodies?.length} shown, ${formatCount(pinned.omittedBodies ?? 0)} omitted`);
			for (const body of pinned.bodies ?? []) {
				if (body.status === "present" || body.status === "truncated") {
					const detail = body.truncated ? `truncated to first ${body.content?.length ?? 0} of ${formatCount(body.chars)} chars` : `${formatCount(body.chars)} chars`;
					lines.push(`--- ${body.path ?? "unknown"} (${detail}) ---`, body.content ?? "");
				} else {
					lines.push(`--- ${body.path ?? "unknown"} (${body.status ?? "unknown"}${body.reason ? `: ${body.reason}` : ""}) ---`);
				}
			}
			lines.push("--- end pinned file contents ---");
		}
	}

	return lines.join("\n");
}

function formatDirectorySummary(
	snapshot: ProjectMemorySnapshot,
	args: string,
	hasLoadSnapshot: boolean,
	full: boolean,
): string {
	const docsPathMentions = extractDocsPathMentions(args);
	const fallbackMarkdownLimit = full ? 20 : 5;

	return snapshot.directories
		.map((directory) => {
			if (!directory.exists) return `- ${directory.path}: missing`;

			const mentionedSubtrees = docsPathMentions.filter(
				(mention) => mention === directory.path || mention.startsWith(`${directory.path}/`),
			);
			const targetedFiles = mentionedSubtrees.flatMap((mention) =>
				directory.markdownFiles.filter((file) => file === mention || file.startsWith(`${mention}/`) || file.startsWith(`${mention}.`)),
			);
			if (targetedFiles.length > 0) {
				const shown = [...new Set(targetedFiles)].slice(0, fallbackMarkdownLimit);
				return `- ${directory.path}: targeted subtree listing for ${mentionedSubtrees.join(", ")}\n${shown.map((file) => `  - ${file}`).join("\n")}`;
			}

			if (directory.readmeFiles.length > 0) {
				const shown = !full && directory.path === "docs/plan"
					? directory.readmeFiles.filter((file) => file === "docs/plan/README.md")
					: directory.readmeFiles;
				return `- ${directory.path}: README table of contents\n${shown.map((file) => `  - ${file}`).join("\n")}`;
			}

			if (hasLoadSnapshot) return `- ${directory.path}: available; no README.md index found, use snapshot routing and targeted reads`;
			if (directory.markdownFiles.length === 0) return `- ${directory.path}: no markdown files`;
			const shown = directory.markdownFiles.slice(0, fallbackMarkdownLimit);
			const omitted = directory.markdownFiles.length > shown.length ? `\n  - ... ${directory.markdownFiles.length - shown.length} more discovered files omitted; use README indexes before expanding` : "";
			return `- ${directory.path}: bounded fallback listing\n${shown.map((file) => `  - ${file}`).join("\n")}${omitted}`;
		})
		.join("\n");
}

export function buildLoadPrompt(
	cwd: string,
	args: string,
	snapshot: ProjectMemorySnapshot,
	loadSnapshot?: LoadSnapshotRunResult,
	options: LoadPromptOptions = {},
): string {
	const full = options.mode !== "compact";
	const present = snapshot.present.length > 0 ? snapshot.present.map((file) => `- ${file}`).join("\n") : "- none";
	const missing = snapshot.missing.length > 0 ? snapshot.missing.map((file) => `- ${file}`).join("\n") : "- none";
	const hasLoadSnapshot = loadSnapshot?.ok === true;
	const directorySummary = formatDirectorySummary(snapshot, args, hasLoadSnapshot, full);

	const mode = args.trim() ? `\nUser arguments: ${args.trim()}\n` : "";
	const loadSnapshotText = loadSnapshot ? `\n${formatLoadSnapshotSummary(loadSnapshot, options)}\n` : "";
	const responseShape = full
		? `Response format:\n- Project summary\n- Key working rules\n- Available commands and verification methods\n- Documentation map\n- Active plans\n- Relevant archive notes when requested or directly relevant\n- Open TODO/TBD items or questions to clarify`
		: `Response format:\n- Compact project-memory status: what is available, stale, missing, or newly refreshed\n- Relevant docs map: only the docs areas or README indexes likely needed for the current request\n- Active plan hints: active plan paths only when relevant\n- Next recommended reads: a short, bounded list; say when no further reads are needed`;

	return `Load the dotdotgod project memory in ${full ? "full" : "compact"} mode.${mode}
Current working directory: ${cwd}
${loadSnapshotText}
Detected memory files:
${present}

Missing baseline files:
${missing}

Documentation directory summary:
${directorySummary}

Instructions:
1. Use the Load snapshot section first when present. Treat it as the bounded project-memory map for cache status, graph size, memory policy, top memory areas/communities, and archive inclusion policy.
2. Use only read-only tools such as read, ls, grep, and find to inspect project memory files.
3. Start with AGENTS.md, README.md, and docs/README.md only when they are not already clear from the loaded context.
4. Treat the documentation directory summary as a book-like table of contents built from README.md indexes. Expand a specific docs subtree only when the user request, a graph community, a memory area, or a README route identifies it.
5. Inspect docs/spec, docs/arch, and docs/test selectively based on the user request, the load snapshot communities, and README indexes. Do not re-scan every listed file unless the task needs a full refresh.
6. Follow README.md indexes, including domain directories such as docs/<area>/<domain>/README.md and expanded convention directories such as docs/arch/conventions/README.md.
7. For docs/plan, list entries first and selectively read only the relevant README.md or markdown files.
8. For docs/archive, do not scan it as part of the documentation directory summary. Use docs/archive/README.md as the history map, and use targeted archive paths only when the user request or current task makes completed plans/reports relevant.
9. In compact mode, do not restate stable project background that is already clear from the loaded context. Prefer deltas, routing hints, and next reads. Full mode is the default for explicit manual loads; compact mode is selected by the compact load command or automatic prompt-injected refreshes.

${responseShape}

Do not modify files. Only load and summarize project memory.`;
}
