import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PlanReviewComponent } from "../components/plan-mode-components.js";
import {
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	mapPlanReviewFallbackChoice,
	summarizeDiscussionQueue,
	type PlanReviewChoice,
} from "../plans.ts";
import type { TodoItem } from "../todos.ts";
import { promptForDecisionWizard } from "./decision-wizard.ts";

export class ReviewGateController {
	promptForDiscussionQueue = promptForDecisionWizard;

	async promptForPlanReviewChoice(
		ctx: ExtensionContext,
		planPath: string | undefined,
		todos: readonly TodoItem[],
	): Promise<PlanReviewChoice | undefined> {
		if (!ctx.hasUI) return "cancel";
		const snapshot = planPath ? readFileSync(resolve(ctx.cwd, planPath), "utf8") : undefined;
		if (snapshot !== undefined && summarizeDiscussionQueue(snapshot).blocksExecutionReview) {
			ctx.ui.notify("Unanswered decisions remain. Review the plan's decision wizard before execution.", "warning");
			return "cancel";
		}
		const review = buildPlanReviewMarkdown(planPath, todos, (path) =>
			readFileSync(resolve(ctx.cwd, path), "utf8"),
		);
		const markdown = buildPlanReviewDisplayMarkdown({ planPath, todoCount: todos.length, review });
		let choice: PlanReviewChoice | undefined;
		try {
			const mode = (ctx as ExtensionContext & { mode?: string }).mode;
			if (mode !== undefined && mode !== "tui") throw new Error("Terminal UI unavailable");
			choice = await ctx.ui.custom<PlanReviewChoice | undefined>(
				(_tui, theme, _keybindings, done) => new PlanReviewComponent(markdown, todos.length, theme, done),
				{ overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "center" } },
			);
		} catch (error) {
			ctx.ui.notify(`Plan review UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`, "warning");
			const fallbackChoices = [
				todos.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
				"Stay in plan mode", "Refine the plan", "Cancel",
			];
			choice = mapPlanReviewFallbackChoice(await ctx.ui.select("Plan mode - choose next action after reviewing the saved plan file", fallbackChoices));
		}
		if (planPath && readFileSync(resolve(ctx.cwd, planPath), "utf8") !== snapshot) {
			ctx.ui.notify("Plan changed during review. Execution approval discarded; review the updated plan.", "warning");
			return "cancel";
		}
		return choice;
	}
}
