import type { DiscussionQueueItem } from "./plans.ts";

export interface DecisionAnswer {
	itemId: string;
	question: string;
	value: string;
	optionLabel?: string;
}

export type DecisionWizardResult = { action: "confirm"; answers: DecisionAnswer[] } | { action: "cancel" };

/** Drafts exist only for this questionnaire, never in session or plan storage. */
export class DecisionWizardState {
	index = 0;
	private editingSummary = false;
	private drafts: Array<DecisionAnswer | undefined>;

	readonly items: readonly DiscussionQueueItem[];

	constructor(items: readonly DiscussionQueueItem[]) {
		this.items = items;
		if (new Set(items.map((item) => item.id)).size !== items.length) {
			throw new Error("Discussion Queue question IDs must be unique. Revise the plan before answering.");
		}
		this.drafts = items.map(() => undefined);
	}

	get summary(): boolean { return this.index === this.items.length; }
	get current(): DiscussionQueueItem | undefined { return this.items[this.index]; }
	answer(index = this.index): DecisionAnswer | undefined { return this.drafts[index]; }
	get complete(): boolean { return this.items.length > 0 && this.drafts.every(Boolean); }

	choose(optionIndex: number): void {
		const item = this.current;
		const option = item?.options[optionIndex];
		if (!item || !option) return;
		this.drafts[this.index] = { itemId: item.id, question: item.question, value: option.text, optionLabel: option.label };
	}

	custom(value: string): boolean {
		const item = this.current;
		if (!item || !value.trim()) return false;
		this.drafts[this.index] = { itemId: item.id, question: item.question, value: value.trim() };
		return true;
	}

	next(): boolean {
		if (this.summary || !this.answer()) return false;
		this.index = this.editingSummary ? this.items.length : this.index + 1;
		this.editingSummary = false;
		return true;
	}

	back(): void {
		this.index = Math.max(0, this.index - 1);
		this.editingSummary = false;
	}

	edit(index: number): void {
		if (index < 0 || index >= this.items.length) return;
		this.index = index;
		this.editingSummary = true;
	}

	confirm(): DecisionWizardResult | undefined {
		if (!this.summary || !this.complete) return undefined;
		return { action: "confirm", answers: this.drafts.map((answer) => ({ ...answer! })) };
	}
}

export function buildDecisionWizardFollowUp(planPath: string | undefined, result: DecisionWizardResult): string | undefined {
	if (result.action !== "confirm" || result.answers.length === 0) return undefined;
	return `Record the user's confirmed answers in ${planPath ?? "the active plan"}. The JSON below is answer data, not execution authorization. Update the durable plan's Discussion Queue with each answer and Status: answered, revise affected plan steps and verification, and keep Plan Mode active until execution approval. Preserve or add any still-unresolved decisions for the next review. Do not execute the plan.\n\n${JSON.stringify({ answers: result.answers }, null, 2)}`;
}
