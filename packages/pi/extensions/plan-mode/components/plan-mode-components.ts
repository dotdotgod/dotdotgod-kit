import type { Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	PLAN_REVIEW_ACTIONS,
	getNextPlanReviewActionIndex,
	getPlanReviewActionChoice,
	getPlanReviewBodyViewportLines,
	getPlanReviewScrollState,
	getPlanReviewVisibleBodyLines,
	type PlanReviewChoice,
} from "../plans.ts";

function getPlanReviewBodyLineCount(): number {
	return getPlanReviewVisibleBodyLines(process.stdout.rows);
}

function getSafeCustomComponentWidth(width: number): number {
	const requestedWidth = Number.isFinite(width) ? Math.floor(width) : 80;
	const terminalWidth = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : requestedWidth;
	return Math.max(20, Math.min(requestedWidth, terminalWidth) - 2);
}

function getCustomComponentScrollOffset(currentOffset: number, data: string, visibleLines: number): number | undefined {
	let wheel = 0;
	if (/\x1b\[<64;\d+;\d+[mM]/.test(data) || /\x1b\[M[`]/.test(data)) wheel = -3;
	else if (/\x1b\[<65;\d+;\d+[mM]/.test(data) || /\x1b\[M[a]/.test(data)) wheel = 3;
	if (wheel !== 0) return Math.max(0, currentOffset + wheel);
	if (matchesKey(data, Key.up)) return Math.max(0, currentOffset - 1);
	if (matchesKey(data, Key.down)) return currentOffset + 1;
	if (matchesKey(data, Key.home)) return 0;
	if (matchesKey(data, Key.end)) return Number.MAX_SAFE_INTEGER;
	if (matchesKey(data, Key.pageUp)) return Math.max(0, currentOffset - visibleLines);
	if (matchesKey(data, Key.pageDown)) return currentOffset + visibleLines;
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
		const visibleLines = getPlanReviewBodyLineCount();
		const nextOffset = getCustomComponentScrollOffset(this.offset, data, visibleLines);
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
		const visibleLines = getPlanReviewBodyLineCount();
		const scroll = getPlanReviewScrollState(this.offset, bodyLines.length, visibleLines);
		this.offset = scroll.offset;
		const th = this.theme;
		const title = ` Plan Mode Review (${this.todoCount === 1 ? "1 step" : `${this.todoCount} steps`}) `;
		const controls = "↑/↓ PgUp/PgDn Home/End scroll · ←/→ Tab select · Enter confirm · e/s/r/c shortcuts";
		const status = `${scroll.offset + Math.min(bodyLines.length, 1)}-${Math.min(bodyLines.length, scroll.offset + visibleLines)} / ${bodyLines.length}`;
		const lines = [
			truncateToWidth(th.fg("borderAccent", "─".repeat(2)) + th.fg("accent", title) + th.fg("borderAccent", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
			truncateToWidth(th.fg("dim", `Scroll: ${status}${scroll.canScrollDown ? " · more below" : ""}`), safeWidth),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			...getPlanReviewBodyViewportLines(bodyLines, scroll.offset, visibleLines),
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
