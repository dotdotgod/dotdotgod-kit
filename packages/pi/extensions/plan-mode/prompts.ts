const DEFAULT_PLAN_MODE_TOOLS = [
	"read",
	"bash",
	"dotdotgod_graph_impact",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"questionnaire",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
];

export const PLAN_COMPACTION_PERCENT_THRESHOLD = 60;
const PLAN_COMPACTION_TOKEN_FALLBACK = 100_000;
const PLAN_COMPACTION_CONTEXT_RESERVE = 32_000;

export const PLAN_MODE_COMPACTION_INSTRUCTIONS =
	"Preserve planning-critical context in this priority order: latest user request; active plan path and status; current targets; user decisions and constraints; implementation decisions; verification commands and results; unresolved risks and questions; next steps; completed [DONE:n] markers. Summarize older completed plans, repeated project loads, recoverable Plan Mode guidance, repeated tool output, stale alternatives, and unrelated history only when they affect current work. Produce a compact continuation-ready summary.";

export function parsePlanModeExtraTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const seen = new Set<string>();
	return value
		.split(",")
		.map((tool) => tool.trim())
		.filter((tool) => /^[A-Za-z0-9_:-]+$/.test(tool))
		.filter((tool) => {
			if (seen.has(tool)) return false;
			seen.add(tool);
			return true;
		});
}

export function resolvePlanModeTools(extraTools: unknown, availableTools?: readonly string[]): string[] {
	const available = availableTools ? new Set(availableTools) : undefined;
	const seen = new Set<string>();
	const requested = [...DEFAULT_PLAN_MODE_TOOLS, ...parsePlanModeExtraTools(extraTools)];
	return requested.filter((tool) => {
		if (seen.has(tool)) return false;
		if (available && !available.has(tool)) return false;
		seen.add(tool);
		return true;
	});
}

function documentationRootFor(writablePaths: readonly string[]): string { return writablePaths[0]?.replaceAll("\\", "/").split("/")[0] || "docs"; }

function buildPlanModeFullContextPrompt(allowedTools = DEFAULT_PLAN_MODE_TOOLS, writablePaths: readonly string[] = ["docs/plan/**", "docs/archive/**"]): string {
	const documentationRoot = documentationRootFor(writablePaths);
	return `[PLAN MODE ACTIVE]
You are in Plan Mode. This is a planning-only exploration and design phase before code changes.

Restrictions:
- Allowed tools: ${allowedTools.join(", ")}
- edit/write are allowed only for valid markdown files matching the configured documentation paths: ${writablePaths.join(", ") || "none"}.
- Under ${documentationRoot}/, directories must use kebab-case and markdown file names must use UPPER_SNAKE_CASE.md, including README.md.
- Forbidden: source/code/config mutation; configured writable paths remain limited to documentation markdown.
- Bash is restricted to read-only allowlisted commands.

Workflow:
1. Check for a matching active plan.
2. Reuse loaded memory and the documentation map, then use focused query and README indexes to select maintained docs and verify conclusions in them.
3. Inspect the source needed to confirm targets and constraints.
4. Run impact review on likely changed files and refine targets, risks, and verification.
5. For durable work, write and present ${documentationRoot}/plan/<task-slug>/README.md with scope, targets, executable steps, verification, and required completion gates; otherwise use an in-chat checklist.
6. Resolve blocking decisions and stop until the user approves execution.

Use questionnaire for required clarification and web tools only for required external evidence. Use a Plan: section only for concrete executable steps.`;
}

function buildPlanModeCompactContextPrompt(writablePaths: readonly string[]): string {
	const documentationRoot = documentationRootFor(writablePaths);
	return `[PLAN MODE ACTIVE]
Compact reminder: remain in planning-only mode until execution approval. Keep source, code, and config unchanged. edit/write are limited to valid documentation markdown matching: ${writablePaths.join(", ") || "none"}; bash remains read-only apart from safe directory operations there. Reuse loaded memory and the documentation map, route focused requests through query and README indexes, verify selected docs, and run impact review after likely targets are known. Maintain ${documentationRoot}/plan/<task-slug>/README.md for durable work or use a short in-chat checklist for bounded work. Reserve the Plan: section for concrete executable steps.`;
}

