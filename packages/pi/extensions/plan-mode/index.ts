/**
 * Customized Plan Mode Extension
 *
 * Safe exploration mode for code analysis and docs/plan plan-file management.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme, keyHint } from "@earendil-works/pi-coding-agent";
import { Key, Markdown, Text, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
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
	buildPlanExecutionDecision,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanModeContextPrompt,
	buildPlanModeRequestFraming,
	detectPlanExecutionIntent,
	extractTodoItems,
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
	getPlanCompactionReason,
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
	type PlanCompactionFocus,
	type PlanReviewChoice,
	type TodoItem,
} from "./utils.js";

const DotdotgodGraphImpactParams = Type.Object({
	changed: Type.Optional(Type.String({ description: "Changed file path to check with dotdotgod graph impact" })),
	paths: Type.Optional(Type.Array(Type.String(), { description: "Changed file paths to check with dotdotgod graph impact" })),
});

const PLAN_REVIEW_VISIBLE_LINES = 48;

class PlanReviewComponent {
	private offset = 0;
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
		else if (data === "e" || data === "E") this.done("execute");
		else if (data === "s" || data === "S") this.done("stay");
		else if (data === "r" || data === "R") this.done("refine");
		else if (data === "c" || data === "C" || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.done("cancel");
		this.invalidate();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(20, width);
		const bodyLines = this.getMarkdownLines(safeWidth);
		const scroll = getPlanReviewScrollState(this.offset, bodyLines.length, PLAN_REVIEW_VISIBLE_LINES);
		this.offset = scroll.offset;
		const th = this.theme;
		const title = ` Plan Mode Review (${this.todoCount === 1 ? "1 step" : `${this.todoCount} steps`}) `;
		const controls = "↑/↓ PgUp/PgDn Home/End scroll · e execute · s stay · r refine · c/Esc cancel";
		const status = `${scroll.offset + Math.min(bodyLines.length, 1)}-${Math.min(bodyLines.length, scroll.offset + PLAN_REVIEW_VISIBLE_LINES)} / ${bodyLines.length}`;
		const lines = [
			truncateToWidth(th.fg("borderAccent", "─".repeat(2)) + th.fg("accent", title) + th.fg("borderAccent", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
			truncateToWidth(th.fg("dim", `Scroll: ${status}${scroll.canScrollDown ? " · more below" : ""}`), safeWidth),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			...bodyLines.slice(scroll.offset, scroll.offset + PLAN_REVIEW_VISIBLE_LINES),
			truncateToWidth(th.fg("borderMuted", "─".repeat(safeWidth)), safeWidth),
			truncateToWidth(th.fg("dim", controls), safeWidth),
		];
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	invalidate(): void {
		delete this.cachedWidth;
		delete this.cachedMarkdownLines;
	}

	private getMarkdownLines(width: number): string[] {
		if (this.cachedMarkdownLines && this.cachedWidth === width) return this.cachedMarkdownLines;
		this.cachedWidth = width;
		this.cachedMarkdownLines = new Markdown(this.markdown, 0, 0, getMarkdownTheme()).render(width).map((line) => truncateToWidth(line, width));
		return this.cachedMarkdownLines;
	}

	private getWheelDelta(data: string): number {
		if (/\x1b\[<64;\d+;\d+[mM]/.test(data) || /\x1b\[M[`]/.test(data)) return -3;
		if (/\x1b\[<65;\d+;\d+[mM]/.test(data) || /\x1b\[M[a]/.test(data)) return 3;
		return 0;
	}
}

export default function planModeExtension(pi: ExtensionAPI): void {

	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let activePlanTouched = false;
	let pendingPlanChoicePath: string | undefined;
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
			pi.sendUserMessage(prompt, { deliverAs: "followUp" });
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
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
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

	function enterExecutionMode(ctx: ExtensionContext, planPath: string, explicit: boolean): void {
		currentPlanPath = planPath;
		todoItems = readPlanTodos(ctx.cwd, planPath);
		planModeEnabled = false;
		executionMode = todoItems.length > 0;
		activePlanTouched = false;
		pendingPlanChoicePath = undefined;
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
		if (!planModeEnabled || executionMode || !detectPlanExecutionIntent(request)) return false;

		const resolution = resolvePlanExecutionTarget({
			request,
			currentPlanPath,
			pendingPlanChoicePath,
			touchedPaths: touchedPlanArchivePaths,
			activePlanPaths: listActivePlanReadmePaths(ctx),
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
		const choice = ctx.hasUI ? await promptForPlanReviewChoice(ctx, planPath, todos) : "execute";
		if (choice !== "execute") {
			if (choice === "refine") {
				const refinement = await ctx.ui.editor("Refine the plan:", "");
				if (refinement?.trim()) pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
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

		if (!planModeEnabled || executionMode) {
			setPlanModeEnabled(ctx, true);
		}

		if (ctx.isIdle()) {
			pi.sendUserMessage(request);
		} else {
			pi.sendUserMessage(request, { deliverAs: "followUp" });
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
		const shouldShowChoice = shouldPromptForPlanChoice({ planModeEnabled, executionMode, hasUI: ctx.hasUI, pendingPlanChoicePath, activePlanTouched });
		if (!shouldShowChoice) {
			if (!pendingPlanChoicePath && !activePlanTouched && flushPendingPlanningLoad(ctx)) return;
			if (!pendingPlanChoicePath && !activePlanTouched && flushPendingPlanningResume(ctx)) return;
			return;
		}
		activePlanTouched = false;

		const inferredPlanPath = pendingPlanChoicePath ?? currentPlanPath ?? getCurrentPlanReadmePath(touchedPlanArchivePaths.find((path) => path.startsWith("docs/plan/")) ?? "");
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

		const choice = await promptForPlanReviewChoice(ctx, inferredPlanPath, todoItems);
		pendingPlanChoicePath = undefined;

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
				pi.sendUserMessage(handoff.message);
			}, 0);
		} else if (choice === "refine") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
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
