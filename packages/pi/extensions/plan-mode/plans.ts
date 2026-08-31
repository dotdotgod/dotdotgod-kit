import { PLAN_DIRECTORY, isActivePlanPath, isArchivePath } from "./runtime/paths.ts";
export type {
	PlanExecutionDecision,
	PlanExecutionHandoff,
	PlanModeUserMessageDeliveryOptions,
	PlanReviewAction,
	PlanReviewChoice,
	PlanReviewDisplayMarkdownOptions,
	PlanReviewFileReader,
	PlanReviewMarkdown,
	PlanReviewScrollState,
} from "./plan-review.ts";
export {
	PLAN_REVIEW_ACTIONS,
	PLAN_REVIEW_MIN_BODY_LINES,
	buildPlanExecutionDecision,
	buildPlanExecutionHandoff,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanReviewTitle,
	getNextPlanReviewActionIndex,
	getPlanReviewActionChoice,
	getPlanReviewBodyViewportLines,
	getPlanReviewScrollState,
	getPlanReviewVisibleBodyLines,
	mapPlanReviewFallbackChoice,
	planModeFollowUpDeliveryOptions,
} from "./plan-review.ts";

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

export interface PlanRefinementPromptOptions {
	planPath?: string | undefined;
	userFeedback?: string | undefined;
	context?: string | undefined;
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
		recommended: false,
	};
}

function applyRecommendedOptionLabels(options: DiscussionQueueOption[], labels: ReadonlySet<string>): void {
	for (const option of options) option.recommended = labels.has(option.label.toLowerCase());
}

function parseRecommendedOptionLabels(value: string): Set<string> {
	return new Set(value.split(/[,\s]+/).map((label) => label.trim().toLowerCase()).filter(Boolean));
}

export function extractDiscussionQueueItems(markdown: string): DiscussionQueueItem[] {
	const lines = markdown.split(/\r?\n/);
	const sectionStart = lines.findIndex((line) => /^#{2,6}\s+Discussion Queue\s*$/i.test(line.trim()));
	if (sectionStart < 0) return [];
	const items: DiscussionQueueItem[] = [];
	let current: DiscussionQueueItem | undefined;
	let inOptions = false;
	let explicitStatus: DiscussionQueueItemState | undefined;
	let recommendedOptionLabels = new Set<string>();
	const flush = () => {
		if (!current) return;
		current.status = explicitStatus ?? current.status;
		applyRecommendedOptionLabels(current.options, recommendedOptionLabels);
		items.push(current);
		current = undefined;
		inOptions = false;
		explicitStatus = undefined;
		recommendedOptionLabels = new Set<string>();
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
			recommendedOptionLabels = new Set<string>();
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
			else if (key === "recommended" || key === "recommended-option") recommendedOptionLabels = parseRecommendedOptionLabels(value);
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
	const suffix = "Update the durable plan's Discussion Queue and keep Plan Mode active until execution approval.";
	if (result.action === "answer") {
		const selected = [result.optionLabel, result.optionText].filter(Boolean).join(": ");
		return `Record the user's answer for Discussion Queue item ${result.itemId}${target}: ${selected}. ${suffix}`;
	}
	if (result.action === "custom_answer") return `Record the user's custom answer for Discussion Queue item ${result.itemId}${target}: ${result.answer ?? ""}. ${suffix}`;
	if (result.action === "defer") return `Mark Discussion Queue item ${result.itemId}${target} as deferred${result.rationale ? ` with rationale: ${result.rationale}` : ""}. ${suffix}`;
	if (result.action === "research") return `Research the bounded question for Discussion Queue item ${result.itemId}${target} and record findings or next options. ${suffix}`;
	if (result.action === "revise") return `Revise the plan for Discussion Queue item ${result.itemId}${target}${result.rationale ? `: ${result.rationale}` : "."} ${suffix}`;
	return undefined;
}


export function buildPlanReviewRefinePrompt(options: PlanRefinementPromptOptions): string {
	const target = options.planPath ?? "the active plan";
	const feedback = options.userFeedback?.trim() || "Refine the plan based on the user's review choice.";
	const context = options.context?.trim();
	return [
		`Refine ${target} before execution.`,
		context ? `Current plan context:\n${context}` : undefined,
		`User refinement feedback:\n${feedback}`,
		"Update the durable plan markdown and keep Plan Mode active until execution approval.",
	].filter((section): section is string => Boolean(section)).join("\n\n");
}

export function getCurrentPlanReadmePath(path: string): string | undefined {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	const prefix = `${PLAN_DIRECTORY}/`;
	if (!normalized.startsWith(prefix)) return undefined;
	const match = normalized.slice(prefix.length).match(/^([a-z0-9]+(?:-[a-z0-9]+)*)\/(?:README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)$/);
	if (!match?.[1]) return undefined;
	return `${PLAN_DIRECTORY}/${match[1]}/README.md`;
}

export function extractPlanSlugMentions(text: string): string[] {
	const slugs: string[] = [];
	const seen = new Set<string>();
	const add = (slug: string | undefined) => {
		if (!slug || seen.has(slug)) return;
		seen.add(slug);
		slugs.push(slug);
	};

	const escapedPlanDirectory = PLAN_DIRECTORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	for (const match of text.matchAll(new RegExp(`${escapedPlanDirectory}/([a-z0-9]+(?:-[a-z0-9]+)*)/(?:README\\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\\.md)`, "g"))) {
		add(match[1]);
	}
	for (const match of text.matchAll(/(?:^|[\s`"'(:])([a-z0-9]+(?:-[a-z0-9]+)+)(?=$|[\s`"'),.;:])/g)) {
		add(match[1]);
	}
	return slugs;
}

function hasStructuredExecutionRequest(request: string): boolean {
	const escaped = PLAN_DIRECTORY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^Execute the plan in ${escaped}/[a-z0-9]+(?:-[a-z0-9]+)*/README\\.md\\b`, "i").test(request.replace(/\s+/g, " ").trim());
}

export function resolvePlanExecutionTarget(input: PlanExecutionTargetInput): PlanExecutionTargetResolution {
	const request = input.request ?? "";
	const explicitCandidates = [
		...extractPathMentions(request).map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
		...extractPlanSlugMentions(request).map((slug) => `${PLAN_DIRECTORY}/${slug}/README.md`),
	];
	const contextCandidates = [
		...(input.pendingPlanChoicePath ? [input.pendingPlanChoicePath] : []),
		...(input.currentPlanPath ? [input.currentPlanPath] : []),
		...(input.touchedPaths ?? []).map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
	];
	const fallbackCandidates = input.allowActivePlanFallback && hasStructuredExecutionRequest(request) ? (input.activePlanPaths ?? []) : [];
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
	if (isActivePlanPath(normalized) || isArchivePath(normalized)) return false;
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