export function buildPlanModeContextPrompt(compact = false, allowedTools = DEFAULT_PLAN_MODE_TOOLS, writablePaths: readonly string[] = ["docs/plan/**", "docs/archive/**"]): string {
	return compact ? buildPlanModeCompactContextPrompt(writablePaths) : buildPlanModeFullContextPrompt(allowedTools, writablePaths);
}

export interface PlanCompactionFocus {
	task?: string;
	activePlanPaths?: string[];
	touchedMemoryPaths?: string[];
	todoSummary?: string;
	constraints?: string[];
}

export interface PlanContextUsage {
	tokens?: number | null;
	contextWindow?: number | null;
	percent?: number | null;
}

export interface PlanningContextShapeTriggerState {
	mode: "off" | "planning" | "reviewing" | "executing";
	planningContextShapePending: boolean;
}

export function shouldShapePlanningContextOnAgentStart(state: PlanningContextShapeTriggerState): boolean {
	return state.mode === "planning" && state.planningContextShapePending;
}

export interface PlanChoiceTriggerState {
	mode: "off" | "planning" | "reviewing" | "executing";
	hasUI: boolean;
	pendingPlanChoicePath?: string | undefined;
	suppressPlanChoice?: boolean | undefined;
}

export function shouldPromptForPlanChoice(state: PlanChoiceTriggerState): boolean {
	return state.mode === "planning" && state.hasUI && !state.suppressPlanChoice && Boolean(state.pendingPlanChoicePath);
}

function formatFocusList(label: string, values: string[] | undefined): string | undefined {
	const cleaned = [...new Set(values?.map((value) => value.trim()).filter(Boolean) ?? [])];
	if (cleaned.length === 0) return undefined;
	return `- ${label}: ${cleaned.slice(0, 8).join(", ")}${cleaned.length > 8 ? `, +${cleaned.length - 8} more` : ""}`;
}

export function formatPlanCompactionFocus(focus?: PlanCompactionFocus): string | undefined {
	if (!focus) return undefined;
	const lines = [
		focus.task?.trim() ? `- Task: ${focus.task.trim()}` : undefined,
		formatFocusList("Active plan", focus.activePlanPaths),
		formatFocusList("Touched plan/archive memory", focus.touchedMemoryPaths),
		focus.todoSummary?.trim() ? `- Todo state: ${focus.todoSummary.trim()}` : undefined,
		formatFocusList("Preserve constraints", focus.constraints),
	].filter((line): line is string => Boolean(line));
	if (lines.length === 0) return undefined;
	return `Current work focus:\n${lines.join("\n")}`;
}

export function buildPlanCompactionInstructions(reason?: string, focus?: PlanCompactionFocus): string {
	const sections = [];
	const normalizedReason = reason?.trim();
	if (normalizedReason) sections.push(`Reason: ${normalizedReason}`);
	const formattedFocus = formatPlanCompactionFocus(focus);
	if (formattedFocus) sections.push(formattedFocus);
	sections.push(PLAN_MODE_COMPACTION_INSTRUCTIONS);
	return sections.join("\n\n");
}

export function getPlanCompactionReason(usage: PlanContextUsage | null | undefined): string | undefined {
	if (!usage) return undefined;

	const percent = usage.percent ?? null;
	if (typeof percent === "number") {
		const normalizedPercent = percent <= 1 ? percent * 100 : percent;
		if (normalizedPercent >= PLAN_COMPACTION_PERCENT_THRESHOLD) {
			return `Plan Mode context exceeded ${PLAN_COMPACTION_PERCENT_THRESHOLD}% of the context window.`;
		}
	}

	const tokens = usage.tokens ?? null;
	if (typeof tokens !== "number") return undefined;

	const contextWindow = usage.contextWindow ?? null;
	if (typeof contextWindow === "number" && tokens >= contextWindow - PLAN_COMPACTION_CONTEXT_RESERVE) {
		return `Plan Mode context is within ${PLAN_COMPACTION_CONTEXT_RESERVE.toLocaleString()} tokens of the context window.`;
	}

	if (tokens >= PLAN_COMPACTION_TOKEN_FALLBACK) {
		return `Plan Mode context exceeded ${PLAN_COMPACTION_TOKEN_FALLBACK.toLocaleString()} tokens.`;
	}

	return undefined;
}
