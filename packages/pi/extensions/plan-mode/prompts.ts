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
	"Preserve only planning-critical context for dotdotgod Plan Mode. Prioritize the latest user request, active plan task slug/path/status, current target files, concrete user decisions and constraints, implementation decisions, verification commands/results, unresolved risks/questions, next steps, and completed [DONE:n] markers if present. Demote or omit old completed plans unless directly relevant, repeated project-load summaries, package publish history unless task-related, generic Plan Mode boilerplate recoverable from runtime prompts, repeated tool output, stale alternatives, generic chatter, and unrelated archive detail. Summarize in a compact structure that lets the next assistant continue the current plan or execution without asking the user to repeat context.";

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

function buildPlanModeFullContextPrompt(allowedTools = DEFAULT_PLAN_MODE_TOOLS, writablePaths: readonly string[] = ["docs/plan/**", "docs/archive/**"]): string {
	return `[PLAN MODE ACTIVE]
You are in Plan Mode. This is a read-only exploration and design phase before code changes.

Restrictions:
- Allowed tools: ${allowedTools.join(", ")}
- edit/write are allowed only for valid markdown files matching the configured documentation paths: ${writablePaths.join(", ") || "none"}.
- Exception: while active /plan-goal workflows are authoring a plan, edit/write may also update checkpoint files under docs/plan/<task-slug>/.dotdotgod-plan/*.md.
- Under docs/, directories must use kebab-case and markdown file names must use UPPER_SNAKE_CASE.md, including README.md; the only non-kebab-case directory exception is the active generator .dotdotgod-plan checkpoint directory.
- Forbidden: source/code/config mutation; configured writable paths remain limited to documentation markdown.
- Bash is restricted to read-only allowlisted commands.

Project context:
- Use already-loaded project memory and the documentation map first when available.
- Read AGENTS.md and docs/README.md when they are missing, stale, or needed for the current task.
- Treat project docs as the source of truth for stack, commands, conventions, and architecture.
- Check docs/arch when code conventions, module boundaries, infrastructure/runtime dependencies, or integration constraints may affect the plan.

Workflow:
- Explore files in bounded passes before planning: start from already-loaded memory, the documentation map, README indexes, and impact or query results; inspect the top related specs/tests/source files first, then expand only with a concrete reason. Ask clarifying questions when requirements are ambiguous, using questionnaire if available.
- If planning compaction has just occurred, rely on the preserved planning summary plus current project docs before writing or refining the plan.
- Use web_search, code_search, and fetch_content when library or web evidence is needed.
- Create or update docs/plan/<task-slug>/README.md only when durable implementation steps are needed: large, risky, multi-file, behavior-changing, architecture-changing, CLI/API-affecting, source/config-heavy, or resumable work.
- For obvious bounded work such as typos, single-file documentation clarifications, targeted test/validation runs, or one-file fixes with an unambiguous path, use a short in-chat checklist unless the user asks for a saved plan.
- For long-running durable plans, manage active work under docs/plan/<task-slug>/README.md, with optional UPPER_SNAKE_CASE support files such as PROGRESS.md, DECISIONS.md, or VERIFY.md only when they improve resume quality.
- When one docs domain grows into multiple files, group it under docs/<area>/<domain>/README.md plus supporting UPPER_SNAKE_CASE files.
- Include scope, status, target files, impact-informed related files, risks, verification, current resume state when useful, and a final archive step to docs/archive/plan/<task-slug>/.
- For implementation tasks, the executable Plan: section must include a concrete step to run dotdotgod graph impact for intended changed files, review related specs/tests/docs/commands/files, and update the plan with newly discovered targets, risks, or verification before source changes.
- When dotdotgod CLI impact summaries are available, use the related specs, tests, docs, commands, scores, and reasons to strengthen target files, verification, and risks before asking for execution. Do not paste large raw impact payloads into durable plans unless explicitly requested.
- Do not change product/source files in plan mode. Only maintain docs/plan or docs/archive markdown files and produce an executable plan.

When durable implementation task READMEs are needed, write them with scope, target files, impact-informed related files/checks, implementation steps, verification, risks when useful, resume notes for long-running work when useful, an executable graph-impact refinement step before source changes, post-coding dotdotgod validate, and archive housekeeping.

In the final response, use a Plan: section only for concrete executable steps. Avoid generic template labels such as "Target files and rationale", "Implementation steps", or "Verification method" as numbered plan items.

Do not change source/code/config files in Plan Mode. You may create or update only the allowed docs/plan or docs/archive markdown files needed to produce the durable plan.`;
}

function buildPlanModeCompactContextPrompt(writablePaths: readonly string[]): string {
	return `[PLAN MODE ACTIVE]
Compact reminder: stay in read-only planning until execution mode. Do not mutate source/code/config files. edit/write are allowed only for valid documentation markdown matching: ${writablePaths.join(", ") || "none"}; active /plan-goal docs/plan/<task-slug>/.dotdotgod-plan/*.md checkpoint files remain a narrow exception. bash remains read-only except safe directory operations inside the same paths. Use AGENTS.md and docs indexes as source of truth when needed. Create or maintain docs/plan/<task-slug>/README.md only when durable implementation steps are needed; otherwise use a short in-chat checklist. Use a Plan: section only for concrete executable steps when ready.`;
}

export function buildPlanModeContextPrompt(compact = false, allowedTools = DEFAULT_PLAN_MODE_TOOLS, writablePaths: readonly string[] = ["docs/plan/**", "docs/archive/**"]): string {
	return compact ? buildPlanModeCompactContextPrompt(writablePaths) : buildPlanModeFullContextPrompt(allowedTools, writablePaths);
}

export interface PlanCompactionFocus {
	task?: string;
	activePlanPaths?: string[];
	touchedMemoryPaths?: string[];
	todoSummary?: string;
	pendingLoadAfterCompaction?: boolean;
	constraints?: string[];
}

export interface PlanContextUsage {
	tokens?: number | null;
	contextWindow?: number | null;
	percent?: number | null;
}

export interface PlanningContextShapeTriggerState {
	planModeEnabled: boolean;
	executionMode: boolean;
	planningContextShapePending: boolean;
}

export function shouldShapePlanningContextOnAgentStart(state: PlanningContextShapeTriggerState): boolean {
	return state.planModeEnabled && !state.executionMode && state.planningContextShapePending;
}

export interface PlanChoiceTriggerState {
	planModeEnabled: boolean;
	executionMode: boolean;
	hasUI: boolean;
	pendingPlanChoicePath?: string | undefined;
	suppressPlanChoice?: boolean | undefined;
}

export function shouldPromptForPlanChoice(state: PlanChoiceTriggerState): boolean {
	return state.planModeEnabled && !state.executionMode && state.hasUI && !state.suppressPlanChoice && Boolean(state.pendingPlanChoicePath);
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
		focus.pendingLoadAfterCompaction ? "- Pending: load curated project memory after compaction" : undefined,
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

export function buildPlanCompactionResumePrompt(request?: string): string {
	const normalizedRequest = request?.trim();
	if (!normalizedRequest) {
		return "Continue the latest Plan Mode request after planning-focused compaction. Use the preserved summary and current project docs; do not ask the user to repeat the request unless a required detail is missing.";
	}
	return `Continue the following Plan Mode request after planning-focused compaction. Use the preserved summary and current project docs; do not ask the user to repeat the request unless a required detail is missing.\n\nLatest request:\n${normalizedRequest}`;
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
