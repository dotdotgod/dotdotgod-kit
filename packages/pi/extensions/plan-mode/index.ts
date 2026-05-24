/**
 * Customized Plan Mode Extension
 *
 * Safe exploration mode for code analysis and docs/plan plan-file management.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, Text, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { recordContextMetric } from "../context-metrics/utils.js";
import { buildLoadPrompt, collectSnapshot } from "../load-project/utils.js";
import { NORMAL_MODE_TOOLS } from "./runtime/constants.js";
import { collectGitChangedPaths, fingerprintPath, formatPlanCliContextSummary, runDotdotgodCli, type PlanCliCommandResult } from "./runtime/dotdotgod-cli.js";
import { getMessageText, getTextContent, isAssistantMessage, truncateText } from "./runtime/messages.js";
import { ARCHIVE_DIRECTORY, getToolPath, isActivePlanMarkdownPath, isManagedPlanMarkdownPath, normalizeToolPath, PLAN_DIRECTORY, planPathExists } from "./runtime/paths.js";
import {
	buildPlanCompactionInstructions,
	buildPlanCompactionResumePrompt,
	PLAN_REVIEW_ACTIONS,
	planModeFollowUpDeliveryOptions,
	buildDiscussionQueueFollowUp,
	buildPlanExecutionDecision,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanReviewRefinePrompt,
	buildPlanValidationBlockerDisplay,
	buildPlanValidationCustomMarkdown,
	buildPlanValidationRefinePrompt,
	buildPlanStageAuthoringPrompt,
	getNextPlanValidationStage,
	getPlanStageFromPath,
	isPlanValidationStage,
	PLAN_VALIDATION_STAGES,
	buildPlanModeContextPrompt,
	buildPlanModeRequestFraming,
	detectPlanExecutionIntent,
	extractTodoItems,
	summarizeDiscussionQueue,
	formatCompactImpactSummary,
	formatExpandableToolOutput,
	formatMultiImpactSummary,
	formatReferenceExpansionSummary,
	getChangedPathFromDotdotgodImpactCommand,
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
	normalizeImpactPath,
	normalizePlanCommandRequest,
	mergeImpactCheckPaths,
	pendingImpactSummary,
	resolveMentionedPlanPath,
	resolvePlanModeTools,
	getCurrentPlanReadmePath,
	getNextPlanReviewActionIndex,
	getPlanCompactionReason,
	getPlanReviewActionChoice,
	getPlanReviewScrollState,
	mapPlanReviewFallbackChoice,
	resolvePlanExecutionTarget,
	selectPlanImpactPaths,
	shouldAllowPlanModeBashCommand,
	shouldTrackImpactPath,
	upsertPendingImpact,
	clearPendingImpactForPath,
	isBroadVerificationCommand,
	isCommitLikeCommand,
	shouldLoadProjectMemoryForPlanning,
	shouldPromptForPlanChoice,
	shouldShapePlanningContextOnAgentStart,
	selectLatestPlanningRequest,
	markCompletedSteps,
	type ImpactCheckRecord,
	type PendingImpactItem,
	type DiscussionQueueItem,
	type DiscussionQueueResult,
	type PlanCompactionFocus,
	type PlanReviewChoice,
	type PlanValidationResult,
	type PlanValidationStage,
	type TodoItem,
} from "./utils.js";

const DotdotgodGraphImpactParams = Type.Object({
	changed: Type.Optional(Type.String({ description: "Changed file path to check with dotdotgod graph impact" })),
	paths: Type.Optional(Type.Array(Type.String(), { description: "Changed file paths to check with dotdotgod graph impact" })),
});

const PLAN_REVIEW_VISIBLE_LINES = 48;

function getSafeCustomComponentWidth(width: number): number {
	const requestedWidth = Number.isFinite(width) ? Math.floor(width) : 80;
	const terminalWidth = process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : requestedWidth;
	return Math.max(20, Math.min(requestedWidth, terminalWidth) - 2);
}

function truncateCustomComponentLine(line: string, width: number): string {
	return visibleWidth(line) > width ? truncateToWidth(line, width) : line;
}

class PlanReviewComponent {
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
		const wheel = this.getWheelDelta(data);
		if (wheel !== 0) {
			this.offset = Math.max(0, this.offset + wheel);
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.up)) this.offset = Math.max(0, this.offset - 1);
		else if (matchesKey(data, Key.down)) this.offset += 1;
		else if (matchesKey(data, Key.home)) this.offset = 0;
		else if (matchesKey(data, Key.end)) this.offset = Number.MAX_SAFE_INTEGER;
		else if (matchesKey(data, Key.pageUp)) this.offset = Math.max(0, this.offset - PLAN_REVIEW_VISIBLE_LINES);
		else if (matchesKey(data, Key.pageDown)) this.offset += PLAN_REVIEW_VISIBLE_LINES;
		else if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) this.selectedActionIndex = getNextPlanReviewActionIndex(this.selectedActionIndex, -1);
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
		return lines.map((line) => truncateCustomComponentLine(line, safeWidth));
	}

	private renderActionBar(width: number): string {
		const parts = PLAN_REVIEW_ACTIONS.map((action, index) => {
			const label = index === this.selectedActionIndex ? `▶ ${action.label} (${action.shortcut})` : `  ${action.label} (${action.shortcut})`;
			const token = `[ ${label} ]`;
			return index === this.selectedActionIndex ? this.theme.fg("accent", this.theme.bold(token)) : this.theme.fg("muted", token);
		});
		return truncateCustomComponentLine(parts.join(" "), width);
	}

	invalidate(): void {
		delete this.cachedWidth;
		delete this.cachedMarkdownLines;
	}

	private getMarkdownLines(width: number): string[] {
		if (this.cachedMarkdownLines && this.cachedWidth === width) return this.cachedMarkdownLines;
		this.cachedWidth = width;
		this.cachedMarkdownLines = new Markdown(this.markdown, 0, 0, getMarkdownTheme()).render(width).map((line) => truncateCustomComponentLine(line, width));
		return this.cachedMarkdownLines;
	}

	private getWheelDelta(data: string): number {
		if (/\x1b\[<64;\d+;\d+[mM]/.test(data) || /\x1b\[M[`]/.test(data)) return -3;
		if (/\x1b\[<65;\d+;\d+[mM]/.test(data) || /\x1b\[M[a]/.test(data)) return 3;
		return 0;
	}
}

type ValidationBlockerAction = "refine" | "cancel";

class ValidationBlockerComponent {
	private offset = 0;
	private selectedActionIndex = 0;
	private cachedWidth?: number;
	private cachedMarkdownLines?: string[];

	constructor(
		private readonly markdown: string,
		private readonly theme: Theme,
		private readonly done: (choice: ValidationBlockerAction) => void,
	) {}

	handleInput(data: string): void {
		const wheel = this.getWheelDelta(data);
		if (wheel !== 0) {
			this.offset = Math.max(0, this.offset + wheel);
			this.invalidate();
			return;
		}
		if (matchesKey(data, Key.up)) this.offset = Math.max(0, this.offset - 1);
		else if (matchesKey(data, Key.down)) this.offset += 1;
		else if (matchesKey(data, Key.home)) this.offset = 0;
		else if (matchesKey(data, Key.end)) this.offset = Number.MAX_SAFE_INTEGER;
		else if (matchesKey(data, Key.pageUp)) this.offset = Math.max(0, this.offset - PLAN_REVIEW_VISIBLE_LINES);
		else if (matchesKey(data, Key.pageDown)) this.offset += PLAN_REVIEW_VISIBLE_LINES;
		else if (matchesKey(data, Key.left) || matchesKey(data, Key.shift("tab"))) this.selectedActionIndex = this.selectedActionIndex === 0 ? 1 : 0;
		else if (matchesKey(data, Key.right) || matchesKey(data, Key.tab)) this.selectedActionIndex = this.selectedActionIndex === 0 ? 1 : 0;
		else if (matchesKey(data, Key.enter) || matchesKey(data, Key.return)) this.done(this.selectedActionIndex === 0 ? "refine" : "cancel");
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
		const controls = "↑/↓ PgUp/PgDn scroll · ←/→ Tab select · Enter confirm · r refine · c/Esc cancel";
		const actions = ["Refine", "Cancel"].map((label, index) => {
			const token = index === this.selectedActionIndex ? `[ ▶ ${label} ]` : `[   ${label} ]`;
			return index === this.selectedActionIndex ? th.fg("accent", th.bold(token)) : th.fg("muted", token);
		}).join(" ");
		return [
			truncateToWidth(th.fg("borderAccent", "──") + th.fg("accent", " Plan Validation Gate ") + th.fg("borderAccent", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			...bodyLines.slice(scroll.offset, scroll.offset + PLAN_REVIEW_VISIBLE_LINES),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			truncateCustomComponentLine(actions, safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
		].map((line) => truncateCustomComponentLine(line, safeWidth));
	}

	invalidate(): void {
		delete this.cachedWidth;
		delete this.cachedMarkdownLines;
	}

	private getMarkdownLines(width: number): string[] {
		if (this.cachedMarkdownLines && this.cachedWidth === width) return this.cachedMarkdownLines;
		this.cachedWidth = width;
		this.cachedMarkdownLines = new Markdown(this.markdown, 0, 0, getMarkdownTheme()).render(width).map((line) => truncateCustomComponentLine(line, width));
		return this.cachedMarkdownLines;
	}

	private getWheelDelta(data: string): number {
		if (/\x1b\[<64;\d+;\d+[mM]/.test(data) || /\x1b\[M[`]/.test(data)) return -3;
		if (/\x1b\[<65;\d+;\d+[mM]/.test(data) || /\x1b\[M[a]/.test(data)) return 3;
		return 0;
	}
}

class DiscussionQueueComponent {
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

export default function planModeExtension(pi: ExtensionAPI): void {

	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let activePlanTouched = false;
	let pendingPlanChoicePath: string | undefined;
	let suppressPlanChoiceForInlineRequest = false;
	let currentPlanAuthoringStage: PlanValidationStage | undefined;
	let planCompactionInFlight = false;
	let lastPlanCompactionEntryCount: number | undefined;
	let lastPlanCompactionReason: string | undefined;
	let planningLoadInFlight = false;
	let lastPlanningLoadEntryCount: number | undefined;
	let pendingPlanningLoadAfterCompaction = false;
	let pendingPlanningLoadPrompt: string | undefined;
	let pendingPlanningLoadReason: string | undefined;
	let pendingPlanningResumePrompt: string | undefined;
	let pendingPlanningResumeReason: string | undefined;
	let planningContextShapePending = false;
	let planModeFullPromptInjected = false;
	let planningCliContextSummary: string | undefined;
	let planningCliContextChecked = false;
	let lastPlanningRequest: string | undefined;
	let pendingInlinePlanningRequest: string | undefined;
	let currentPlanPath: string | undefined;
	let touchedPlanArchivePaths: string[] = [];
	let activePlanModeTools: string[] = [];
	let pendingImpactItems: PendingImpactItem[] = [];
	let impactCheckRecords: ImpactCheckRecord[] = [];

	pi.registerFlag("plan", {
		description: "Start in plan mode (safe exploration plus docs/plan updates)",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("plan-extra-tools", {
		description: "Comma-separated extra tool names to allow in Plan Mode when those tools are installed",
		type: "string",
		default: "",
	});

	pi.registerTool({
		name: "dotdotgod_graph_impact",
		label: "dotdotgod graph impact",
		description: "Run bounded dotdotgod graph impact checks for changed files and clear pending Pi impact reminders after success.",
		promptSnippet: "Run dotdotgod graph impact for changed files before broad tests, commits, pushes, or publishing.",
		promptGuidelines: ["Use dotdotgod_graph_impact after source/config edits and before broad tests, commits, pushes, or publishing when changed files may affect related docs/tests/files."],
		parameters: DotdotgodGraphImpactParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const paths = [...(params.changed ? [params.changed] : []), ...(params.paths ?? [])];
			if (paths.length === 0) {
				return { content: [{ type: "text", text: "Error: changed or paths is required" }], details: { ok: false, error: "changed or paths is required", summary: "Error: changed or paths is required" } };
			}
			const result = runImpactChecks(ctx, paths, "tool");
			return {
				content: [{ type: "text", text: result.summary }],
				details: { ok: result.failed.length === 0, checked: result.checked, failed: result.failed, pending: pendingImpactItems, summary: result.summary },
			};
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Running dotdotgod graph impact..."), 0, 0);
			const details = result.details && typeof result.details === "object" ? (result.details as { summary?: unknown; error?: unknown }) : undefined;
			const summary = typeof details?.summary === "string" ? details.summary : typeof details?.error === "string" ? `Error: ${details.error}` : "dotdotgod graph impact completed.";
			const text = formatExpandableToolOutput(summary, expanded, keyHint("app.tools.expand", expanded ? "to collapse" : "to expand"));
			return new Text(text, 0, 0);
		},
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (executionMode && todoItems.length > 0) {
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}
	}

	function getSessionEntryCount(ctx: ExtensionContext): number {
		return ctx.sessionManager.getEntries().length;
	}

	function updateImpactStatus(ctx: ExtensionContext): void {
		if (pendingImpactItems.length === 0) {
			ctx.ui.setStatus("impact-check", undefined);
			ctx.ui.setWidget("impact-check", undefined);
			return;
		}
		ctx.ui.setStatus("impact-check", ctx.ui.theme.fg("warning", `🔎 ${pendingImpactItems.length}`));
		ctx.ui.setWidget("impact-check", [
			"dotdotgod impact check pending:",
			...pendingImpactItems.slice(0, 5).map((item) => `- ${item.path}`),
			...(pendingImpactItems.length > 5 ? [`- ... ${pendingImpactItems.length - 5} more`] : []),
			"Run /impact-check or dotdotgod_graph_impact before committing.",
		]);
	}

	function trackPendingImpact(ctx: ExtensionContext, path: string, reason: PendingImpactItem["reason"]): void {
		const normalized = normalizeImpactPath(ctx.cwd, path);
		if (!normalized || !shouldTrackImpactPath(normalized)) return;
		const fingerprint = fingerprintPath(ctx.cwd, normalized);
		pendingImpactItems = upsertPendingImpact(pendingImpactItems, {
			path: normalized,
			...(fingerprint ? { fingerprint } : {}),
			reason,
			touchedAt: new Date().toISOString(),
		});
		updateImpactStatus(ctx);
		persistState();
	}

	function clearPendingImpact(ctx: ExtensionContext, path: string, source: ImpactCheckRecord["source"], data?: unknown, summary?: string, checkedFingerprint?: string): void {
		const normalized = normalizeImpactPath(ctx.cwd, path);
		if (!normalized) return;
		const fingerprint = fingerprintPath(ctx.cwd, normalized);
		if (!checkedFingerprint || !fingerprint || checkedFingerprint === fingerprint) {
			pendingImpactItems = clearPendingImpactForPath(pendingImpactItems, normalized);
		}
		impactCheckRecords = [...impactCheckRecords, { path: normalized, ...(fingerprint ? { fingerprint } : {}), ranAt: new Date().toISOString(), source, ...(summary ? { summary } : {}) }].slice(-30);
		void data;
		updateImpactStatus(ctx);
		persistState();
	}

	function runImpactChecks(ctx: ExtensionContext, paths: string[], source: ImpactCheckRecord["source"]): { summary: string; checked: string[]; failed: string[] } {
		const normalizedPaths = [...new Set(paths.map((path) => normalizeImpactPath(ctx.cwd, path)).filter((path): path is string => Boolean(path)).filter(shouldTrackImpactPath))];
		const results: Array<{ path: string; data?: unknown; error?: string; summary?: string }> = [];
		const checked: string[] = [];
		const failed: string[] = [];
		const checkedFingerprints = new Map<string, string | undefined>();
		for (const path of normalizedPaths) {
			checkedFingerprints.set(path, fingerprintPath(ctx.cwd, path));
			const result = runDotdotgodCli(ctx.cwd, ["graph", "impact", ctx.cwd, "--changed", path, "--yml"]);
			if (result.ok) {
				results.push({ path, data: result.data, ...(result.stdout ? { summary: result.stdout } : {}) });
				checked.push(path);
			} else {
				results.push({ path, error: result.error ?? "unknown error" });
				failed.push(path);
			}
		}
		const summary = formatMultiImpactSummary(results);
		for (const path of checked) {
			clearPendingImpact(ctx, path, source, results.find((result) => result.path === path)?.data, summary, checkedFingerprints.get(path));
		}
		return { summary, checked, failed };
	}

	function buildPendingImpactReminder(): string | undefined {
		if (pendingImpactItems.length === 0) return undefined;
		return `[DOTDOTGOD IMPACT CHECK PENDING]\nYou changed these files but have not run dotdotgod graph impact:\n${pendingImpactSummary(pendingImpactItems)}\nBefore broad tests, more edits, commit, push, or publish, run dotdotgod_graph_impact or /impact-check and review related docs/tests/files.`;
	}

	function buildCurrentWorkFocus(): PlanCompactionFocus {
		const completed = todoItems.filter((item) => item.completed).length;
		const activePlanPaths = [
			...(currentPlanPath ? [currentPlanPath] : []),
			...touchedPlanArchivePaths.filter((path) => path.startsWith("docs/plan/")),
		];
		const focus: PlanCompactionFocus = {
			activePlanPaths,
			touchedMemoryPaths: touchedPlanArchivePaths,
			pendingLoadAfterCompaction: pendingPlanningLoadAfterCompaction || Boolean(pendingPlanningLoadPrompt),
			constraints: [
				"Use pnpm for workspace commands",
				"Plan Mode blocks source/config mutation until execution mode",
				"Keep docs/archive/README.md included as the archive map",
				"Exclude docs/archive/** bodies by default unless targeted",
			],
		};
		if (lastPlanningRequest) focus.task = lastPlanningRequest;
		if (todoItems.length > 0) focus.todoSummary = `${completed}/${todoItems.length} completed`;
		return focus;
	}

	function requestPlanningCompaction(ctx: ExtensionContext, reason: string): void {
		if (planCompactionInFlight) return;

		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanCompactionEntryCount !== undefined && entryCount - lastPlanCompactionEntryCount < 5) {
			return;
		}

		const focus = buildCurrentWorkFocus();
		planCompactionInFlight = true;
		lastPlanCompactionReason = reason;
		pendingPlanningResumePrompt = buildPlanCompactionResumePrompt(lastPlanningRequest);
		pendingPlanningResumeReason = "plan-mode-compaction-resume";
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-request", { reason, entryCount, focus });
		ctx.ui.notify("Planning context is large; compacting before continuing.", "info");
		ctx.compact({
			customInstructions: buildPlanCompactionInstructions(reason, focus),
			onComplete: () => {
				planCompactionInFlight = false;
				lastPlanCompactionEntryCount = getSessionEntryCount(ctx);
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-complete", { reason, entryCount: lastPlanCompactionEntryCount });
				ctx.ui.notify("Planning compaction completed.", "info");
				refreshPlanCliContextIfAvailable(ctx);
				let resumeAfterLoad = false;
				if (pendingPlanningLoadAfterCompaction) {
					pendingPlanningLoadAfterCompaction = false;
					recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-after-compaction", { reason });
					requestPlanningLoadIfNeeded(ctx);
					resumeAfterLoad = flushPendingPlanningLoad(ctx);
				}
				if (!resumeAfterLoad) {
					flushPendingPlanningResume(ctx);
				}
				persistState();
			},
			onError: (error) => {
				planCompactionInFlight = false;
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-error", { reason, error: error.message });
				ctx.ui.notify(`Planning compaction failed: ${error.message}`, "warning");
				persistState();
			},
		});
	}

	function hasRecentProjectMemoryLoad(ctx: ExtensionContext, currentEntryCount: number): boolean {
		const entries = ctx.sessionManager.getEntries();
		for (let i = entries.length - 1; i >= 0; i -= 1) {
			const entry = entries[i] as { type?: string; customType?: string; data?: { entryCount?: number } };
			if (entry.type === "custom" && entry.customType === "project-memory-load") {
				const loadEntryCount = entry.data?.entryCount ?? i;
				return currentEntryCount - loadEntryCount < 25;
			}
		}
		return false;
	}

	function getProjectMemoryContextText(ctx: ExtensionContext): string {
		return ctx.sessionManager
			.getEntries()
			.slice(-60)
			.map((entry) => {
				const candidate = entry as { type?: string; customType?: string; message?: AgentMessage; data?: unknown };
				if (candidate.type === "message" && candidate.message) return getMessageText(candidate.message);
				if (candidate.type === "custom") return `${candidate.customType ?? "custom"}\n${JSON.stringify(candidate.data ?? {})}`;
				return "";
			})
			.filter(Boolean)
			.join("\n")
			.slice(-20_000);
	}

	function sendPlanModeFollowUp(content: string): void {
		pi.sendUserMessage(content, planModeFollowUpDeliveryOptions());
	}

	function requestPlanningLoadIfNeeded(ctx: ExtensionContext): void {
		if (!planModeEnabled || executionMode || planningLoadInFlight || planCompactionInFlight || pendingPlanningLoadPrompt) return;

		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanningLoadEntryCount !== undefined && entryCount - lastPlanningLoadEntryCount < 10) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-skipped", { reason: "debounced", entryCount });
			return;
		}
		if (hasRecentProjectMemoryLoad(ctx, entryCount)) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-skipped", { reason: "recent-project-memory-load", entryCount });
			return;
		}

		lastPlanningLoadEntryCount = entryCount;
		pendingPlanningLoadPrompt = buildLoadPrompt(ctx.cwd, "compact", collectSnapshot(ctx.cwd));
		pendingPlanningLoadReason = "plan-mode-context-shaping";
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-queued", { entryCount, reason: pendingPlanningLoadReason });
		pi.appendEntry("project-memory-load", { reason: pendingPlanningLoadReason, entryCount, queued: true });
		if (ctx.hasUI) {
			ctx.ui.notify("Project memory looks missing or stale; queued curated project memory load for planning.", "info");
		}
		persistState();
	}

	function flushPendingPlanningLoad(ctx: ExtensionContext): boolean {
		if (!pendingPlanningLoadPrompt || planningLoadInFlight || executionMode) return false;
		planningLoadInFlight = true;
		const prompt = pendingPlanningLoadPrompt;
		const reason = pendingPlanningLoadReason ?? "plan-mode-context-shaping";
		try {
			sendPlanModeFollowUp(prompt);
			pendingPlanningLoadPrompt = undefined;
			pendingPlanningLoadReason = undefined;
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-flushed", { reason, entryCount: getSessionEntryCount(ctx) });
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-flush-error", { reason, error: message });
			if (ctx.hasUI) ctx.ui.notify(`Planning project-memory load is still queued: ${message}`, "warning");
			return false;
		} finally {
			planningLoadInFlight = false;
			persistState();
		}
	}

	function flushPendingPlanningResume(ctx: ExtensionContext): boolean {
		if (!pendingPlanningResumePrompt || planningLoadInFlight || planCompactionInFlight || executionMode || !planModeEnabled) return false;
		const prompt = pendingPlanningResumePrompt;
		const reason = pendingPlanningResumeReason ?? "plan-mode-compaction-resume";
		pendingPlanningResumePrompt = undefined;
		pendingPlanningResumeReason = undefined;
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:resume-after-compaction", { reason, entryCount: getSessionEntryCount(ctx) });
		persistState();
		setTimeout(() => {
			try {
				sendPlanModeFollowUp(prompt);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:resume-after-compaction-error", { reason, error: message });
				pendingPlanningResumePrompt = prompt;
				pendingPlanningResumeReason = reason;
				if (ctx.hasUI) ctx.ui.notify(`Planning request resume is still queued: ${message}`, "warning");
				persistState();
			}
		}, 0);
		return true;
	}

	function shouldLoadForPlanning(ctx: ExtensionContext): boolean {
		if (!planModeEnabled || executionMode || planningLoadInFlight || pendingPlanningLoadPrompt) return false;
		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanningLoadEntryCount !== undefined && entryCount - lastPlanningLoadEntryCount < 10) return false;
		const hasRecentLoad = hasRecentProjectMemoryLoad(ctx, entryCount);
		const decision = shouldLoadProjectMemoryForPlanning({
			latestRequest: lastPlanningRequest,
			contextText: getProjectMemoryContextText(ctx),
			hasRecentProjectMemoryLoad: hasRecentLoad,
		});
		return decision.loadNeeded;
	}

	function refreshPlanCliContextIfAvailable(ctx: ExtensionContext): void {
		if (planningCliContextChecked || !planModeEnabled || executionMode) return;
		planningCliContextChecked = true;
		const validate = runDotdotgodCli(ctx.cwd, ["validate", ctx.cwd, "--include-local-memory", "--check-index", "--json"]);
		if (!validate.ok) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:cli-context-unavailable", { error: validate.error });
			persistState();
			return;
		}

		const snapshot = runDotdotgodCli(ctx.cwd, ["load-snapshot", ctx.cwd, "--json"]);
		let currentPlanContent: string | undefined;
		if (currentPlanPath) {
			try {
				currentPlanContent = readFileSync(resolve(ctx.cwd, currentPlanPath), "utf8");
			} catch {
				currentPlanContent = undefined;
			}
		}
		const impactPaths = selectPlanImpactPaths(ctx.cwd, lastPlanningRequest, currentPlanPath, currentPlanContent, touchedPlanArchivePaths, planPathExists);
		const impacts = impactPaths.map((path) => ({ path, result: runDotdotgodCli(ctx.cwd, ["graph", "impact", ctx.cwd, "--changed", path, "--json"]) }));
		const contextParts = [formatPlanCliContextSummary(validate, snapshot, impacts)];
		let referenceExpansionSummary = "";
		const hasExplicitReferences = hasExplicitBracketReferences(lastPlanningRequest);
		const hasFuzzyReferences = hasLikelyFuzzyReferences((lastPlanningRequest ?? "").replace(/\[\[[^\]\n]+\]\]/g, " "));
		const shouldExpandReferences = hasExplicitReferences || hasFuzzyReferences;
		if (shouldExpandReferences) {
			const expansionArgs = ["expand", ctx.cwd, lastPlanningRequest ?? "", "--json", "--with-impact"];
			if (hasFuzzyReferences) expansionArgs.push("--fuzzy");
			const expansion = runDotdotgodCli(ctx.cwd, expansionArgs);
			if (expansion.ok) {
				referenceExpansionSummary = formatReferenceExpansionSummary(expansion.data);
				if (referenceExpansionSummary) contextParts.push(referenceExpansionSummary);
			} else {
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:reference-expansion-unavailable", { error: expansion.error });
			}
		}
		planningCliContextSummary = contextParts.filter(Boolean).join("\n\n");
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:cli-context", { hasSummary: Boolean(planningCliContextSummary), impactPaths, referenceExpansion: Boolean(referenceExpansionSummary) });
		persistState();
	}

	function readPlanTodos(cwd: string, planPath: string): TodoItem[] {
		try {
			return extractTodoItems(readFileSync(resolve(cwd, planPath), "utf8"));
		} catch {
			return [];
		}
	}

	function readPlanMarkdown(cwd: string, planPath: string | undefined): string | undefined {
		if (!planPath) return undefined;
		try {
			return readFileSync(resolve(cwd, planPath), "utf8");
		} catch {
			return undefined;
		}
	}

	async function promptForDiscussionQueue(ctx: ExtensionContext, planPath: string | undefined): Promise<DiscussionQueueResult | undefined> {
		const markdown = readPlanMarkdown(ctx.cwd, planPath);
		if (!markdown) return undefined;
		const queue = summarizeDiscussionQueue(markdown);
		if (!queue.blocksExecutionReview) return undefined;
		try {
			const result = await ctx.ui.custom<DiscussionQueueResult>(
				(_tui, theme, _keybindings, done) => new DiscussionQueueComponent(planPath, queue.unresolved, queue.items.length, theme, done),
				{
					overlay: true,
					overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "center" },
				},
			);
			if (result.action === "custom_answer") {
				const answer = await ctx.ui.editor(`Answer ${result.itemId ?? "discussion item"}:`, "");
				return answer?.trim() ? { ...result, answer: answer.trim() } : { action: "cancel" };
			}
			if (result.action === "defer") {
				const rationale = await ctx.ui.editor(`Defer ${result.itemId ?? "discussion item"} rationale:`, "");
				const trimmed = rationale?.trim();
				return trimmed ? { ...result, rationale: trimmed } : result;
			}
			return result;
		} catch (error) {
			ctx.ui.notify(`Discussion Queue UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`, "warning");
			const item = queue.unresolved[0];
			if (!item) return undefined;
			const optionChoices = item.options.map((option) => `${option.label}. ${option.text}`);
			const choices = [...optionChoices, "Custom answer", "Defer", "Request research", "Revise plan", "Cancel"];
			const choice = await ctx.ui.select(`Discussion Queue ${item.id}: ${item.question}`, choices);
			if (!choice || choice === "Cancel") return { action: "cancel" };
			if (choice === "Custom answer") {
				const answer = await ctx.ui.editor(`Answer ${item.id}:`, "");
				return answer?.trim() ? { action: "custom_answer", itemId: item.id, answer: answer.trim() } : { action: "cancel" };
			}
			if (choice === "Defer") {
				const rationale = await ctx.ui.editor(`Defer ${item.id} rationale:`, "");
				const trimmed = rationale?.trim();
				return trimmed ? { action: "defer", itemId: item.id, rationale: trimmed } : { action: "defer", itemId: item.id };
			}
			if (choice === "Request research") return { action: "research", itemId: item.id };
			if (choice === "Revise plan") return { action: "revise", itemId: item.id };
			const option = item.options.find((candidate) => choice.startsWith(`${candidate.label}.`));
			return { action: "answer", itemId: item.id, ...(option?.label ? { optionLabel: option.label } : {}), optionText: option?.text ?? choice };
		}
	}

	function sendDiscussionQueueFollowUp(planPath: string | undefined, result: DiscussionQueueResult | undefined): boolean {
		const prompt = result ? buildDiscussionQueueFollowUp(planPath, result) : undefined;
		if (!prompt) return false;
		sendPlanModeFollowUp(prompt);
		return true;
	}

	function asPlanValidationResult(value: unknown): PlanValidationResult | undefined {
		return value && typeof value === "object" ? value as PlanValidationResult : undefined;
	}

	function runPlanValidation(ctx: ExtensionContext, planPath: string, stage?: string): { validation: PlanCliCommandResult; result: PlanValidationResult | undefined } {
		const args = ["plan", "validate", planPath, ...(stage ? ["--stage", stage] : []), "--json"];
		const validation = runDotdotgodCli(ctx.cwd, args);
		const result = asPlanValidationResult(validation.data);
		if (result && stage && !result.stage) result.stage = stage;
		return { validation, result };
	}

	async function chooseValidationBlockerAction(ctx: ExtensionContext, planPath: string | undefined, result: PlanValidationResult | undefined, fallbackDetails: string): Promise<ValidationBlockerAction> {
		if (!ctx.hasUI) return "refine";
		try {
			return await ctx.ui.custom<ValidationBlockerAction>(
				(_tui, theme, _keybindings, done) => new ValidationBlockerComponent(buildPlanValidationCustomMarkdown(planPath, result), theme, done),
				{
					overlay: true,
					overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "center" },
				},
			);
		} catch (error) {
			ctx.ui.notify(`Plan validation custom UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`, "warning");
			const choice = await ctx.ui.select(`Plan validation blocked execution.\n\n${fallbackDetails}\n\nChoose refine to tell the agent how to resolve these missing decisions or content.`, ["Refine the plan", "Cancel"]);
			return choice === "Refine the plan" ? "refine" : "cancel";
		}
	}

	async function promptForPlanValidationResult(ctx: ExtensionContext, planPath: string | undefined, validation: PlanCliCommandResult, result: PlanValidationResult | undefined, stage?: string): Promise<boolean> {
		if (validation.ok && result?.ok === true) return false;
		const blockerDetails = result ? buildPlanValidationBlockerDisplay(result) : `Plan validation did not return a usable result. ${validation.error ?? ""}`.trim();
		if (!ctx.hasUI) {
			sendPlanModeFollowUp(buildPlanValidationRefinePrompt({ planPath, result, stage }));
			return true;
		}
		const action = await chooseValidationBlockerAction(ctx, planPath, result, blockerDetails);
		if (action === "refine") {
			const feedback = await ctx.ui.editor("What should the agent decide or change to resolve these validation blockers?", blockerDetails);
			sendPlanModeFollowUp(buildPlanValidationRefinePrompt({ planPath, result, stage, userFeedback: feedback?.trim() }));
		}
		return true;
	}

	async function promptForPlanValidationBlockers(ctx: ExtensionContext, planPath: string | undefined): Promise<boolean> {
		if (!planPath) return false;
		const { validation, result } = runPlanValidation(ctx, planPath);
		return promptForPlanValidationResult(ctx, planPath, validation, result);
	}

	async function promptForStagePlanValidationBlockers(ctx: ExtensionContext, planPath: string | undefined): Promise<boolean> {
		if (!planPath) return false;
		for (const stage of PLAN_VALIDATION_STAGES) {
			const { validation, result } = runPlanValidation(ctx, planPath, stage);
			if (await promptForPlanValidationResult(ctx, planPath, validation, result, stage)) return true;
		}
		return false;
	}

	async function promptForPlanReviewChoice(ctx: ExtensionContext, planPath: string | undefined, todos: readonly TodoItem[]): Promise<PlanReviewChoice | undefined> {
		const review = buildPlanReviewMarkdown(planPath, todos, (path) => readFileSync(resolve(ctx.cwd, path), "utf8"));
		const markdown = buildPlanReviewDisplayMarkdown({ planPath, todoCount: todos.length, review });
		try {
			return await ctx.ui.custom<PlanReviewChoice | undefined>(
				(_tui, theme, _keybindings, done) => new PlanReviewComponent(markdown, todos.length, theme, done),
				{
					overlay: true,
					overlayOptions: { width: "100%", maxHeight: "100%", margin: 0, anchor: "center" },
				},
			);
		} catch (error) {
			ctx.ui.notify(`Plan review UI unavailable; using fallback selector. ${error instanceof Error ? error.message : String(error)}`, "warning");
			const fallbackChoices = [
				todos.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
				"Stay in plan mode",
				"Refine the plan",
				"Cancel",
			];
			const choice = await ctx.ui.select("Plan mode - choose next action after reviewing the saved plan file", fallbackChoices);
			return mapPlanReviewFallbackChoice(choice);
		}
	}

	function listActivePlanReadmePaths(ctx: ExtensionContext): string[] {
		try {
			return readdirSync(resolve(ctx.cwd, PLAN_DIRECTORY), { withFileTypes: true })
				.filter((entry) => entry.isDirectory() && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name))
				.map((entry) => `${PLAN_DIRECTORY}/${entry.name}/README.md`)
				.filter((path) => planPathExists(ctx.cwd, path));
		} catch {
			return [];
		}
	}

	async function chooseExplicitPlanPath(ctx: ExtensionContext, candidates: readonly string[]): Promise<string | undefined> {
		if (!ctx.hasUI || candidates.length === 0) return undefined;
		const choices = [...candidates, "Cancel"];
		const choice = await ctx.ui.select("Which active plan should be executed?", choices);
		return choice && choice !== "Cancel" ? choice : undefined;
	}

	function clearPendingPlanReviewState(): void {
		activePlanTouched = false;
		pendingPlanChoicePath = undefined;
	}

	function clearInlinePlanChoiceSuppression(): void {
		suppressPlanChoiceForInlineRequest = false;
	}

	function sendPlanStageAuthoringFollowUp(planPath: string | undefined, stage: PlanValidationStage, previousStage?: PlanValidationStage): void {
		sendPlanModeFollowUp(buildPlanStageAuthoringPrompt({ planPath, stage, previousStage, request: lastPlanningRequest }));
	}

	async function handleStageAuthoringAfterTurn(ctx: ExtensionContext, planPath: string | undefined): Promise<boolean> {
		if (!planModeEnabled || executionMode || !currentPlanAuthoringStage || !planPath) return false;
		const stage = currentPlanAuthoringStage;
		const { validation, result } = runPlanValidation(ctx, planPath, stage);
		if (await promptForPlanValidationResult(ctx, planPath, validation, result, stage)) {
			clearPendingPlanReviewState();
			persistState();
			return true;
		}
		const nextStage = getNextPlanValidationStage(stage);
		if (nextStage) {
			currentPlanAuthoringStage = nextStage;
			clearPendingPlanReviewState();
			persistState();
			sendPlanStageAuthoringFollowUp(planPath, nextStage, stage);
			return true;
		}
		currentPlanAuthoringStage = undefined;
		persistState();
		return false;
	}

	function enterExecutionMode(ctx: ExtensionContext, planPath: string, explicit: boolean): void {
		currentPlanPath = planPath;
		todoItems = readPlanTodos(ctx.cwd, planPath);
		planModeEnabled = false;
		executionMode = todoItems.length > 0;
		clearPendingPlanReviewState();
		planningContextShapePending = false;
		pendingPlanningLoadAfterCompaction = false;
		pendingPlanningLoadPrompt = undefined;
		pendingPlanningLoadReason = undefined;
		pendingPlanningResumePrompt = undefined;
		pendingPlanningResumeReason = undefined;
		activePlanModeTools = [];
		pi.setActiveTools(NORMAL_MODE_TOOLS);
		updateStatus(ctx);
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:execution-start", { todoCount: todoItems.length, planPath, explicit });
		persistState();
	}

	async function startExplicitPlanExecutionIfRequested(ctx: ExtensionContext): Promise<boolean> {
		const request = lastPlanningRequest ?? "";
		if (!planModeEnabled || executionMode || suppressPlanChoiceForInlineRequest || !detectPlanExecutionIntent(request)) return false;

		const resolution = resolvePlanExecutionTarget({
			request,
			currentPlanPath,
			pendingPlanChoicePath,
			touchedPaths: touchedPlanArchivePaths,
			activePlanPaths: listActivePlanReadmePaths(ctx),
			allowActivePlanFallback: true,
			pathExists: (path) => planPathExists(ctx.cwd, path),
		});
		let planPath = resolution.planPath;
		if (!planPath && resolution.status === "ambiguous") {
			planPath = await chooseExplicitPlanPath(ctx, resolution.candidates);
		}
		if (!planPath) {
			if (ctx.hasUI) ctx.ui.notify("Plan Mode: choose or mention the active plan to execute.", "warning");
			return false;
		}

		const todos = readPlanTodos(ctx.cwd, planPath);
		if (ctx.hasUI) {
			const queueResult = await promptForDiscussionQueue(ctx, planPath);
			if (queueResult) {
				clearPendingPlanReviewState();
				sendDiscussionQueueFollowUp(planPath, queueResult);
				persistState();
				return false;
			}
		}
		if (await promptForStagePlanValidationBlockers(ctx, planPath) || await promptForPlanValidationBlockers(ctx, planPath)) {
			clearPendingPlanReviewState();
			persistState();
			return false;
		}
		const choice = ctx.hasUI ? await promptForPlanReviewChoice(ctx, planPath, todos) : "execute";
		clearPendingPlanReviewState();
		if (choice !== "execute") {
			if (choice === "refine") {
				const refinement = await ctx.ui.editor("What should the agent change before execution?", "");
				if (refinement?.trim()) sendPlanModeFollowUp(buildPlanReviewRefinePrompt({ planPath, userFeedback: refinement.trim(), context: todos.length > 0 ? `Extracted execution steps: ${todos.map((todo) => `${todo.step}. ${todo.text}`).join("; ")}` : undefined }));
			}
			persistState();
			return false;
		}
		todoItems = [...todos];
		enterExecutionMode(ctx, planPath, true);
		return true;
	}

	function shapePlanningContextIfNeeded(ctx: ExtensionContext): void {
		if (!planModeEnabled || executionMode) return;
		const reason = getPlanCompactionReason(ctx.getContextUsage());
		const loadNeeded = shouldLoadForPlanning(ctx);
		if (reason) {
			pendingPlanningLoadAfterCompaction = loadNeeded;
			if (loadNeeded) {
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-deferred-until-after-compaction", { reason });
			}
			requestPlanningCompaction(ctx, reason);
			persistState();
			return;
		}
		refreshPlanCliContextIfAvailable(ctx);
		requestPlanningLoadIfNeeded(ctx);
	}

	function setPlanModeEnabled(ctx: ExtensionContext, enabled: boolean): void {
		if (enabled) {
			planModeEnabled = true;
			executionMode = false;
			todoItems = [];
			activePlanTouched = false;
			pendingPlanChoicePath = undefined;
			suppressPlanChoiceForInlineRequest = false;
			currentPlanAuthoringStage = undefined;
			currentPlanPath = undefined;
			planModeFullPromptInjected = false;
			planningCliContextSummary = undefined;
			planningCliContextChecked = false;
			planningContextShapePending = true;
			activePlanModeTools = getPlanModeTools();
			pi.setActiveTools(activePlanModeTools);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:enabled", { entryCount: getSessionEntryCount(ctx), tools: activePlanModeTools });
			ctx.ui.notify(`Plan mode enabled. Tools: ${activePlanModeTools.join(", ")}`);
		} else {
			planModeEnabled = false;
			executionMode = false;
			todoItems = [];
			activePlanTouched = false;
			pendingPlanChoicePath = undefined;
			suppressPlanChoiceForInlineRequest = false;
			currentPlanAuthoringStage = undefined;
			planningContextShapePending = false;
			pendingPlanningResumePrompt = undefined;
			pendingPlanningResumeReason = undefined;
			activePlanModeTools = [];
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
		persistState();
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		setPlanModeEnabled(ctx, !planModeEnabled);
	}

	function handleInlinePlanRequest(ctx: ExtensionContext, request: string): void {
		const normalizedRequest = truncateText(request);
		lastPlanningRequest = normalizedRequest;
		pendingInlinePlanningRequest = normalizedRequest;
		currentPlanAuthoringStage = PLAN_VALIDATION_STAGES[0];

		if (!planModeEnabled || executionMode) {
			setPlanModeEnabled(ctx, true);
		}

		clearPendingPlanReviewState();
		suppressPlanChoiceForInlineRequest = true;
		sendPlanModeFollowUp(request);
		if (!ctx.isIdle()) {
			ctx.ui.notify("Plan request queued for the next turn.", "info");
		}
		persistState();
	}

	function getPlanModeTools(): string[] {
		const availableTools = pi.getAllTools().map((tool) => tool.name);
		return resolvePlanModeTools(pi.getFlag("plan-extra-tools"), availableTools);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
			activePlanTouched,
			pendingPlanChoicePath,
			suppressPlanChoiceForInlineRequest,
			currentPlanAuthoringStage,
			lastPlanCompactionEntryCount,
			lastPlanCompactionReason,
			lastPlanningLoadEntryCount,
			pendingPlanningLoadAfterCompaction,
			pendingPlanningLoadPrompt,
			pendingPlanningLoadReason,
			pendingPlanningResumePrompt,
			pendingPlanningResumeReason,
			planningContextShapePending,
			planModeFullPromptInjected,
			planningCliContextSummary,
			planningCliContextChecked,
			lastPlanningRequest,
			pendingInlinePlanningRequest,
			currentPlanPath,
			touchedPlanArchivePaths,
			pendingImpactItems,
			impactCheckRecords,
		});
	}

	pi.registerCommand("impact-check", {
		description: "Run dotdotgod graph impact for pending and git-changed files",
		handler: async (_args, ctx) => {
			const paths = mergeImpactCheckPaths(ctx.cwd, pendingImpactItems, collectGitChangedPaths(ctx.cwd));
			if (paths.length === 0) {
				ctx.ui.notify("No source/config files need dotdotgod impact checks.", "info");
				return;
			}
			const result = runImpactChecks(ctx, paths, "command");
			ctx.ui.notify(result.summary, result.failed.length > 0 ? "warning" : "info");
		},
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode, or enable it and send a planning request with /plan <request>",
		handler: async (args, ctx) => {
			const request = normalizePlanCommandRequest(args);
			if (!request) {
				togglePlanMode(ctx);
				return;
			}
			handleInlinePlanRequest(ctx, request);
		},
	});

	pi.registerCommand("todos", {
		description: "Show current plan progress",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No active plan. Create one with /plan first.", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (pendingImpactItems.length > 0 && isCommitLikeCommand(command)) {
				return {
					block: true,
					reason: `Blocked: impact not checked for changed files.\nRun /impact-check or dotdotgod_graph_impact first.\nPending:\n${pendingImpactSummary(pendingImpactItems)}`,
				};
			}
			if (pendingImpactItems.length > 0 && isBroadVerificationCommand(command) && ctx.hasUI) {
				const approved = await ctx.ui.confirm(
					"Run broad verification before impact check?",
					`Pending dotdotgod graph impact checks:\n${pendingImpactSummary(pendingImpactItems)}\n\nContinue with this verification command anyway?`,
				);
				if (!approved) {
					return { block: true, reason: "Blocked: run /impact-check or dotdotgod_graph_impact before broad verification." };
				}
			}
		}

		if (!planModeEnabled) return;

		if (event.toolName === "bash") {
			const command = event.input.command as string;
			const decision = await shouldAllowPlanModeBashCommand(command, {
				hasUI: ctx.hasUI,
				confirm: (title, message) => ctx.ui.confirm(title, message),
			});
			if (!decision.allow) {
				return {
					block: true,
					reason: decision.reason ?? "Plan mode: command blocked.",
				};
			}
			return;
		}

		if (event.toolName === "write" || event.toolName === "edit") {
			const path = getToolPath(event.input);
			if (!path || !isManagedPlanMarkdownPath(ctx.cwd, path)) {
				return {
					block: true,
					reason: `Plan mode: ${event.toolName} is only allowed for markdown plan files under ${PLAN_DIRECTORY}/ or ${ARCHIVE_DIRECTORY}/. Directories must be kebab-case and markdown file names must be UPPER_SNAKE_CASE.md. Use execution mode for source changes.`,
				};
			}
			const normalizedPath = normalizeToolPath(path).replace(/\\/g, "/");
			if (!touchedPlanArchivePaths.includes(normalizedPath)) {
				touchedPlanArchivePaths = [...touchedPlanArchivePaths, normalizedPath].slice(-12);
			}
			if (isActivePlanMarkdownPath(ctx.cwd, path)) {
				activePlanTouched = true;
				currentPlanPath = getCurrentPlanReadmePath(path) ?? currentPlanPath;
				pendingPlanChoicePath = currentPlanPath;
				currentPlanAuthoringStage ??= getPlanStageFromPath(normalizedPath) ?? PLAN_VALIDATION_STAGES[0];
			}
		}
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.isError) return;
		if (event.toolName === "edit" || event.toolName === "write") {
			const path = getToolPath(event.input);
			if (path) trackPendingImpact(ctx, path, event.toolName);
			return;
		}
		if (event.toolName === "bash") {
			const command = typeof event.input.command === "string" ? event.input.command : "";
			const changed = getChangedPathFromDotdotgodImpactCommand(command);
			if (!changed) return;
			const output = getTextContent(event.content);
			if (output.includes('"ok": false')) return;
			clearPendingImpact(ctx, changed, "bash", undefined, formatCompactImpactSummary(changed, undefined));
		}
	});

	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "plan-mode-context") return false;
				if (msg.role !== "user") return true;

				const content = msg.content;
				if (typeof content === "string") {
					return !content.includes("[PLAN MODE ACTIVE]");
				}
				if (Array.isArray(content)) {
					return !content.some(
						(c) => c.type === "text" && (c as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
					);
				}
				return true;
			}),
		};
	});

	function updateLatestPlanningRequest(ctx: ExtensionContext): void {
		const latestUserEntry = [...ctx.sessionManager.getEntries()].reverse().find((entry) => {
			const candidate = entry as { type?: string; message?: AgentMessage };
			return candidate.type === "message" && candidate.message?.role === "user";
		}) as { message?: AgentMessage } | undefined;
		const latestText = latestUserEntry?.message ? truncateText(getMessageText(latestUserEntry.message)) : "";
		const selection = selectLatestPlanningRequest({ currentRequest: lastPlanningRequest, latestUserText: latestText, pendingInlineRequest: pendingInlinePlanningRequest });
		if (selection.changed) {
			lastPlanningRequest = selection.request;
			pendingInlinePlanningRequest = selection.pendingInlineRequest;
			persistState();
		}
	}

	pi.on("before_agent_start", async (_event, ctx) => {
		if (planModeEnabled && !executionMode) {
			updateLatestPlanningRequest(ctx);
			await startExplicitPlanExecutionIfRequested(ctx);
		}

		if (shouldShapePlanningContextOnAgentStart({ planModeEnabled, executionMode, planningContextShapePending })) {
			planningContextShapePending = false;
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:initial-context-shape", { entryCount: getSessionEntryCount(ctx) });
			shapePlanningContextIfNeeded(ctx);
			persistState();
		}

		const impactReminder = buildPendingImpactReminder();

		if (planModeEnabled) {
			if (activePlanModeTools.length === 0) activePlanModeTools = getPlanModeTools();
			const baseContent = buildPlanModeContextPrompt(planModeFullPromptInjected, activePlanModeTools);
			const requestFraming = buildPlanModeRequestFraming(lastPlanningRequest);
			const content = [baseContent, requestFraming, planningCliContextSummary, impactReminder].filter(Boolean).join("\n\n");
			planModeFullPromptInjected = true;
			persistState();
			return {
				message: {
					customType: "plan-mode-context",
					content,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Active plan: ${currentPlanPath ?? "unknown"}

Remaining plan steps:
${todoList}

Execute each step in order.
After completing any step, include its [DONE:n] tag in the same assistant response.
Final responses after implementation or verification MUST include [DONE:n] for every step completed in that turn.
Example: after completing step 1, include [DONE:1]. If steps 1 and 2 are both complete, include [DONE:1] [DONE:2].
After modification or coding work, run dotdotgod validate for the project before final completion. Prefer the local source CLI form when available: node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index.
When implementation and verification are complete, move the completed task directory from docs/plan/<task-slug>/ to docs/archive/plan/<task-slug>/ as the final housekeeping step and include the archive step's [DONE:n] tag.

If an out-of-scope change is required, stop and ask the user for confirmation.${impactReminder ? `\n\n${impactReminder}` : ""}`,
					display: false,
				},
			};
		}

		if (impactReminder) {
			return {
				message: {
					customType: "impact-check-context",
					content: impactReminder,
					display: false,
				},
			};
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (planModeEnabled && !executionMode) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:turn-end", { entryCount: getSessionEntryCount(ctx) });
		}

		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getMessageText(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	pi.on("agent_end", async (event, ctx) => {
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				executionMode = false;
				todoItems = [];
				pi.setActiveTools(NORMAL_MODE_TOOLS);
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled) return;
		if (suppressPlanChoiceForInlineRequest) {
			const inferredPlanPath = pendingPlanChoicePath ?? currentPlanPath ?? getCurrentPlanReadmePath(touchedPlanArchivePaths.find((path) => path.startsWith("docs/plan/")) ?? "");
			const handledStageAuthoring = await handleStageAuthoringAfterTurn(ctx, inferredPlanPath);
			clearInlinePlanChoiceSuppression();
			if (handledStageAuthoring) {
				persistState();
				return;
			}
			clearPendingPlanReviewState();
			persistState();
			if (flushPendingPlanningLoad(ctx)) return;
			if (flushPendingPlanningResume(ctx)) return;
			return;
		}

		const shouldShowChoice = shouldPromptForPlanChoice({ planModeEnabled, executionMode, hasUI: ctx.hasUI, pendingPlanChoicePath, activePlanTouched, suppressPlanChoice: suppressPlanChoiceForInlineRequest });
		if (!shouldShowChoice) {
			if (!pendingPlanChoicePath && !activePlanTouched && flushPendingPlanningLoad(ctx)) return;
			if (!pendingPlanChoicePath && !activePlanTouched && flushPendingPlanningResume(ctx)) return;
			return;
		}
		activePlanTouched = false;

		const inferredPlanPath = pendingPlanChoicePath ?? currentPlanPath ?? getCurrentPlanReadmePath(touchedPlanArchivePaths.find((path) => path.startsWith("docs/plan/")) ?? "");
		if (await handleStageAuthoringAfterTurn(ctx, inferredPlanPath)) return;
		const savedTodos = inferredPlanPath ? readPlanTodos(ctx.cwd, inferredPlanPath) : [];
		if (savedTodos.length > 0) {
			todoItems = savedTodos;
		} else {
			const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
			if (lastAssistant) {
				const extracted = extractTodoItems(getMessageText(lastAssistant));
				if (extracted.length > 0) {
					todoItems = extracted;
				}
			}
		}

		const queueResult = await promptForDiscussionQueue(ctx, inferredPlanPath);
		if (queueResult) {
			clearPendingPlanReviewState();
			sendDiscussionQueueFollowUp(inferredPlanPath, queueResult);
			persistState();
			return;
		}

		if (await promptForStagePlanValidationBlockers(ctx, inferredPlanPath) || await promptForPlanValidationBlockers(ctx, inferredPlanPath)) {
			clearPendingPlanReviewState();
			persistState();
			return;
		}

		const choice = await promptForPlanReviewChoice(ctx, inferredPlanPath, todoItems);
		clearPendingPlanReviewState();

		const executionDecision = buildPlanExecutionDecision(choice, todoItems, inferredPlanPath);
		if (executionDecision.shouldExecute && executionDecision.handoff) {
			planModeEnabled = false;
			planningContextShapePending = false;
			pendingPlanningResumePrompt = undefined;
			pendingPlanningResumeReason = undefined;
			executionMode = todoItems.length > 0;
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:execution-start", { todoCount: todoItems.length, planPath: inferredPlanPath });
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			updateStatus(ctx);

			const handoff = executionDecision.handoff;
			pi.appendEntry("plan-mode-execute", handoff.marker);
			persistState();
			setTimeout(() => {
				sendPlanModeFollowUp(handoff.message);
			}, 0);
		} else if (choice === "refine") {
			const refinement = await ctx.ui.editor("What should the agent change before execution?", "");
			if (refinement?.trim()) {
				sendPlanModeFollowUp(buildPlanReviewRefinePrompt({ planPath: inferredPlanPath, userFeedback: refinement.trim(), context: todoItems.length > 0 ? `Extracted execution steps: ${todoItems.map((todo) => `${todo.step}. ${todo.text}`).join("; ")}` : undefined }));
			}
			persistState();
		} else {
			persistState();
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
			planningContextShapePending = true;
		}

		const entries = ctx.sessionManager.getEntries();

		const planModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as
			| {
					data?: {
						enabled: boolean;
						todos?: TodoItem[];
						executing?: boolean;
						activePlanTouched?: boolean;
						pendingPlanChoicePath?: string;
						suppressPlanChoiceForInlineRequest?: boolean;
						currentPlanAuthoringStage?: string;
						lastPlanCompactionEntryCount?: number;
						lastPlanCompactionReason?: string;
						lastPlanningLoadEntryCount?: number;
						pendingPlanningLoadAfterCompaction?: boolean;
						pendingPlanningLoadPrompt?: string;
						pendingPlanningLoadReason?: string;
						pendingPlanningResumePrompt?: string;
						pendingPlanningResumeReason?: string;
						planningContextShapePending?: boolean;
						planModeFullPromptInjected?: boolean;
						planningCliContextSummary?: string;
						planningCliContextChecked?: boolean;
						lastPlanningRequest?: string;
						pendingInlinePlanningRequest?: string;
						currentPlanPath?: string;
						touchedPlanArchivePaths?: string[];
						pendingImpactItems?: PendingImpactItem[];
						impactCheckRecords?: ImpactCheckRecord[];
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			activePlanTouched = planModeEntry.data.activePlanTouched ?? activePlanTouched;
			pendingPlanChoicePath = planModeEntry.data.pendingPlanChoicePath ?? pendingPlanChoicePath;
			suppressPlanChoiceForInlineRequest = planModeEntry.data.suppressPlanChoiceForInlineRequest ?? suppressPlanChoiceForInlineRequest;
			currentPlanAuthoringStage = isPlanValidationStage(planModeEntry.data.currentPlanAuthoringStage) ? planModeEntry.data.currentPlanAuthoringStage : currentPlanAuthoringStage;
			lastPlanCompactionEntryCount = planModeEntry.data.lastPlanCompactionEntryCount ?? lastPlanCompactionEntryCount;
			lastPlanCompactionReason = planModeEntry.data.lastPlanCompactionReason ?? lastPlanCompactionReason;
			lastPlanningLoadEntryCount = planModeEntry.data.lastPlanningLoadEntryCount ?? lastPlanningLoadEntryCount;
			pendingPlanningLoadAfterCompaction = planModeEntry.data.pendingPlanningLoadAfterCompaction ?? pendingPlanningLoadAfterCompaction;
			pendingPlanningLoadPrompt = planModeEntry.data.pendingPlanningLoadPrompt ?? pendingPlanningLoadPrompt;
			pendingPlanningLoadReason = planModeEntry.data.pendingPlanningLoadReason ?? pendingPlanningLoadReason;
			pendingPlanningResumePrompt = planModeEntry.data.pendingPlanningResumePrompt ?? pendingPlanningResumePrompt;
			pendingPlanningResumeReason = planModeEntry.data.pendingPlanningResumeReason ?? pendingPlanningResumeReason;
			planningContextShapePending = planModeEntry.data.planningContextShapePending ?? planningContextShapePending;
			planModeFullPromptInjected = planModeEntry.data.planModeFullPromptInjected ?? planModeFullPromptInjected;
			planningCliContextSummary = planModeEntry.data.planningCliContextSummary ?? planningCliContextSummary;
			planningCliContextChecked = planModeEntry.data.planningCliContextChecked ?? planningCliContextChecked;
			lastPlanningRequest = planModeEntry.data.lastPlanningRequest ?? lastPlanningRequest;
			pendingInlinePlanningRequest = planModeEntry.data.pendingInlinePlanningRequest ?? pendingInlinePlanningRequest;
			currentPlanPath = planModeEntry.data.currentPlanPath ?? currentPlanPath;
			touchedPlanArchivePaths = planModeEntry.data.touchedPlanArchivePaths ?? touchedPlanArchivePaths;
			pendingImpactItems = planModeEntry.data.pendingImpactItems ?? pendingImpactItems;
			impactCheckRecords = planModeEntry.data.impactCheckRecords ?? impactCheckRecords;
		}

		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "plan-mode-execute") {
					executeIndex = i;
					break;
				}
			}

			const messages: AssistantMessage[] = [];
			for (let i = executeIndex + 1; i < entries.length; i++) {
				const entry = entries[i];
				if (entry && entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
					messages.push(entry.message as AssistantMessage);
				}
			}
			const allText = messages.map(getMessageText).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			activePlanModeTools = getPlanModeTools();
			pi.setActiveTools(activePlanModeTools);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:session-start-enabled", { entryCount: getSessionEntryCount(ctx), tools: activePlanModeTools });
		}
		updateStatus(ctx);
		updateImpactStatus(ctx);
	});
}
