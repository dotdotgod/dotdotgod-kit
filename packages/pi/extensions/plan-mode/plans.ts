import type { TodoItem } from "./todos.ts";

export type PlanReviewChoice = "execute" | "stay" | "refine" | "cancel";

export type DiscussionQueueItemState = "open" | "answered" | "deferred" | "research_requested" | "plan_revision_requested" | "accepted_risk";
export type DiscussionQueueAction = "answer" | "custom_answer" | "defer" | "research" | "revise" | "cancel";

export interface DiscussionQueueOption {
	label: string;
	text: string;
	recommended: boolean;
}

export interface DiscussionQueueItem {
	id: string;
	type: string;
	flags: string[];
	question: string;
	why?: string;
	affects?: string;
	verificationImpact?: string;
	status: DiscussionQueueItemState;
	checked: boolean;
	options: DiscussionQueueOption[];
	order: number;
}

export interface DiscussionQueueResult {
	action: DiscussionQueueAction;
	itemId?: string;
	optionLabel?: string;
	optionText?: string;
	answer?: string;
	rationale?: string;
}

export interface DiscussionQueueSummary {
	items: DiscussionQueueItem[];
	unresolved: DiscussionQueueItem[];
	blocksExecutionReview: boolean;
}

export interface PlanValidationBlocker {
	code?: string;
	message?: string;
	section?: string;
	stage?: string;
	path?: string;
	prompt?: string;
}

export interface PlanValidationResult {
	ok?: boolean;
	blockers?: PlanValidationBlocker[];
	planPath?: string;
	repairPrompt?: string;
	stage?: string;
}

export const PLAN_VALIDATION_STAGES = [
	"01-intake",
	"02-context-load",
	"03-discovery",
	"04-decomposition",
	"05-decision-queue",
	"06-approval",
	"07-execution-slices",
	"08-verify-replan-close",
] as const;

export type PlanValidationStage = typeof PLAN_VALIDATION_STAGES[number];

export interface PlanStageAuthoringPromptOptions {
	planPath?: string | undefined;
	stage: PlanValidationStage;
	request?: string | undefined;
	previousStage?: PlanValidationStage | undefined;
}

export function isPlanValidationStage(value: string | undefined): value is PlanValidationStage {
	return PLAN_VALIDATION_STAGES.includes(value as PlanValidationStage);
}

export function getNextPlanValidationStage(stage: PlanValidationStage | undefined): PlanValidationStage | undefined {
	if (!stage) return PLAN_VALIDATION_STAGES[0];
	const index = PLAN_VALIDATION_STAGES.indexOf(stage);
	return index >= 0 ? PLAN_VALIDATION_STAGES[index + 1] : undefined;
}

export function getPlanStageFromPath(path: string | undefined): PlanValidationStage | undefined {
	const normalized = path?.replace(/\\/g, "/") ?? "";
	return PLAN_VALIDATION_STAGES.find((stage) => normalized.includes(`/${stage}/`) || normalized.endsWith(`/${stage}`));
}

export function buildPlanStageAuthoringPrompt(options: PlanStageAuthoringPromptOptions): string {
	const target = options.planPath ?? "the active plan";
	const previous = options.previousStage ? ` Previous stage passed: ${options.previousStage}.` : "";
	const request = options.request?.trim();
	return [
		`Continue Plan Mode stage authoring for ${target}.`,
		`Current stage: ${options.stage}.${previous}`,
		request ? `Original/latest user request:\n${request}` : undefined,
		`Create or refine only docs/plan/<task-slug>/${options.stage}/README.md for the current stage. Do not create later stage directories or files yet.`,
		`After completing this stage, stop. Pi will run \`dotdotgod plan validate --stage ${options.stage}\` and advance automatically only if validation passes and no user refinement is needed.`,
	].filter((section): section is string => Boolean(section)).join("\n\n");
}

export interface PlanValidationRefinePromptOptions {
	planPath?: string | undefined;
	result?: PlanValidationResult | undefined;
	userFeedback?: string | undefined;
	stage?: string | undefined;
}

export interface PlanRefinementPromptOptions {
	planPath?: string | undefined;
	userFeedback?: string | undefined;
	context?: string | undefined;
}

