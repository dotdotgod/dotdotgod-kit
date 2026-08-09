import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { recordContextMetric } from "../context-metrics/utils.js";
import { buildLoadPrompt, collectSnapshot, runDotdotgodQuery } from "../load-project/utils.js";
import { composeActiveTools } from "../shared/active-tools.js";
import {
	buildPendingProjectMemoryLoadPrompt,
	formatProjectMemoryToolOutput,
	getProjectMemoryContextText,
	hasReachableProjectMemoryInstruction,
	hasRecentProjectMemoryLoad,
	isExplicitProjectMemoryLoadInput,
	PROJECT_MEMORY_CONTEXT_TYPE,
	PROJECT_MEMORY_LOAD_TOOL,
	shouldLoadProjectMemory,
	stripExplicitProjectMemoryLoadMarker,
} from "./context.js";
import { ProjectMemoryLifecycle } from "./lifecycle.js";

const ProjectMemoryLoadParams = Type.Object({
	focus: Type.String({
		maxLength: 500,
		description:
			"A concise semantic retrieval query generated from the current task. Use an empty string only when broad baseline loading is more appropriate.",
	}),
});

export default function projectMemoryExtension(pi: ExtensionAPI): void {
	const lifecycle = new ProjectMemoryLifecycle();
	const state = lifecycle.state;

	function setToolActive(active: boolean): void {
		pi.setActiveTools(
			composeActiveTools(
				pi.getActiveTools(),
				[PROJECT_MEMORY_LOAD_TOOL],
				active ? [PROJECT_MEMORY_LOAD_TOOL] : [],
			),
		);
	}

	function persistState(): void {
		pi.appendEntry("project-memory-auto-state", {
			version: 2,
			assessed: state.assessed,
			pending: state.pending,
			promptDelivered: state.promptDelivered,
		});
	}

	pi.registerTool({
		name: PROJECT_MEMORY_LOAD_TOOL,
		label: "dotdotgod project load",
		description:
			"Load curated project memory for a pending automatic context request using an agent-generated semantic focus.",
		promptSnippet:
			"Load curated project memory with a concise task-specific semantic focus when automatic project-memory loading is pending.",
		promptGuidelines: [
			"When automatic project-memory loading is pending, call dotdotgod_project_load before substantive work. Generate a short semantic focus from the behavior, architecture, source areas, and verification knowledge needed for the current task; do not copy the full user request verbatim.",
		],
		parameters: ProjectMemoryLoadParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			lifecycle.beginLoad();

			const focus = params.focus.replace(/\s+/g, " ").trim();
			try {
				const snapshot = collectSnapshot(ctx.cwd);
				const queryResult = focus ? runDotdotgodQuery(ctx.cwd, focus) : undefined;
				const prompt = buildLoadPrompt(ctx.cwd, focus, snapshot, queryResult, { mode: "compact" });
				lifecycle.completeLoad();
				const entryCount = ctx.sessionManager.getBranch().length;
				pi.appendEntry("project-memory-load", {
					reason: "global-context-shaping",
					entryCount,
					focus,
					queryOk: queryResult?.ok,
				});
				recordContextMetric(ctx, (name) => pi.getFlag(name), "project-memory:auto-load-complete", {
					entryCount,
					focus,
					queryOk: queryResult?.ok,
				});
				persistState();
				setToolActive(false);
				return {
					content: [{ type: "text", text: prompt }],
					details: {
						ok: queryResult?.ok ?? true,
						focus,
						output: prompt,
						query: queryResult
							? { ok: queryResult.ok, command: queryResult.command, error: queryResult.error }
							: undefined,
					},
				};
			} finally {
				lifecycle.finishLoad();
			}
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Loading dotdotgod project memory..."), 0, 0);
			}
			const details =
				result.details && typeof result.details === "object"
					? (result.details as { output?: unknown; error?: unknown })
					: undefined;
			const output =
				typeof details?.output === "string"
					? details.output
					: typeof details?.error === "string"
						? `Error: ${details.error}`
						: "dotdotgod project memory loaded.";
			const text = formatProjectMemoryToolOutput(
				output,
				expanded,
				keyHint("app.tools.expand", expanded ? "to collapse" : "to expand"),
			);
			return new Text(text, 0, 0);
		},
	});

	function restoreBranchState(ctx: ExtensionContext): void {
		const branch = ctx.sessionManager.getBranch();
		lifecycle.restore(
			branch,
			hasReachableProjectMemoryInstruction(branch),
		);
		setToolActive(!state.assessed || state.pending);
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreBranchState(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreBranchState(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (isExplicitProjectMemoryLoadInput(event.text)) {
			lifecycle.assess(false);
			persistState();
			setToolActive(false);
			return {
				action: "transform",
				text: stripExplicitProjectMemoryLoadMarker(event.text),
				...(event.images ? { images: event.images } : {}),
			};
		}

		if (lifecycle.needsAssessment) {
			const entryCount = ctx.sessionManager.getBranch().length;
			const decision = shouldLoadProjectMemory({
				latestRequest: event.text,
				contextText: getProjectMemoryContextText(ctx),
				hasRecentProjectMemoryLoad: hasRecentProjectMemoryLoad(ctx, entryCount),
			});
			lifecycle.assess(decision.loadNeeded);
			pi.appendEntry("project-memory-assessment", {
				entryCount,
				loadNeeded: decision.loadNeeded,
				reason: decision.reason,
				missingMarkers: decision.missingMarkers,
				areas: decision.areas,
			});
			recordContextMetric(ctx, (name) => pi.getFlag(name), "project-memory:auto-load-assessment", {
				entryCount,
				loadNeeded: decision.loadNeeded,
				reason: decision.reason,
			});
			persistState();
		}

		if (!state.pending) {
			setToolActive(false);
			return { action: "continue" };
		}
		setToolActive(true);
		return { action: "continue" };
	});

	pi.on("tool_call", async (event, ctx) => {
		if (!state.pending || event.toolName !== PROJECT_MEMORY_LOAD_TOOL) return;
		if (
			!state.promptDelivered &&
			hasReachableProjectMemoryInstruction(ctx.sessionManager.getBranch())
		) {
			lifecycle.confirmPromptDelivered();
			persistState();
		}
		if (!state.promptDelivered) {
			return {
				block: true,
				reason:
					"Wait for the hidden automatic-load instruction before calling dotdotgod_project_load.",
			};
		}
	});

	pi.on("before_agent_start", async () => {
		setToolActive(state.pending);
		const content = buildPendingProjectMemoryLoadPrompt(state.pending);
		if (!content) return;
		if (!state.promptDelivered) {
			lifecycle.confirmPromptDelivered();
			persistState();
		}
		return {
			message: {
				customType: PROJECT_MEMORY_CONTEXT_TYPE,
				content,
				display: false,
			},
		};
	});
}
