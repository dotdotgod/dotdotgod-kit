const DEFAULT_PLAN_MODE_TOOLS = [
	"read",
	"bash",
	"dotdotgod_graph_impact",
	"dotdotgod_impact_status",
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

const PLAN_DECISION_GUIDANCE = `For saved plans, put user-owned open decisions under a ## Discussion Queue heading. Use rows like - [ ] Q1 scope blocks-execute-review: <question>, with indented - Why:, - Affects:, - Options: (nested - A: <choice> rows), - Recommended: A, - Verification impact:, and - Status: open fields. IDs must be unique. Required decisions use blocks-execute-review; deferring them does not authorize execution. The decision wizard collects options or custom answers and confirms them together before a single follow-up. Record confirmed answers with Status: answered and revise affected plan steps; preserve new or unresolved questions. Answer confirmation is not execution approval. Without interactive UI, surface unresolved questions in the final response and remain in planning.`;

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

${PLAN_DECISION_GUIDANCE}
Use questionnaire for clarification before a saved plan exists and web tools only for required external evidence. Use a Plan: section only for concrete executable steps.`;
}

function buildPlanModeCompactContextPrompt(writablePaths: readonly string[]): string {
	const documentationRoot = documentationRootFor(writablePaths);
	return `[PLAN MODE ACTIVE]
Compact reminder: remain in planning-only mode until execution approval. Keep source, code, and config unchanged. edit/write are limited to valid documentation markdown matching: ${writablePaths.join(", ") || "none"}; bash remains read-only apart from safe directory operations there. Reuse loaded memory and the documentation map, route focused requests through query and README indexes, verify selected docs, and run impact review after likely targets are known. Maintain ${documentationRoot}/plan/<task-slug>/README.md for durable work or use a short in-chat checklist for bounded work. Reserve the Plan: section for concrete executable steps. Keep user decisions in Discussion Queue; required deferred items still block execution. The wizard confirms answers together, not execution. Record confirmed answers and preserve new questions.`;
}

export function buildPlanModeContextPrompt(compact = false, allowedTools = DEFAULT_PLAN_MODE_TOOLS, writablePaths: readonly string[] = ["docs/plan/**", "docs/archive/**"]): string {
	return compact ? buildPlanModeCompactContextPrompt(writablePaths) : buildPlanModeFullContextPrompt(allowedTools, writablePaths);
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
