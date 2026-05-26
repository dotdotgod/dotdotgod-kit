import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	DiscussionQueueComponent,
	PlanReviewComponent,
} from "../components/plan-mode-components.js";
import {
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	mapPlanReviewFallbackChoice,
	summarizeDiscussionQueue,
	type DiscussionQueueResult,
	type PlanReviewChoice,
} from "../plans.ts";
import type { TodoItem } from "../todos.ts";

export class ReviewGateController {
	async promptForDiscussionQueue(
		ctx: ExtensionContext,
		planPath: string | undefined,
	): Promise<DiscussionQueueResult | undefined> {
		if (!planPath) return undefined;
		let markdown: string;
		try {
			markdown = readFileSync(resolve(ctx.cwd, planPath), "utf8");
		} catch {
			return undefined;
		}
		if (!markdown) return undefined;
		const queue = summarizeDiscussionQueue(markdown);
		if (!queue.blocksExecutionReview) return undefined;
		try {
			const result = await ctx.ui.custom<DiscussionQueueResult>(
				(_tui, theme, _keybindings, done) =>
					new DiscussionQueueComponent(
						planPath,
						queue.unresolved,
						queue.items.length,
						theme,
						done,
					),
				{
					overlay: true,
					overlayOptions: {
						width: "100%",
						maxHeight: "100%",
						margin: 0,
						anchor: "center",
					},
				},
			);
			if (result.action === "custom_answer") {
				const answer = await ctx.ui.editor(
					`Answer ${result.itemId ?? "discussion item"}:`,
					"",
				);
				return answer?.trim()
					? { ...result, answer: answer.trim() }
					: { action: "cancel" };
			}
			if (result.action === "defer") {
				const rationale = await ctx.ui.editor(
					`Defer ${result.itemId ?? "discussion item"} rationale:`,
					"",
				);
				const trimmed = rationale?.trim();
				return trimmed ? { ...result, rationale: trimmed } : result;
			}
			return result;
		} catch (error) {
			ctx.ui.notify(
				`Discussion Queue UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
			const item = queue.unresolved[0];
			if (!item) return undefined;
			const optionChoices = item.options.map(
				(option) => `${option.label}. ${option.text}`,
			);
			const choices = [
				...optionChoices,
				"Custom answer",
				"Defer",
				"Request research",
				"Revise plan",
				"Cancel",
			];
			const choice = await ctx.ui.select(
				`Discussion Queue ${item.id}: ${item.question}`,
				choices,
			);
			if (!choice || choice === "Cancel") return { action: "cancel" };
			if (choice === "Custom answer") {
				const answer = await ctx.ui.editor(`Answer ${item.id}:`, "");
				return answer?.trim()
					? { action: "custom_answer", itemId: item.id, answer: answer.trim() }
					: { action: "cancel" };
			}
			if (choice === "Defer") {
				const rationale = await ctx.ui.editor(
					`Defer ${item.id} rationale:`,
					"",
				);
				const trimmed = rationale?.trim();
				return trimmed
					? { action: "defer", itemId: item.id, rationale: trimmed }
					: { action: "defer", itemId: item.id };
			}
			if (choice === "Request research")
				return { action: "research", itemId: item.id };
			if (choice === "Revise plan")
				return { action: "revise", itemId: item.id };
			const option = item.options.find((candidate) =>
				choice.startsWith(`${candidate.label}.`),
			);
			return {
				action: "answer",
				itemId: item.id,
				...(option?.label ? { optionLabel: option.label } : {}),
				optionText: option?.text ?? choice,
			};
		}
	}

	async promptForPlanReviewChoice(
		ctx: ExtensionContext,
		planPath: string | undefined,
		todos: readonly TodoItem[],
	): Promise<PlanReviewChoice | undefined> {
		const review = buildPlanReviewMarkdown(planPath, todos, (path) =>
			readFileSync(resolve(ctx.cwd, path), "utf8"),
		);
		const markdown = buildPlanReviewDisplayMarkdown({
			planPath,
			todoCount: todos.length,
			review,
		});
		try {
			return await ctx.ui.custom<PlanReviewChoice | undefined>(
				(_tui, theme, _keybindings, done) =>
					new PlanReviewComponent(markdown, todos.length, theme, done),
				{
					overlay: true,
					overlayOptions: {
						width: "100%",
						maxHeight: "100%",
						margin: 0,
						anchor: "center",
					},
				},
			);
		} catch (error) {
			ctx.ui.notify(
				`Plan review UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`,
				"warning",
			);
			const fallbackChoices = [
				todos.length > 0
					? "Execute the plan (track progress)"
					: "Execute the plan",
				"Stay in plan mode",
				"Refine the plan",
				"Cancel",
			];
			const choice = await ctx.ui.select(
				"Plan mode - choose next action after reviewing the saved plan file",
				fallbackChoices,
			);
			return mapPlanReviewFallbackChoice(choice);
		}
	}
}
