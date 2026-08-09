import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";

export const PROJECT_MEMORY_LOAD_TOOL = "dotdotgod_project_load";
export const PROJECT_MEMORY_CONTEXT_TYPE = "project-memory-context";
export const PROJECT_MEMORY_EXPLICIT_LOAD_MARKER = "[PROJECT MEMORY EXPLICIT LOAD]";

export const REQUIRED_PROJECT_MEMORY_MARKERS = [
	"AGENTS.md",
	"README.md",
	"docs/README.md",
	"docs/spec/README.md",
	"docs/arch/README.md",
	"docs/test/README.md",
	"docs/plan/README.md",
] as const;

export interface ProjectMemoryContextCoverage {
	markers: string[];
	areas: string[];
	hasCompactionSummary: boolean;
}

export interface ProjectMemoryLoadDecisionInput {
	latestRequest?: string;
	contextText?: string;
	hasRecentProjectMemoryLoad?: boolean;
}

interface ProjectMemoryEntry {
	type?: string;
	customType?: string;
	message?: AgentMessage;
	data?: unknown;
}

export interface ProjectMemoryLoadDecision {
	loadNeeded: boolean;
	reason?: "user-opt-out" | "recent-load" | "missing-baseline" | "compaction-missing-markers";
	missingMarkers?: string[];
	areas?: string[];
}

export function collectProjectMemoryContextCoverage(contextText: string | undefined): ProjectMemoryContextCoverage {
	const text = contextText ?? "";
	const markers = REQUIRED_PROJECT_MEMORY_MARKERS.filter((marker) => text.includes(marker));
	const areas = [
		["spec", /docs\/spec\/(?!README\.md)/],
		["arch", /docs\/arch\/(?!README\.md)/],
		["test", /docs\/test\/(?!README\.md)/],
		["plan", /docs\/plan\/(?!README\.md)/],
		["archive", /docs\/archive\/README\.md/],
	]
		.filter(([, pattern]) => (pattern as RegExp).test(text))
		.map(([area]) => area as string);
	return {
		markers,
		areas,
		hasCompactionSummary: /compaction|compacted|Current work focus|preserved planning summary/i.test(text),
	};
}

export function shouldLoadProjectMemory(input: ProjectMemoryLoadDecisionInput): ProjectMemoryLoadDecision {
	const request = input.latestRequest?.trim() ?? "";
	if (/^(?:\/dd:no-load|dd:no-load|\/no-load)$/i.test(request)) {
		return { loadNeeded: false, reason: "user-opt-out" };
	}
	if (input.hasRecentProjectMemoryLoad) return { loadNeeded: false, reason: "recent-load" };

	const transcriptCoverage = collectProjectMemoryContextCoverage(input.contextText);
	const areas = transcriptCoverage.areas;
	const missingMarkers = REQUIRED_PROJECT_MEMORY_MARKERS.filter(
		(marker) => !transcriptCoverage.markers.includes(marker),
	);
	if (missingMarkers.length > 0) {
		return { loadNeeded: true, reason: "missing-baseline", missingMarkers, areas };
	}
	if (transcriptCoverage.hasCompactionSummary && areas.length < 3) {
		return { loadNeeded: true, reason: "compaction-missing-markers", areas };
	}
	return { loadNeeded: false, areas };
}

export function formatProjectMemoryToolOutput(
	text: string,
	expanded: boolean,
	expandHint: string,
	maxVisibleLines = 3,
): string {
	if (expanded) return text;
	const lines = text.split(/\r?\n/);
	if (lines.length <= maxVisibleLines) return text;
	const contentLines = Math.max(1, maxVisibleLines - 1);
	const omitted = lines.length - contentLines;
	return [...lines.slice(0, contentLines), `... (${omitted} more lines, ${expandHint})`].join("\n");
}

export function buildPendingProjectMemoryLoadPrompt(
	pending: boolean,
): string | undefined {
	if (!pending) return undefined;
	return `[PROJECT MEMORY LOAD REQUIRED]
This is the globally generated automatic-load turn. Before substantive work, call dotdotgod_project_load exactly once. Generate a concise semantic focus covering the task's relevant behavior, architecture, source areas, documentation, and verification needs. Express the focus as a task-specific synthesis rather than copied request text or extracted keywords; use an empty focus when a broad baseline map is more useful. Continue the original request after the tool result arrives.`;
}

export function isExplicitProjectMemoryLoadInput(text: string | undefined): boolean {
	return (text ?? "").startsWith(`${PROJECT_MEMORY_EXPLICIT_LOAD_MARKER}\n`);
}

export function stripExplicitProjectMemoryLoadMarker(text: string): string {
	return isExplicitProjectMemoryLoadInput(text)
		? text.slice(PROJECT_MEMORY_EXPLICIT_LOAD_MARKER.length + 1)
		: text;
}

export function hasReachableProjectMemoryInstruction(
	entries: readonly ProjectMemoryEntry[],
): boolean {
	let latestStateIndex = -1;
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (
			entry?.type === "custom" &&
			entry.customType === "project-memory-auto-state"
		) {
			latestStateIndex = i;
			break;
		}
	}
	return entries.slice(latestStateIndex + 1).some((entry) => {
		if (entry?.type !== "message" || !entry.message) return false;
		const message = entry.message as AgentMessage & { customType?: string };
		return message.role === "custom" && message.customType === PROJECT_MEMORY_CONTEXT_TYPE;
	});
}

export function hasRecentProjectMemoryLoad(ctx: ExtensionContext, currentEntryCount: number): boolean {
	const entries = ctx.sessionManager.getBranch() as readonly ProjectMemoryEntry[];
	for (let i = entries.length - 1; i >= 0; i -= 1) {
		const entry = entries[i];
		if (entry?.type === "custom" && entry.customType === "project-memory-load") {
			const data = entry.data as { entryCount?: number } | undefined;
			return currentEntryCount - (data?.entryCount ?? i) < 25;
		}
	}
	return false;
}

function getMessageText(message: AgentMessage): string {
	if (!("content" in message)) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

export function getProjectMemoryContextText(ctx: ExtensionContext): string {
	return ctx.sessionManager
		.getBranch()
		.slice(-60)
		.map((entry) => {
			const candidate = entry as { type?: string; customType?: string; message?: AgentMessage; data?: unknown };
			if (candidate.type === "message" && candidate.message) return getMessageText(candidate.message);
			if (candidate.type === "custom") return `${candidate.customType ?? "custom"}\n${JSON.stringify(candidate.data ?? {})}`;
			return "";
		})
		.filter(Boolean)
		.join("\n")
		.slice(-30_000);
}
