import type { TodoItem } from "./todos.ts";

export type PlanReviewChoice = "execute" | "stay" | "refine" | "cancel";

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

export interface PlanExecutionTargetInput {
	request?: string | undefined;
	currentPlanPath?: string | undefined;
	pendingPlanChoicePath?: string | undefined;
	touchedPaths?: readonly string[] | undefined;
	activePlanPaths?: readonly string[] | undefined;
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
	const fallbackCandidates = input.activePlanPaths ?? [];
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

