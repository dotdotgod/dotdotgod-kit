import type { Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	PLAN_REVIEW_ACTIONS,
	getNextPlanReviewActionIndex,
	getPlanReviewActionChoice,
	getPlanReviewScrollState,
	type DiscussionQueueItem,
	type DiscussionQueueResult,
	type PlanReviewChoice,
} from "../plans.ts";

const PLAN_REVIEW_VISIBLE_LINES = 48;

function getSafeCustomComponentWidth(width: number): number {
	const requestedWidth = Number.isFinite(width) ? Math.floor(width) : 80;
	const terminalWidth = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : requestedWidth;
	return Math.max(20, Math.min(requestedWidth, terminalWidth) - 2);
}

function getCustomComponentScrollOffset(currentOffset: number, data: string): number | undefined {
	let wheel = 0;
	if (/\x1b\[<64;\d+;\d+[mM]/.test(data) || /\x1b\[M[`]/.test(data)) wheel = -3;
	else if (/\x1b\[<65;\d+;\d+[mM]/.test(data) || /\x1b\[M[a]/.test(data)) wheel = 3;
	if (wheel !== 0) return Math.max(0, currentOffset + wheel);
	if (matchesKey(data, Key.up)) return Math.max(0, currentOffset - 1);
	if (matchesKey(data, Key.down)) return currentOffset + 1;
	if (matchesKey(data, Key.home)) return 0;
	if (matchesKey(data, Key.end)) return Number.MAX_SAFE_INTEGER;
	if (matchesKey(data, Key.pageUp)) return Math.max(0, currentOffset - PLAN_REVIEW_VISIBLE_LINES);
	if (matchesKey(data, Key.pageDown)) return currentOffset + PLAN_REVIEW_VISIBLE_LINES;
	return undefined;
}

function renderMarkdownLines(markdown: string, width: number): string[] {
	return new Markdown(markdown, 0, 0, getMarkdownTheme())
		.render(width)
		.map((line) => visibleWidth(line) > width ? truncateToWidth(line, width) : line);
}

export class PlanReviewComponent {
	private offset = 0;
	private selectedActionIndex = 0;
	private cachedWidth?: number;
	private cachedMarkdownLines?: string[];

	constructor(
		private readonly markdown: string,
		private readonly todoCount: number,
		private readonly theme: Theme,
		private readonly done: (choice: PlanReviewChoice | undefined) => void,
	) {}

	handleInput(data: string): void {
		const nextOffset = getCustomComponentScrollOffset(this.offset, data);
		if (nextOffset !== undefined) {
			this.offset = nextOffset;
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) this.selectedActionIndex = getNextPlanReviewActionIndex(this.selectedActionIndex, -1);
		else if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) this.selectedActionIndex = getNextPlanReviewActionIndex(this.selectedActionIndex, 1);
		else if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) this.done(getPlanReviewActionChoice(this.selectedActionIndex));
		else if (data === "e" || data === "E") this.done("execute");
		else if (data === "s" || data === "S") this.done("stay");
		else if (data === "r" || data === "R") this.done("refine");
		else if (data === "c" || data === "C" || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.done("cancel");
		this.invalidate();
	}

	render(width: number): string[] {
		const safeWidth = getSafeCustomComponentWidth(width);
		const bodyLines = this.getMarkdownLines(safeWidth);
		const scroll = getPlanReviewScrollState(this.offset, bodyLines.length, PLAN_REVIEW_VISIBLE_LINES);
		this.offset = scroll.offset;
		const th = this.theme;
		const title = ` Plan Mode Review (${this.todoCount === 1 ? "1 step" : `${this.todoCount} steps`}) `;
		const controls = "↑/↓ PgUp/PgDn Home/End scroll · ←/→ Tab select · Enter confirm · e/s/r/c shortcuts";
		const status = `${scroll.offset + Math.min(bodyLines.length, 1)}-${Math.min(bodyLines.length, scroll.offset + PLAN_REVIEW_VISIBLE_LINES)} / ${bodyLines.length}`;
		const lines = [
			truncateToWidth(th.fg("borderAccent", "─".repeat(2)) + th.fg("accent", title) + th.fg("borderAccent", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
			truncateToWidth(th.fg("dim", `Scroll: ${status}${scroll.canScrollDown ? " · more below" : ""}`), safeWidth),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			...bodyLines.slice(scroll.offset, scroll.offset + PLAN_REVIEW_VISIBLE_LINES),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			this.renderActionBar(safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
		];
		return lines.map((line) => visibleWidth(line) > safeWidth ? truncateToWidth(line, safeWidth) : line);
	}

	invalidate(): void {
		delete this.cachedWidth;
		delete this.cachedMarkdownLines;
	}

	private renderActionBar(width: number): string {
		const parts = PLAN_REVIEW_ACTIONS.map((action, index) => {
			const label = index === this.selectedActionIndex ? `▶ ${action.label} (${action.shortcut})` : `  ${action.label} (${action.shortcut})`;
			const token = `[ ${label} ]`;
			return index === this.selectedActionIndex ? this.theme.fg("accent", this.theme.bold(token)) : this.theme.fg("muted", token);
		});
		const text = parts.join(" ");
		return visibleWidth(text) > width ? truncateToWidth(text, width) : text;
	}

	private getMarkdownLines(width: number): string[] {
		if (this.cachedMarkdownLines && this.cachedWidth === width) return this.cachedMarkdownLines;
		this.cachedWidth = width;
		this.cachedMarkdownLines = renderMarkdownLines(this.markdown, width);
		return this.cachedMarkdownLines;
	}
}

export class DiscussionQueueComponent {
	private itemIndex = 0;
	private optionIndex = 0;

	constructor(
		private readonly planPath: string | undefined,
		private readonly items: readonly DiscussionQueueItem[],
		private readonly totalCount: number,
		private readonly theme: Theme,
		private readonly done: (result: DiscussionQueueResult) => void,
	) {}

	handleInput(data: string): void {
		const current = this.currentItem();
		if (!current) {
			this.done({ action: "cancel" });
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.itemIndex = Math.max(0, this.itemIndex - 1);
			this.optionIndex = 0;
		} else if (matchesKey(data, Key.down)) {
			this.itemIndex = Math.min(this.items.length - 1, this.itemIndex + 1);
			this.optionIndex = 0;
		} else if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) {
			this.optionIndex = this.wrapOptionIndex(current, -1);
		} else if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
			this.optionIndex = this.wrapOptionIndex(current, 1);
		} else if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) {
			const option = this.selectedOption(current);
			this.done({ action: "answer", itemId: current.id, ...(option ? { optionLabel: option.label, optionText: option.text } : {}) });
		} else if (data === "a" || data === "A") this.done({ action: "custom_answer", itemId: current.id });
		else if (data === "d" || data === "D") this.done({ action: "defer", itemId: current.id });
		else if (data === "r" || data === "R") this.done({ action: "research", itemId: current.id });
		else if (data === "p" || data === "P") this.done({ action: "revise", itemId: current.id, rationale: "Preview or revise the saved plan before resolving this discussion item." });
		else if (data === "q" || data === "Q" || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.done({ action: "cancel" });
	}

	invalidate(): void {}

	render(width: number): string[] {
		const safeWidth = Math.max(20, width);
		const item = this.currentItem();
		const th = this.theme;
		const plan = this.planPath ?? "unknown active plan";
		const summary = `Queue ${this.items.length} unresolved · ${this.totalCount} total · Execute review suppressed`;
		const lines = [
			truncateToWidth(th.fg("borderAccent", "─".repeat(2)) + th.fg("accent", " Discussion Queue Console ") + th.fg("borderAccent", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", `Plan: ${plan}`), safeWidth),
			truncateToWidth(th.fg("warning", summary), safeWidth),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
		];
		if (!item) {
			lines.push(truncateToWidth("No unresolved discussion items were found.", safeWidth));
		} else {
			const option = this.selectedOption(item);
			lines.push(truncateToWidth(th.bold(`${item.id} [${[item.type, ...item.flags].join("/") || "discussion"}] ${item.question}`), safeWidth));
			if (item.why) lines.push(truncateToWidth(`Why: ${item.why}`, safeWidth));
			if (item.affects) lines.push(truncateToWidth(`Affects: ${item.affects}`, safeWidth));
			if (item.verificationImpact) lines.push(truncateToWidth(`Verification: ${item.verificationImpact}`, safeWidth));
			lines.push(truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth));
			const options = item.options.length > 0 ? item.options : [{ label: "A", text: "Answer or accept the discussion item as written.", recommended: true }];
			for (let i = 0; i < options.length; i += 1) {
				const candidate = options[i];
				if (!candidate) continue;
				const prefix = i === this.optionIndex ? "▶" : " ";
				const text = `${prefix} ${candidate.label}. ${candidate.text}${candidate.recommended ? "" : ""}`;
				lines.push(truncateToWidth(i === this.optionIndex ? th.fg("accent", text) : text, safeWidth));
			}
			if (option) lines.push(truncateToWidth(th.fg("dim", `Selected: ${option.label}. ${option.text}`), safeWidth));
		}
		lines.push(truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth));
		lines.push(truncateToWidth(th.fg("dim", `${Math.min(this.itemIndex + 1, this.items.length)}/${this.items.length} · ↑/↓ item · ←/→ Tab option · Enter answer · a custom · d defer · r research · p revise · q cancel`), safeWidth));
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	private currentItem(): DiscussionQueueItem | undefined {
		return this.items[this.itemIndex];
	}

	private selectedOption(item: DiscussionQueueItem): DiscussionQueueItem["options"][number] | undefined {
		const options = item.options.length > 0 ? item.options : [{ label: "A", text: "Answer or accept the discussion item as written.", recommended: true }];
		return options[Math.min(this.optionIndex, options.length - 1)];
	}

	private wrapOptionIndex(item: DiscussionQueueItem, direction: -1 | 1): number {
		const count = Math.max(1, item.options.length);
		return (this.optionIndex + direction + count) % count;
	}
}
