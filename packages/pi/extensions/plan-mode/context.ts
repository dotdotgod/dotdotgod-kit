export function detectPlanExecutionIntent(text: string): boolean {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return false;
	return /^Execute the plan in docs\/plan\/[a-z0-9]+(?:-[a-z0-9]+)*\/README\.md\b/i.test(normalized);
}

export type PlanModeRequestKind = "advisory" | "explicit_execution" | "memory_load";

export interface LatestPlanningRequestSelectionInput {
	currentRequest?: string | undefined;
	latestUserText?: string | undefined;
	pendingInlineRequest?: string | undefined;
}

export interface LatestPlanningRequestSelection {
	request?: string | undefined;
	pendingInlineRequest?: string | undefined;
	changed: boolean;
}

export function isSyntheticProjectMemoryLoadPrompt(text: string | undefined): boolean {
	const normalized = (text ?? "").trim();
	if (!normalized) return false;
	return (
		normalized.startsWith("Load the dotdotgod project memory in ") ||
		normalized.startsWith("Load the dotdotgod project memory.") ||
		normalized.includes("Do not modify files. Only load and summarize project memory.")
	);
}

export function isPlanModeRuntimeRequest(text: string | undefined): boolean {
	const normalized = (text ?? "").trim();
	return (
		!normalized ||
		normalized.includes("[PLAN MODE ACTIVE]") ||
		isSyntheticProjectMemoryLoadPrompt(normalized) ||
		normalized.startsWith("Continue the latest Plan Mode request after planning-focused compaction.") ||
		normalized.startsWith("Continue the following Plan Mode request after planning-focused compaction.") ||
		/^Continue authoring the durable plan at docs\/plan\/[a-z0-9]+(?:-[a-z0-9]+)*\/README\.md using \/plan-goal stage \d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\./.test(normalized)
	);
}

export function selectLatestPlanningRequest(input: LatestPlanningRequestSelectionInput): LatestPlanningRequestSelection {
	const currentRequest = input.currentRequest;
	const latestUserText = input.latestUserText?.trim();
	const pendingInlineRequest = input.pendingInlineRequest?.trim();

	if (pendingInlineRequest) {
		if (latestUserText === pendingInlineRequest && !isPlanModeRuntimeRequest(latestUserText)) {
			return {
				request: latestUserText,
				pendingInlineRequest: undefined,
				changed: currentRequest !== latestUserText || input.pendingInlineRequest !== undefined,
			};
		}
		return { request: currentRequest, pendingInlineRequest, changed: false };
	}

	if (!isPlanModeRuntimeRequest(latestUserText)) {
		return {
			request: latestUserText,
			pendingInlineRequest: undefined,
			changed: currentRequest !== latestUserText,
		};
	}

	return { request: currentRequest, pendingInlineRequest: undefined, changed: false };
}

export function classifyPlanModeRequest(text: string | undefined): PlanModeRequestKind {
	const normalized = (text ?? "").replace(/\s+/g, " ").trim();
	if (!normalized) return "advisory";
	if (/^Load the dotdotgod project memory\b/i.test(normalized) || /^(?:\/dd:load|dd:load|\/load)\b/i.test(normalized)) {
		return "memory_load";
	}
	if (detectPlanExecutionIntent(normalized)) return "explicit_execution";
	return "advisory";
}

export function buildPlanModeRequestFraming(latestRequest: string | undefined): string {
	const kind = classifyPlanModeRequest(latestRequest);
	if (kind === "memory_load") {
		return "Plan Mode request framing: the latest user request is a project-memory load request. Prefer the curated dotdotgod project-memory load flow and do not create an implementation plan unless the user asks for implementation after loading.";
	}
	if (kind === "explicit_execution") {
		return "Plan Mode request framing: the latest user request appears to explicitly execute an active plan. Resolve the referenced docs/plan/<task-slug>/README.md through the existing Plan Mode execution path before making source/code/config changes.";
	}
	return "Plan Mode request framing: treat the latest user request as advisory or planning work. Answer without source/code/config changes. Create or update a docs/plan/<task-slug>/README.md file only when durable implementation steps are needed.";
}

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
	latestRequest?: string | undefined;
	contextText?: string | undefined;
	hasRecentProjectMemoryLoad?: boolean | undefined;
}

export interface ProjectMemoryLoadDecision {
	loadNeeded: boolean;
	reason?: "user-opt-out" | "recent-load" | "missing-baseline" | "single-area-only" | "request-needs-cross-area" | "compaction-missing-markers";
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

export function shouldLoadProjectMemoryForPlanning(input: ProjectMemoryLoadDecisionInput): ProjectMemoryLoadDecision {
	const request = input.latestRequest?.trim() ?? "";
	if (/^(?:\/dd:no-load|dd:no-load|\/no-load)$/i.test(request)) {
		return { loadNeeded: false, reason: "user-opt-out" };
	}
	if (input.hasRecentProjectMemoryLoad) return { loadNeeded: false, reason: "recent-load" };

	const coverage = collectProjectMemoryContextCoverage(input.contextText);
	const missingMarkers = REQUIRED_PROJECT_MEMORY_MARKERS.filter((marker) => !coverage.markers.includes(marker));

	if (missingMarkers.length > 0) {
		return { loadNeeded: true, reason: "missing-baseline", missingMarkers, areas: coverage.areas };
	}
	if (coverage.hasCompactionSummary && coverage.areas.length < 3) {
		return { loadNeeded: true, reason: "compaction-missing-markers", areas: coverage.areas };
	}
	return { loadNeeded: false, areas: coverage.areas };
}