export interface PlanReviewAction {
	choice: PlanReviewChoice;
	label: string;
	shortcut: string;
}

export const PLAN_REVIEW_ACTIONS: readonly PlanReviewAction[] = [
	{ choice: "execute", label: "Execute", shortcut: "e" },
	{ choice: "stay", label: "Stay in plan", shortcut: "s" },
	{ choice: "refine", label: "Refine", shortcut: "r" },
	{ choice: "cancel", label: "Cancel", shortcut: "c/Esc" },
];

export interface PlanReviewMarkdown {
	markdown: string;
	source: "file" | "fallback";
}

export type PlanReviewFileReader = (path: string) => string;

export interface PlanExecutionDecision {
	choice: PlanReviewChoice | undefined;
	handoff: PlanExecutionHandoff | undefined;
	shouldExecute: boolean;
}

export interface PlanReviewDisplayMarkdownOptions {
	planPath: string | undefined;
	todoCount: number;
	review: PlanReviewMarkdown;
}

export interface PlanExecutionHandoff {
	message: string;
	marker: {
		content: string;
		planPath: string | undefined;
		todoCount: number;
	};
	trigger: "user-message";
	persistBeforeTrigger: true;
}

export interface PlanModeUserMessageDeliveryOptions {
	deliverAs: "followUp";
}

export function planModeFollowUpDeliveryOptions(): PlanModeUserMessageDeliveryOptions {
	return { deliverAs: "followUp" };
}

export interface PlanExecutionTargetInput {
	request?: string | undefined;
	currentPlanPath?: string | undefined;
	pendingPlanChoicePath?: string | undefined;
	touchedPaths?: readonly string[] | undefined;
	activePlanPaths?: readonly string[] | undefined;
	allowActivePlanFallback?: boolean | undefined;
	pathExists: (path: string) => boolean;
}

export interface PlanExecutionTargetResolution {
	planPath: string | undefined;
	status: "resolved" | "ambiguous" | "missing";
	candidates: string[];
}

export function buildPlanReviewTitle(planPath: string | undefined, todoCount: number): string {
	const count = todoCount === 1 ? "1 step" : `${todoCount} steps`;
	return planPath ? `Review plan before execution: ${planPath} (${count})` : `Review plan before execution (${count})`;
}

export function buildPlanReviewMarkdown(planPath: string | undefined, todos: readonly TodoItem[], readFile: PlanReviewFileReader): PlanReviewMarkdown {
	if (planPath) {
		try {
			return { markdown: readFile(planPath), source: "file" };
		} catch {
			// Fall through to a bounded fallback so the user still sees what would execute.
		}
	}
	const todoMarkdown = todos.length > 0 ? todos.map((todo) => `${todo.step}. ${todo.text}`).join("\n") : "No extracted Plan: steps were found.";
	const pathLine = planPath ? `Plan file could not be read: ${planPath}` : "Plan file path is unknown.";
	return { markdown: `# Plan Review Fallback\n\n${pathLine}\n\n## Extracted execution steps\n\n${todoMarkdown}`, source: "fallback" };
}

export function buildPlanReviewDisplayMarkdown(options: PlanReviewDisplayMarkdownOptions): string {
	const title = buildPlanReviewTitle(options.planPath, options.todoCount);
	const note = options.review.source === "fallback"
		? "Plan file preview fallback: review the extracted steps carefully before executing."
		: "Full saved plan preview. Choose an action only after reviewing the plan.";
	return `# ${title}\n\n> ${note}\n\n${options.review.markdown}`;
}

export function mapPlanReviewFallbackChoice(choice: string | undefined): PlanReviewChoice {
	if (choice?.startsWith("Execute the plan")) return "execute";
	if (choice === "Refine the plan") return "refine";
	if (choice === "Stay in plan mode") return "stay";
	return "cancel";
}

const DISCUSSION_QUEUE_RESOLVED_STATES = new Set<DiscussionQueueItemState>(["answered", "deferred", "accepted_risk"]);
const DISCUSSION_QUEUE_STATE_VALUES = new Set<DiscussionQueueItemState>(["open", "answered", "deferred", "research_requested", "plan_revision_requested", "accepted_risk"]);

