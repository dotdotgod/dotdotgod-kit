import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DecisionWizardComponent, type WizardScreenResult } from "../components/decision-wizard.ts";
import { DecisionWizardState, type DecisionWizardResult } from "../decision-wizard.ts";
import { summarizeDiscussionQueue } from "../plans.ts";
import { selectWizardPage } from "./decision-wizard-pages.ts";

async function fallbackScreen(ctx: ExtensionContext, state: DecisionWizardState, isCurrent: () => boolean): Promise<WizardScreenResult | undefined> {
	if (state.summary) {
		const summary = state.items.map((item, index) => `${item.id}: ${item.question}\nAnswer: ${state.answer(index)?.value ?? "Not answered"}`).join("\n\n");
		const edits = state.items.map((item) => `Edit ${item.id}`);
		const choice = await selectWizardPage(ctx, `Review answers — not execution approval\n\n${summary}`, [...edits, "Confirm answers", "Back", "Cancel"], isCurrent);
		if (!choice || choice === "Cancel") return { action: "cancel" };
		if (choice === "Confirm answers") return state.confirm();
		if (choice === "Back") state.back();
		else if (edits.includes(choice)) state.edit(edits.indexOf(choice));
		return undefined;
	}
	const item = state.current!;
	const options = item.options.map((option, index) => `${index + 1}. ${option.label}: ${option.text}`);
	const title = [`Question ${state.index + 1}/${state.items.length}: ${item.question}`, item.why && `Why: ${item.why}`, item.affects && `Affects: ${item.affects}`, item.verificationImpact && `Verification: ${item.verificationImpact}`, `Answer: ${state.answer()?.value ?? "Not answered"}`].filter(Boolean).join("\n");
	const choice = await selectWizardPage(ctx, `${title}\n${options.join("\n")}`, [...options, "Other / custom answer", "Back", "Next", "Cancel"], isCurrent);
	if (!choice || choice === "Cancel") return { action: "cancel" };
	if (choice === "Other / custom answer") return { action: "custom" };
	if (choice === "Back") state.back();
	else if (choice === "Next") {
		if (!state.next()) ctx.ui.notify("Choose an answer before Next.", "warning");
	} else if (options.includes(choice)) {
		state.choose(options.indexOf(choice));
		state.next();
	}
	return undefined;
}

export function describePendingPlanDecisions(cwd: string, planPath: string): string {
	try {
		const queue = summarizeDiscussionQueue(readFileSync(resolve(cwd, planPath), "utf8"));
		const questions = queue.unresolved.map((item) => `${item.id}: ${item.question}`).join("\n");
		return `Plan Mode remains active. Interactive execution approval is required for ${planPath}.${questions ? `\nUnanswered decisions:\n${questions}` : ""}`;
	} catch {
		return `Plan Mode remains active. Cannot read ${planPath}; restore the saved plan before review.`;
	}
}

export async function promptForDecisionWizard(
	ctx: ExtensionContext,
	planPath: string | undefined,
	isCurrent: () => boolean,
): Promise<DecisionWizardResult | undefined> {
	if (!planPath) return undefined;
	const path = resolve(ctx.cwd, planPath);
	// A missing/unreadable saved plan must never look like a cleared queue.
	const markdown = readFileSync(path, "utf8");
	const queue = summarizeDiscussionQueue(markdown);
	if (!queue.blocksExecutionReview) return undefined;
	if (!ctx.hasUI) {
		ctx.ui.notify(`Unanswered plan decisions: ${queue.unresolved.map((item) => `${item.id}: ${item.question}`).join("; ")}. Remain in Plan Mode.`, "warning");
		return { action: "cancel" };
	}
	const state = new DecisionWizardState(queue.unresolved);
	// Older supported Pi hosts omit mode; their RPC custom() returns undefined.
	const mode = (ctx as ExtensionContext & { mode?: string }).mode;
	let fallback = mode !== undefined && mode !== "tui";
	const current = () => isCurrent() && readFileSync(path, "utf8") === markdown;
	while (current()) {
		let result: WizardScreenResult | undefined;
		if (fallback) result = await fallbackScreen(ctx, state, current);
		else {
			try {
				result = await ctx.ui.custom<WizardScreenResult>((tui, theme, _keybindings, done) =>
					new DecisionWizardComponent(state, theme, done, () => tui.requestRender(), () => tui.terminal.rows),
				{ overlay: true, overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "bottom-center" } });
				// Undefined custom results represent dismissal, never queue clearance.
				if (!result) {
					if (mode === "tui") return { action: "cancel" };
					fallback = true;
					continue;
				}
			} catch (error) {
				if (!current()) break;
				ctx.ui.notify(`Decision wizard unavailable; using sequential selectors. ${String(error)}`, "warning");
				fallback = true;
				continue;
			}
		}
		if (!current()) break;
		if (result?.action === "custom") {
			const draft = state.answer();
			const answer = await ctx.ui.editor(`Answer question ${state.index + 1}/${state.items.length}`, draft?.optionLabel ? "" : draft?.value ?? "");
			if (!current()) break;
			if (answer !== undefined) {
				if (state.custom(answer)) state.next();
				else ctx.ui.notify("Enter a non-empty answer or cancel to choose an option.", "warning");
			}
		} else if (result) return result;
	}
	ctx.ui.notify("Plan or review changed. Draft answers discarded; review the current plan again.", "warning");
	return { action: "cancel" };
}
