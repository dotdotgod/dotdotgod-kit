export function detectPlanExecutionIntent(text: string): boolean {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return false;

	const refinementOnly = /(refine|revise|edit|modify|adjust|improve|update)\b.*\b(plan|proposal)|\b(plan|proposal)\b.*\b(refine|revise|edit|modify|adjust|improve|update)\b|수정하자|수정해줘|다듬|보완|개선|계획하자|계획을 세우|계획 만들어|플랜.*(수정|다듬|보완|개선)/i;
	const explicitEnglishExecution = /\b(execute|start|run|begin|implement)\b.*\b(plan|docs\/plan\/[a-z0-9-]+\/README\.md|[a-z0-9]+(?:-[a-z0-9]+)+)\b|\b(proceed with|carry out)\b.*\b(plan|docs\/plan\/[a-z0-9-]+\/README\.md|[a-z0-9]+(?:-[a-z0-9]+)+)\b/i;
	const explicitKoreanExecution = /(진행|시작|실행)(해줘|해주세요|하자|합시다|해보자|해|해라|시켜줘)/i;
	const executeNow = /^(execute|start|run|begin|implement|proceed)\b/i;

	const hasExecution = explicitEnglishExecution.test(normalized) || explicitKoreanExecution.test(normalized) || executeNow.test(normalized);
	if (!hasExecution) return false;
	if (refinementOnly.test(normalized) && !explicitEnglishExecution.test(normalized) && !explicitKoreanExecution.test(normalized)) return false;
	return true;
}

export type PlanModeRequestKind = "advisory" | "implementation_request" | "explicit_execution" | "memory_load";

export function classifyPlanModeRequest(text: string | undefined): PlanModeRequestKind {
	const normalized = (text ?? "").replace(/\s+/g, " ").trim();
	if (!normalized) return "advisory";
	if (/^Load the dotdotgod project memory\b/i.test(normalized) || /\b(dd:load|\/dd:load|\/load|load-snapshot)\b/i.test(normalized) || /프로젝트.*메모리.*(로드|불러|읽)/i.test(normalized)) {
		return "memory_load";
	}
	if (detectPlanExecutionIntent(normalized)) return "explicit_execution";

	const advisoryPattern = /(어떻게|좋을까|괜찮|조사|분석|검토|설명|알려|의견|계획해|계획을 세|plan|research|investigate|analy[sz]e|review|explain|should|how would|what if|proposal|approach)/i;
	const implementationPattern = /(구현|수정|고쳐|추가|적용|만들|작성|코딩|리팩터|리팩토|반영|실행해|implement|fix|add|apply|change|update|create|write|code|refactor|modify|wire|integrate|enforce)/i;
	const explicitPlanPattern = /(계획|플랜|plan|proposal|approach)/i;

	if (implementationPattern.test(normalized) && !explicitPlanPattern.test(normalized)) return "implementation_request";
	if (implementationPattern.test(normalized) && !advisoryPattern.test(normalized)) return "implementation_request";
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
	if (kind === "implementation_request") {
		return "Plan Mode request framing: the latest user request sounds like implementation or coding work. Because Plan Mode is active, convert it into a durable implementation plan first. Create or update docs/plan/<task-slug>/README.md, include impact-informed target files/risks/verification, and do not modify source/code/config until execution mode.";
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
	const request = input.latestRequest ?? "";
	if (/\b(do not|don't|skip|without)\b.*\b(load|context|memory)\b|로드하지|불러오지/i.test(request)) {
		return { loadNeeded: false, reason: "user-opt-out" };
	}
	if (input.hasRecentProjectMemoryLoad) return { loadNeeded: false, reason: "recent-load" };

	const coverage = collectProjectMemoryContextCoverage(input.contextText);
	const missingMarkers = REQUIRED_PROJECT_MEMORY_MARKERS.filter((marker) => !coverage.markers.includes(marker));
	const requestNeedsCrossArea = /(구현|수정|코딩|검증|아키텍처|테스트|어댑터|런타임|implement|fix|code|validate|verification|architecture|test|adapter|runtime|cross-agent)/i.test(request);

	if (missingMarkers.length > 0) {
		return { loadNeeded: true, reason: "missing-baseline", missingMarkers, areas: coverage.areas };
	}
	if (requestNeedsCrossArea && coverage.areas.length <= 1) {
		return { loadNeeded: true, reason: "single-area-only", areas: coverage.areas };
	}
	if (requestNeedsCrossArea && (!coverage.areas.includes("spec") || !coverage.areas.includes("arch") || !coverage.areas.includes("test"))) {
		return { loadNeeded: true, reason: "request-needs-cross-area", areas: coverage.areas };
	}
	if (coverage.hasCompactionSummary && coverage.areas.length < 3) {
		return { loadNeeded: true, reason: "compaction-missing-markers", areas: coverage.areas };
	}
	return { loadNeeded: false, areas: coverage.areas };
}