function normalizeDiscussionQueueState(value: string | undefined, checked: boolean): DiscussionQueueItemState {
	const normalized = value?.trim().toLowerCase().replace(/[\s-]+/g, "_") as DiscussionQueueItemState | undefined;
	if (normalized && DISCUSSION_QUEUE_STATE_VALUES.has(normalized)) return normalized;
	return checked ? "answered" : "open";
}

function isDiscussionQueueResolved(item: DiscussionQueueItem): boolean {
	return item.checked || DISCUSSION_QUEUE_RESOLVED_STATES.has(item.status);
}

function parseDiscussionQueueOption(line: string): DiscussionQueueOption | undefined {
	const optionMatch = line.match(/^\s*-\s+([A-Za-z0-9]+)\s*[:.)-]\s*(.+)$/);
	if (!optionMatch?.[1] || !optionMatch?.[2]) return undefined;
	const text = optionMatch[2].trim();
	return {
		label: optionMatch[1].trim(),
		text,
		recommended: /\brecommended\b/i.test(text),
	};
}

export function extractDiscussionQueueItems(markdown: string): DiscussionQueueItem[] {
	const lines = markdown.split(/\r?\n/);
	const sectionStart = lines.findIndex((line) => /^#{2,6}\s+Discussion Queue\s*$/i.test(line.trim()));
	if (sectionStart < 0) return [];
	const items: DiscussionQueueItem[] = [];
	let current: DiscussionQueueItem | undefined;
	let inOptions = false;
	let explicitStatus: DiscussionQueueItemState | undefined;
	const flush = () => {
		if (!current) return;
		current.status = explicitStatus ?? current.status;
		items.push(current);
		current = undefined;
		inOptions = false;
		explicitStatus = undefined;
	};

	for (let i = sectionStart + 1; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		if (/^#{1,6}\s+/.test(line.trim())) break;
		const itemMatch = line.match(/^\s*-\s+\[([ xX])]\s+(Q[A-Za-z0-9_-]+)\s+([^:]+):\s*(.+)$/);
		if (itemMatch?.[2] && itemMatch[3] && itemMatch[4]) {
			flush();
			const checked = itemMatch[1]?.toLowerCase() === "x";
			const meta = itemMatch[3].trim().split(/\s+/).filter(Boolean);
			const [type = "discussion", ...flags] = meta;
			current = {
				id: itemMatch[2],
				type,
				flags,
				question: itemMatch[4].trim(),
				status: normalizeDiscussionQueueState(undefined, checked),
				checked,
				options: [],
				order: items.length,
			};
			continue;
		}
		if (!current) continue;
		const fieldMatch = line.match(/^\s+-\s+([A-Za-z][A-Za-z\s]+):\s*(.*)$/);
		if (fieldMatch?.[1]) {
			const key = fieldMatch[1].trim().toLowerCase().replace(/\s+/g, "-");
			const value = fieldMatch[2]?.trim() ?? "";
			inOptions = key === "options";
			if (key === "why") current.why = value;
			else if (key === "affects") current.affects = value;
			else if (key === "verification-impact") current.verificationImpact = value;
			else if (key === "status") explicitStatus = normalizeDiscussionQueueState(value, current.checked);
			continue;
		}
		if (inOptions) {
			const option = parseDiscussionQueueOption(line);
			if (option) current.options.push(option);
		}
	}
	flush();
	return items;
}

export function summarizeDiscussionQueue(markdown: string): DiscussionQueueSummary {
	const items = extractDiscussionQueueItems(markdown);
	const unresolved = items.filter((item) => !isDiscussionQueueResolved(item));
	return { items, unresolved, blocksExecutionReview: unresolved.length > 0 };
}

export function buildDiscussionQueueFollowUp(planPath: string | undefined, result: DiscussionQueueResult): string | undefined {
	if (result.action === "cancel" || !result.itemId) return undefined;
	const target = planPath ? ` in ${planPath}` : " in the active plan";
	const suffix = "Update the Discussion Queue item, preserve the durable plan markdown, and do not start execution yet.";
	if (result.action === "answer") {
		const selected = [result.optionLabel, result.optionText].filter(Boolean).join(": ");
		return `Record the user's answer for Discussion Queue item ${result.itemId}${target}: ${selected}. ${suffix}`;
	}
	if (result.action === "custom_answer") return `Record the user's custom answer for Discussion Queue item ${result.itemId}${target}: ${result.answer ?? ""}. ${suffix}`;
	if (result.action === "defer") return `Mark Discussion Queue item ${result.itemId}${target} as deferred${result.rationale ? ` with rationale: ${result.rationale}` : ""}. ${suffix}`;
	if (result.action === "research") return `Research the bounded question for Discussion Queue item ${result.itemId}${target}, update the item with findings or next options, and stay in Plan Mode. ${suffix}`;
	if (result.action === "revise") return `Revise the plan for Discussion Queue item ${result.itemId}${target}${result.rationale ? `: ${result.rationale}` : "."} ${suffix}`;
	return undefined;
}

export function summarizePlanValidationBlockers(result: PlanValidationResult | undefined, limit = 8): string[] {
	const blockers = Array.isArray(result?.blockers) ? result.blockers : [];
	return blockers.slice(0, Math.max(1, limit)).map((blocker) => {
		const location = [blocker.path, blocker.stage, blocker.section ? `## ${blocker.section}` : undefined].filter(Boolean).join(" · ");
		const message = blocker.message ?? blocker.code ?? "Plan validation blocker";
		const prompt = blocker.prompt?.trim();
		const detail = prompt && prompt !== message ? `${message} — ${prompt}` : message;
		return location ? `${detail} (${location})` : detail;
	});
}

export function buildPlanValidationBlockerDisplay(result: PlanValidationResult | undefined, limit = 8): string {
	const blockers = Array.isArray(result?.blockers) ? result.blockers : [];
	const count = blockers.length;
	const stage = result?.stage ? ` for ${result.stage}` : "";
	if (count === 0) return `Plan validation blocked execution${stage}, but no detailed blockers were returned.`;
	const shown = summarizePlanValidationBlockers(result, limit).map((line, index) => `${index + 1}. ${line}`);
	const remaining = count - shown.length;
	return [`${count} plan validation blocker${count === 1 ? "" : "s"}${stage} require user-visible plan decisions or content before execution:`, ...shown, remaining > 0 ? `+${remaining} more blocker${remaining === 1 ? "" : "s"}` : undefined].filter((line): line is string => Boolean(line)).join("\n");
}

export function buildPlanValidationCustomMarkdown(planPath: string | undefined, result: PlanValidationResult | undefined): string {
	const target = planPath ?? result?.planPath ?? "the active plan";
	const stage = result?.stage ? `\n\nStage: ${result.stage}` : "";
	return `# Plan Validation Blocked\n\nPlan: ${target}${stage}\n\n${buildPlanValidationBlockerDisplay(result)}\n\nChoose Refine to send the agent structured repair guidance, or Cancel to stay in Plan Mode.`;
}

export function buildPlanValidationRefinePrompt(planPathOrOptions: string | PlanValidationRefinePromptOptions | undefined, resultArg?: PlanValidationResult | undefined): string {
	const options = typeof planPathOrOptions === "object" && planPathOrOptions !== null
		? planPathOrOptions
		: { planPath: planPathOrOptions, result: resultArg };
	const target = options.planPath ?? options.result?.planPath ?? "the active plan";
	const stage = options.stage ?? options.result?.stage;
	const blockers = summarizePlanValidationBlockers(options.result).map((line) => `- ${line}`).join("\n") || "- Plan validation failed without detailed blockers.";
	const repair = options.result?.repairPrompt?.trim();
	const feedback = options.userFeedback?.trim();
	const sections = [
		`Refine ${target}${stage ? ` stage ${stage}` : ""} before execution. dotdotgod plan validation reported blockers:`,
		blockers,
		repair ? `CLI repair prompt:\n${repair}` : undefined,
		feedback ? `User refinement feedback:\n${feedback}` : undefined,
		"Explain the validation reasons in the plan, update the canonical stage/workstream/verification sections, preserve user decisions, and do not start execution yet.",
	];
	return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

export function buildPlanReviewRefinePrompt(options: PlanRefinementPromptOptions): string {
	const target = options.planPath ?? "the active plan";
	const feedback = options.userFeedback?.trim() || "Refine the plan based on the user's review choice.";
	const context = options.context?.trim();
	return [
		`Refine ${target} before execution.`,
		context ? `Current plan context:\n${context}` : undefined,
		`User refinement feedback:\n${feedback}`,
		"Update the durable plan markdown, keep Plan Mode active, and do not start execution yet.",
	].filter((section): section is string => Boolean(section)).join("\n\n");
}

export interface PlanReviewScrollState {
	offset: number;
	maxOffset: number;
	canScrollUp: boolean;
	canScrollDown: boolean;
}

export function getPlanReviewScrollState(offset: number, totalLines: number, visibleLines: number): PlanReviewScrollState {
	const safeVisibleLines = Math.max(1, Math.floor(visibleLines));
	const safeTotalLines = Math.max(0, Math.floor(totalLines));
	const maxOffset = Math.max(0, safeTotalLines - safeVisibleLines);
	const safeOffset = Math.min(Math.max(0, Math.floor(offset)), maxOffset);
	return {
		offset: safeOffset,
		maxOffset,
		canScrollUp: safeOffset > 0,
		canScrollDown: safeOffset < maxOffset,
	};
}

export function getPlanReviewActionChoice(index: number): PlanReviewChoice {
	const safeIndex = Math.min(Math.max(0, Math.floor(index)), PLAN_REVIEW_ACTIONS.length - 1);
	return PLAN_REVIEW_ACTIONS[safeIndex]?.choice ?? "cancel";
}

export function getNextPlanReviewActionIndex(index: number, direction: -1 | 1): number {
	const count = PLAN_REVIEW_ACTIONS.length;
	if (count === 0) return 0;
	return (Math.floor(index) + direction + count) % count;
}

export function buildPlanExecutionHandoff(todoItems: readonly TodoItem[], planPath: string | undefined): PlanExecutionHandoff {
	const firstTodo = todoItems[0];
	const message = firstTodo
		? `Execute the plan${planPath ? ` in ${planPath}` : ""}. Start with: ${firstTodo.text}`
		: planPath
			? `Execute the plan in ${planPath}.`
			: "Execute the plan you just created.";
	return {
		message,
		marker: { content: message, planPath, todoCount: todoItems.length },
		trigger: "user-message",
		persistBeforeTrigger: true,
	};
}

export function buildPlanExecutionDecision(choice: PlanReviewChoice | undefined, todoItems: readonly TodoItem[], planPath: string | undefined): PlanExecutionDecision {
	if (choice !== "execute") return { choice, handoff: undefined, shouldExecute: false };
	return { choice, handoff: buildPlanExecutionHandoff(todoItems, planPath), shouldExecute: true };
}

export function getCurrentPlanReadmePath(path: string): string | undefined {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	const match = normalized.match(/^docs\/plan\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)$/);
	if (!match?.[1]) return undefined;
	return `docs/plan/${match[1]}/README.md`;
}

export function extractPlanSlugMentions(text: string): string[] {
	const slugs: string[] = [];
	const seen = new Set<string>();
	const add = (slug: string | undefined) => {
		if (!slug || seen.has(slug)) return;
		seen.add(slug);
		slugs.push(slug);
	};

	for (const match of text.matchAll(/docs\/plan\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(?:README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)/g)) {
		add(match[1]);
	}
	for (const match of text.matchAll(/(?:^|[\s`"'(:])([a-z0-9]+(?:-[a-z0-9]+)+)(?=$|[\s`"'),.;:])/g)) {
		add(match[1]);
	}
	return slugs;
}

export function resolvePlanExecutionTarget(input: PlanExecutionTargetInput): PlanExecutionTargetResolution {
	const request = input.request ?? "";
	const explicitCandidates = [
		...extractPathMentions(request).map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
		...extractPlanSlugMentions(request).map((slug) => `docs/plan/${slug}/README.md`),
	];
	const contextCandidates = [
		...(input.pendingPlanChoicePath ? [input.pendingPlanChoicePath] : []),
		...(input.currentPlanPath ? [input.currentPlanPath] : []),
		...(input.touchedPaths ?? []).map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
	];
	const fallbackCandidates = input.allowActivePlanFallback ? (input.activePlanPaths ?? []) : [];
	const candidateGroups = [explicitCandidates, contextCandidates, fallbackCandidates];
	for (const group of candidateGroups) {
		const existing = uniquePlanPaths(group).filter(input.pathExists);
		if (existing.length === 1) return { planPath: existing[0], status: "resolved", candidates: existing };
		if (existing.length > 1) return { planPath: undefined, status: "ambiguous", candidates: existing };
	}
	return { planPath: undefined, status: "missing", candidates: [] };
}

export function resolveMentionedPlanPath(
	cwd: string,
	text: string | undefined,
	currentPlanPath: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
): string | undefined {
	return resolvePlanExecutionTarget({
		request: text,
		currentPlanPath,
		touchedPaths,
		pathExists: (path) => pathExists(cwd, path),
	}).planPath;
}

function uniquePlanPaths(paths: readonly string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const path of paths) {
		if (seen.has(path)) continue;
		seen.add(path);
		unique.push(path);
	}
	return unique;
}

export function extractPathMentions(text: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	const re = /(?:^|[\s`"'(:])(@?\.?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?=$|[\s`"'),.;:])/g;
	let match;
	while ((match = re.exec(text)) !== null) {
		const raw = match[1];
		if (!raw) continue;
		const normalized = raw.replace(/^@/, "").replace(/^\.\//, "").replace(/\/+/g, "/");
		if (normalized.includes("..") || normalized.endsWith("/")) continue;
		if (!/[.][A-Za-z0-9]+$/.test(normalized)) continue;
		if (!seen.has(normalized)) {
			seen.add(normalized);
			paths.push(normalized);
		}
	}
	return paths;
}

function isLikelyImpactTarget(path: string): boolean {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	if (!normalized || normalized.startsWith(".") || normalized.includes("..")) return false;
	if (normalized.startsWith("docs/plan/") || normalized.startsWith("docs/archive/")) return false;
	if (normalized.startsWith(".dotdotgod/") || normalized.startsWith("node_modules/") || normalized.startsWith("dist/") || normalized.startsWith("build/") || normalized.startsWith("coverage/")) return false;
	return /[.][A-Za-z0-9]+$/.test(normalized);
}

export function selectPlanImpactPaths(
	cwd: string,
	latestRequest: string | undefined,
	currentPlanPath: string | undefined,
	currentPlanContent: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
	limit = 3,
): string[] {
	const candidates = [
		...extractPathMentions(latestRequest ?? ""),
		...extractPathMentions(currentPlanContent ?? ""),
		...(currentPlanPath ? [currentPlanPath] : []),
		...touchedPaths,
	];
	const selected: string[] = [];
	const seen = new Set<string>();
	for (const path of candidates) {
		const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
		if (seen.has(normalized) || !isLikelyImpactTarget(normalized) || !pathExists(cwd, normalized)) continue;
		seen.add(normalized);
		selected.push(normalized);
		if (selected.length >= limit) break;
	}
	return selected;
}

export function selectPlanImpactPath(
	cwd: string,
	latestRequest: string | undefined,
	currentPlanPath: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
): string | undefined {
	return selectPlanImpactPaths(cwd, latestRequest, currentPlanPath, undefined, touchedPaths, pathExists, 1)[0];
}

export function hasExplicitBracketReferences(text: string | undefined): boolean {
	return /\[\[[^\]\n]+\]\]/.test(text ?? "");
}

export function hasLikelyFuzzyReferences(text: string | undefined): boolean {
	const value = text ?? "";
	if (hasExplicitBracketReferences(value)) return true;
	if (/(?:^|\s)(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?:#[A-Za-z0-9 _-]+)?|[A-Z0-9]{3,})(?=$|\s|[.,:;!?])/.test(value)) return true;
	if (/(?:^|\s)(?:\.?\/?(?:docs|packages|src|test|spec|arch|plan|archive)\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\.md)?(?:#[A-Za-z0-9 _-]+)?(?=$|\s|[.,:;!?])/.test(value)) return true;
	if (/[`"'][^`"'\n]{4,80}[`"']/.test(value)) return true;
	return false;
}

