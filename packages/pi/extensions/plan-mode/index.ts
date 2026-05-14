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
import {
	buildPlanCompactionInstructions,
	extractTodoItems,
	getPlanCompactionReason,
	isSafeCommand,
	markCompletedSteps,
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

	function requestPlanningCompaction(ctx: ExtensionContext, reason: string): void {
		if (planCompactionInFlight) return;

		const entryCount = getSessionEntryCount(ctx);
		if (lastPlanCompactionEntryCount !== undefined && entryCount - lastPlanCompactionEntryCount < 10) {
			return;
		}

		planCompactionInFlight = true;
		lastPlanCompactionReason = reason;
		recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-request", { reason, entryCount });
		ctx.ui.notify("Planning context is large; compacting before continuing.", "info");
		ctx.compact({
			customInstructions: buildPlanCompactionInstructions(reason),
			onComplete: () => {
				planCompactionInFlight = false;
				lastPlanCompactionEntryCount = getSessionEntryCount(ctx);
				recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:compaction-complete", { reason, entryCount: lastPlanCompactionEntryCount });
				ctx.ui.notify("Planning compaction completed.", "info");
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

	function requestPlanningCompactionIfNeeded(ctx: ExtensionContext): void {
		if (!planModeEnabled || executionMode) return;
		const reason = getPlanCompactionReason(ctx.getContextUsage());
		if (reason) {
			requestPlanningCompaction(ctx, reason);
		}
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];
		activePlanTouched = false;

		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			recordContextMetric(ctx, (name) => pi.getFlag(name), "plan-mode:enabled", { entryCount: getSessionEntryCount(ctx) });
			ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
			requestPlanningCompactionIfNeeded(ctx);
		} else {
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

	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in Plan Mode. This is a read-only exploration and design phase before code changes.

Restrictions:
- Allowed tools: read, bash, edit, write, grep, find, ls, questionnaire, web_search, code_search, fetch_content, get_search_content
- edit/write are allowed only for markdown plan/archive files under docs/plan/ or docs/archive/.
- Under docs/, directories must use kebab-case and markdown file names must use UPPER_SNAKE_CASE.md, including README.md.
- Forbidden: source/code/config file mutation outside docs/plan/ and docs/archive/.
- Bash is restricted to read-only allowlisted commands.

Project context:
- Read AGENTS.md and docs/README.md first when available.
- Treat project docs as the source of truth for stack, commands, conventions, and architecture.
- Check docs/arch when code conventions, module boundaries, infrastructure/runtime dependencies, or integration constraints may affect the plan.

Workflow:
- Explore relevant files thoroughly before planning; ask clarifying questions with questionnaire when requirements are ambiguous.
- If planning compaction has just occurred, rely on the preserved planning summary plus current project docs before writing or refining the plan.
- Use web_search, code_search, and fetch_content when library or web evidence is needed.
- Manage active work under docs/plan/<task-slug>/README.md, with optional UPPER_SNAKE_CASE support files in the same task directory.
- When one docs domain grows into multiple files, group it under docs/<area>/<domain>/README.md plus supporting UPPER_SNAKE_CASE files.
- Include scope, status, target files, risks, verification, and a final archive step to docs/archive/plan/<task-slug>/.
- Do not change product/source files in plan mode. Only maintain docs/plan or docs/archive markdown files and produce an executable plan.

Always write the task README with scope, target files, implementation steps, verification, risks when useful, and archive housekeeping.

In the final response, use a Plan: section only for concrete executable steps. Avoid generic template labels such as "Target files and rationale", "Implementation steps", or "Verification method" as numbered plan items.

Do NOT attempt to make changes - just describe what you would do.`,
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
			requestPlanningCompactionIfNeeded(ctx);
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
		requestPlanningCompactionIfNeeded(ctx);
	});
}
