import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { PlanReviewComponent } from "../components/plan-mode-components.js";
import { extractPlanVerificationContract, type ReviewSnapshotResult } from "../execution-evidence.ts";
import {
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewFallbackPrompt,
	mapPlanReviewFallbackChoice,
	summarizeDiscussionQueue,
	type PlanReviewChoice,
} from "../plans.ts";
import { extractTodoItems } from "../todos.ts";
import { formatPlanReviewFailureNotice } from "../presentation.ts";
import { promptForDecisionWizard } from "./decision-wizard.ts";
import { resolveValidatedPlanPath } from "./plan-artifact.ts";

export { canonicalPath } from "../policy/markdown.ts";
export { validatePlanPath } from "./plan-artifact.ts";

type ReviewSnapshot = Extract<ReviewSnapshotResult, { ok: true }>;
const sources = new WeakMap<ReviewSnapshot, { bytes: Buffer; target: string }>();

export function loadReviewSnapshot(cwd: string, candidate?: string): ReviewSnapshotResult {
	const file = resolveValidatedPlanPath(cwd, candidate);
	if (!file) return { ok: false, reason: "invalid_path" };
	let bytes: Buffer;
	try {
		bytes = readFileSync(file.target);
	} catch {
		return { ok: false, reason: "unreadable" };
	}
	try {
		const markdown = bytes.toString("utf8");
		const verificationContract = extractPlanVerificationContract(markdown, cwd);
		if (!verificationContract.ok) return { ok: false, reason: "malformed_verification" };
		const snapshot: ReviewSnapshot = {
			ok: true, planPath: file.planPath, markdown,
			todos: extractTodoItems(markdown), discussionQueue: summarizeDiscussionQueue(markdown),
			verificationContract, verificationCount: verificationContract.checks.length,
		};
		sources.set(snapshot, { bytes, target: file.target });
		return snapshot;
	} catch {
		return { ok: false, reason: "unexpected_error" };
	}
}

export class ReviewGateController {
	loadReviewSnapshot = loadReviewSnapshot;
	promptForDiscussionQueue(ctx: ExtensionContext, snapshot: ReviewSnapshot, isCurrent: () => boolean) {
		return promptForDecisionWizard(ctx, snapshot.planPath, isCurrent, {
			bytes: sources.get(snapshot)!.bytes, queue: snapshot.discussionQueue,
		});
	}

	async promptForPlanReviewChoice(ctx: ExtensionContext, snapshot: ReviewSnapshot): Promise<PlanReviewChoice | undefined> {
		if (!ctx.hasUI) return "cancel";
		const { planPath, todos, verificationCount } = snapshot;
		if (snapshot.discussionQueue.blocksExecutionReview) {
			ctx.ui.notify("Unanswered decisions remain. Review the plan's decision wizard before execution.", "warning");
			return "cancel";
		}
		const fallback = async () => mapPlanReviewFallbackChoice(await ctx.ui.select(
			buildPlanReviewFallbackPrompt(planPath, todos.length, verificationCount),
			[todos.length > 0 ? "Execute the plan (track progress)" : "Execute the plan", "Stay in plan mode", "Refine the plan", "Cancel"],
		));
		const mode = (ctx as ExtensionContext & { mode?: string }).mode;
		let choice: PlanReviewChoice | undefined;
		if (mode !== undefined && mode !== "tui") choice = await fallback();
		else {
			const markdown = buildPlanReviewDisplayMarkdown({
				planPath, todoCount: todos.length, verificationCount, review: { source: "file", markdown: snapshot.markdown },
			});
			try {
				choice = await ctx.ui.custom<PlanReviewChoice | undefined>(
					(_tui, theme, _keybindings, done) => new PlanReviewComponent(markdown, todos.length, theme, done, verificationCount),
					{ overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "center" } },
				);
			} catch {
				ctx.ui.notify("Plan review UI unavailable; using fallback selector.", "warning");
				choice = await fallback();
			}
		}
		if (choice !== "execute") return choice;
		const source = sources.get(snapshot);
		const fresh = resolveValidatedPlanPath(ctx.cwd, planPath);
		try {
			if (fresh && source?.target === fresh.target && source.bytes.equals(readFileSync(fresh.target))) return choice;
		} catch { /* A missing or unreadable plan invalidates approval. */ }
		const notice = formatPlanReviewFailureNotice("changed_during_review");
		ctx.ui.notify(notice.message, notice.level);
		return "cancel";
	}
}
