/**
 * Customized Plan Mode Extension
 *
 * Safe exploration mode for code analysis and docs/plan plan-file management.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { isAbsolute, relative, resolve } from "node:path";
import { recordContextMetric } from "../context-metrics/utils.js";
import { buildLoadPrompt, collectSnapshot } from "../load-project/utils.js";
import {
	buildPlanCompactionInstructions,
	buildPlanModeContextPrompt,
	extractTodoItems,
	getPlanCompactionReason,
	isSafeCommand,
	shouldShapePlanningContextOnAgentStart,
	markCompletedSteps,
	type PlanCompactionFocus,
	type TodoItem,
} from "./utils.js";

const PLAN_DIRECTORY = "docs/plan";
const ARCHIVE_DIRECTORY = "docs/archive";

const PLAN_MODE_TOOLS = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"questionnaire",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
];

const NORMAL_MODE_TOOLS = [
	"read",
	"bash",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
	"subagent",
	"ctx_batch_execute",
	"ctx_execute",
	"ctx_execute_file",
	"ctx_search",
	"ctx_index",
	"ctx_fetch_and_index",
];

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function getMessageText(message: AgentMessage): string {
	if (!("content" in message)) return "";
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function truncateText(text: string, limit = 500): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function normalizeToolPath(path: string): string {
	return path.replace(/^@/, "");
}

function isKebabCaseDirectory(name: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isUpperSnakeMarkdownFile(name: string): boolean {
	return /^[A-Z0-9]+(?:_[A-Z0-9]+)*\.md$/.test(name);
}

function isMarkdownPathInside(cwd: string, path: string, directory: string): boolean {
	const targetPath = resolve(cwd, normalizeToolPath(path));
	const basePath = resolve(cwd, directory);
	const relativePath = relative(basePath, targetPath);
	const isInsideDirectory = relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
	if (!isInsideDirectory) return false;

	const segments = relativePath.split(/[\\/]+/);
	const fileName = segments[segments.length - 1];
	if (!fileName || !isUpperSnakeMarkdownFile(fileName)) return false;

	return segments.slice(0, -1).every(isKebabCaseDirectory);
}

function isManagedPlanMarkdownPath(cwd: string, path: string): boolean {
	return isMarkdownPathInside(cwd, path, PLAN_DIRECTORY) || isMarkdownPathInside(cwd, path, ARCHIVE_DIRECTORY);
}

function isActivePlanMarkdownPath(cwd: string, path: string): boolean {
	return isMarkdownPathInside(cwd, path, PLAN_DIRECTORY);
}

function getToolPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const path = (input as { path?: unknown }).path;
	return typeof path === "string" ? path : undefined;
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let activePlanTouched = false;
	let planCompactionInFlight = false;
	let lastPlanCompactionEntryCount: number | undefined;
	let lastPlanCompactionReason: string | undefined;
	let planningLoadInFlight = false;
	let lastPlanningLoadEntryCount: number | undefined;
	let pendingPlanningLoadAfterCompaction = false;
	let planningContextShapePending = false;
	let planModeFullPromptInjected = false;
	let lastPlanningRequest: string | undefined;
	let touchedPlanArchivePaths: string[] = [];

	pi.registerFlag("plan", {
		description: "Start in plan mode (safe exploration plus docs/plan updates)",
		type: "boolean",
		default: false,
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

	function buildCurrentWorkFocus(): PlanCompactionFocus {
		const completed = todoItems.filter((item) => item.completed).length;
		const focus: PlanCompactionFocus = {
			activePlanPaths: touchedPlanArchivePaths.filter((path) => path.startsWith("docs/plan/")),
			touchedMemoryPaths: touchedPlanArchivePaths,
			pendingLoadAfterCompaction: pendingPlanningLoadAfterCompaction,
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
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-request", { reason, entryCount, focus });
		ctx.ui.notify("Planning context is large; compacting before continuing.", "info");
		ctx.compact({
			customInstructions: buildPlanCompactionInstructions(reason, focus),
			onComplete: () => {
				planCompactionInFlight = false;
				lastPlanCompactionEntryCount = getSessionEntryCount(ctx);
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-complete", { reason, entryCount: lastPlanCompactionEntryCount });
				ctx.ui.notify("Planning compaction completed.", "info");
				if (pendingPlanningLoadAfterCompaction) {
					pendingPlanningLoadAfterCompaction = false;
					recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-after-compaction", { reason });
					requestPlanningLoadIfNeeded(ctx);
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

	function requestPlanningLoadIfNeeded(ctx: ExtensionContext): void {
		if (!planModeEnabled || executionMode || planningLoadInFlight || planCompactionInFlight) return;

		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanningLoadEntryCount !== undefined && entryCount - lastPlanningLoadEntryCount < 10) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-skipped", { reason: "debounced", entryCount });
			return;
		}
		if (hasRecentProjectMemoryLoad(ctx, entryCount)) {
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-skipped", { reason: "recent-project-memory-load", entryCount });
			return;
		}

		planningLoadInFlight = true;
		lastPlanningLoadEntryCount = entryCount;
		const prompt = buildLoadPrompt(ctx.cwd, "", collectSnapshot(ctx.cwd));
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:load-requested", { entryCount });
		pi.appendEntry("project-memory-load", { reason: "plan-mode-context-shaping", entryCount });
		pi.sendUserMessage(prompt, { deliverAs: "followUp" });
		if (ctx.hasUI) {
			ctx.ui.notify("Project memory looks missing or stale; loading curated project memory for planning.", "info");
		}
		planningLoadInFlight = false;
		persistState();
	}

	function shouldLoadForPlanning(ctx: ExtensionContext): boolean {
		if (!planModeEnabled || executionMode || planningLoadInFlight) return false;
		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanningLoadEntryCount !== undefined && entryCount - lastPlanningLoadEntryCount < 10) return false;
		return !hasRecentProjectMemoryLoad(ctx, entryCount);
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
		requestPlanningLoadIfNeeded(ctx);
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];
		activePlanTouched = false;
		planModeFullPromptInjected = false;

		if (planModeEnabled) {
			planningContextShapePending = true;
			pi.setActiveTools(PLAN_MODE_TOOLS);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:enabled", { entryCount: getSessionEntryCount(ctx) });
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
		} else {
			planningContextShapePending = false;
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
			activePlanTouched,
			lastPlanCompactionEntryCount,
			lastPlanCompactionReason,
			lastPlanningLoadEntryCount,
			pendingPlanningLoadAfterCompaction,
			planningContextShapePending,
			planModeFullPromptInjected,
			lastPlanningRequest,
			touchedPlanArchivePaths,
		});
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode (safe exploration plus docs/plan updates)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
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
		if (!planModeEnabled) return;

		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Plan mode: command is not allowlisted. Mutating, install, or deletion commands are only allowed during execution mode.\nCommand: ${command}`,
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
			}
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
		if (latestText && !latestText.includes("[PLAN MODE ACTIVE]") && !latestText.startsWith("Load the dotdotgod project memory.")) {
			lastPlanningRequest = latestText;
		}
	}

	pi.on("before_agent_start", async (_event, ctx) => {
		if (planModeEnabled && !executionMode) {
			updateLatestPlanningRequest(ctx);
		}

		if (shouldShapePlanningContextOnAgentStart({ planModeEnabled, executionMode, planningContextShapePending })) {
			planningContextShapePending = false;
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:initial-context-shape", { entryCount: getSessionEntryCount(ctx) });
			shapePlanningContextIfNeeded(ctx);
			persistState();
		}

		if (planModeEnabled) {
			const content = buildPlanModeContextPrompt(planModeFullPromptInjected);
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

Remaining plan steps:
${todoList}

Execute each step in order.
After completing any step, include its [DONE:n] tag in the same assistant response.
Final responses after implementation or verification MUST include [DONE:n] for every step completed in that turn.
Example: after completing step 1, include [DONE:1]. If steps 1 and 2 are both complete, include [DONE:1] [DONE:2].
When implementation and verification are complete, move the completed task directory from docs/plan/<task-slug>/ to docs/archive/plan/<task-slug>/ as the final housekeeping step and include the archive step's [DONE:n] tag.

If an out-of-scope change is required, stop and ask the user for confirmation.`,
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

		const text = getTextContent(event.message);
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

		if (!planModeEnabled || !ctx.hasUI) return;
		if (!activePlanTouched) return;
		activePlanTouched = false;

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
			}
		}

		const actionChoices = [
			todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		];
		const choice = await ctx.ui.select("Plan mode - choose next action", actionChoices);

		if (choice?.startsWith("Execute the plan")) {
			planModeEnabled = false;
			planningContextShapePending = false;
			executionMode = todoItems.length > 0;
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:execution-start", { todoCount: todoItems.length });
			pi.setActiveTools(NORMAL_MODE_TOOLS);
			updateStatus(ctx);

			const firstTodo = todoItems[0];
			const execMessage = firstTodo
				? `Execute the plan. Start with: ${firstTodo.text}`
				: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
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
						lastPlanCompactionEntryCount?: number;
						lastPlanCompactionReason?: string;
						lastPlanningLoadEntryCount?: number;
						pendingPlanningLoadAfterCompaction?: boolean;
						planningContextShapePending?: boolean;
						planModeFullPromptInjected?: boolean;
						lastPlanningRequest?: string;
						touchedPlanArchivePaths?: string[];
					};
			  }
			| undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
			activePlanTouched = planModeEntry.data.activePlanTouched ?? activePlanTouched;
			lastPlanCompactionEntryCount = planModeEntry.data.lastPlanCompactionEntryCount ?? lastPlanCompactionEntryCount;
			lastPlanCompactionReason = planModeEntry.data.lastPlanCompactionReason ?? lastPlanCompactionReason;
			lastPlanningLoadEntryCount = planModeEntry.data.lastPlanningLoadEntryCount ?? lastPlanningLoadEntryCount;
			pendingPlanningLoadAfterCompaction = planModeEntry.data.pendingPlanningLoadAfterCompaction ?? pendingPlanningLoadAfterCompaction;
			planningContextShapePending = planModeEntry.data.planningContextShapePending ?? planningContextShapePending;
			planModeFullPromptInjected = planModeEntry.data.planModeFullPromptInjected ?? planModeFullPromptInjected;
			lastPlanningRequest = planModeEntry.data.lastPlanningRequest ?? lastPlanningRequest;
			touchedPlanArchivePaths = planModeEntry.data.touchedPlanArchivePaths ?? touchedPlanArchivePaths;
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
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:session-start-enabled", { entryCount: getSessionEntryCount(ctx) });
		}
		updateStatus(ctx);
	});
}
