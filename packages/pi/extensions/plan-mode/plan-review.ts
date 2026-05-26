import type { TodoItem } from "./todos.ts";

export type PlanReviewChoice = "execute" | "stay" | "refine" | "cancel";

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

export interface PlanReviewScrollState {
	offset: number;
	maxOffset: number;
	canScrollUp: boolean;
	canScrollDown: boolean;
}

export function planModeFollowUpDeliveryOptions(): PlanModeUserMessageDeliveryOptions {
	return { deliverAs: "followUp" };
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
