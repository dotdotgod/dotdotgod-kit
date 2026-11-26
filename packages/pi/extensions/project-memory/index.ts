import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyHint } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { recordContextMetric } from "../context-metrics/utils.ts";
import { buildLoadPrompt, collectSnapshot } from "../load-project/utils.ts";
import type { QueryRunResult } from "../load-project/prompt.ts";
import { composeActiveTools } from "../shared/active-tools.ts";
import { callProjectTool } from "../shared/mcp.ts";
import {
	formatProjectMemoryToolOutput,
	hostComplete,
	isInitializedProject,
	PROJECT_MEMORY_CONTEXT_TYPE,
	PROJECT_MEMORY_EXPLICIT_LOAD_MARKER,
	PROJECT_MEMORY_LOAD_TOOL,
} from "./context.ts";
import { ProjectMemoryLifecycle, PROJECT_MEMORY_STATE_ENTRY } from "./lifecycle.ts";

const MAP_UNAVAILABLE = "Configured documentation map is unavailable; inspect project settings and README indexes with host tools.";
const ProjectMemoryLoadParams = Type.Object({
	focus: Type.String({ maxLength: 500, description: "A concise task-specific retrieval focus, or an empty string for baseline memory." }),
});

export default function projectMemoryExtension(pi: ExtensionAPI): void {
	const lifecycle = new ProjectMemoryLifecycle(state => pi.appendEntry(PROJECT_MEMORY_STATE_ENTRY, state));
	let rawPrompt: string | undefined;

	function syncTool(ctx: ExtensionContext): boolean {
		const active = isInitializedProject(ctx.cwd) && !lifecycle.getLoadState().loaded;
		const tools = pi.getActiveTools();
		if (active !== tools.includes(PROJECT_MEMORY_LOAD_TOOL)) {
			pi.setActiveTools(composeActiveTools(tools, [PROJECT_MEMORY_LOAD_TOOL], active ? [PROJECT_MEMORY_LOAD_TOOL] : []));
		}
		return active;
	}

	function recordError(errorCode: string): void {
		pi.appendEntry("project-memory-decision-error", { errorCode });
	}

	pi.registerTool({
		name: PROJECT_MEMORY_LOAD_TOOL,
		label: "dotdotgod project load",
		defaultActive: false,
		description: "Load curated project memory with a task-specific semantic focus or the baseline documentation map.",
		promptSnippet: "Load curated project memory when repository context would help.",
		outputSchema: Type.Record(Type.String(), Type.Any()),
		parameters: ProjectMemoryLoadParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!isInitializedProject(ctx.cwd) || !lifecycle.beginLoad()) {
				return { isError: true, content: [{ type: "text", text: "Project memory load is unavailable or already in progress." }], details: {} };
			}
			const focus = params.focus.replace(/\s+/g, " ").trim();
			try {
				const loaded = await callProjectTool(ctx, "project_load", { focus }, signal);
				const payload = loaded.details as {
					ok?: boolean; documentationTree?: string[]; documentationRoot?: string; mapUnavailable?: unknown;
					queryUnavailable?: { message?: string }; query?: QueryRunResult["data"];
				} | undefined;
				if (payload?.mapUnavailable) {
					return { ...loaded, isError: true, content: [{ type: "text", text: MAP_UNAVAILABLE }] };
				}
				if (loaded.isError) return loaded;
				if (payload?.ok !== true || !Array.isArray(payload.documentationTree)) throw new Error("Project memory load failed.");
				// Keep Pi's compact narrative/UI; only service execution moves to MCP.
				const snapshot = collectSnapshot(ctx.cwd);
				const documentationMap = { ok: true as const, command: "MCP project_load", data: {
					ok: true as const, root: ctx.cwd, documentationRoot: payload.documentationRoot ?? snapshot.documentationRoot ?? "docs",
					depth: focus ? 3 : 5, exclude: snapshot.exclude ?? [], paths: [], tree: payload.documentationTree.join("\n"),
				} };
				const queryResult = focus ? { ok: !payload.queryUnavailable, command: documentationMap.command, ...(payload.queryUnavailable?.message ? { error: payload.queryUnavailable.message } : {}), ...(payload.query ? { data: payload.query } : {}) } : undefined;
				const prompt = buildLoadPrompt(ctx.cwd, focus, snapshot, queryResult, { mode: "compact", documentationMap });
				const completion = {
					entryCount: ctx.sessionManager.getBranch().length,
					focus,
					mapOk: documentationMap.ok,
					queryOk: queryResult?.ok,
				};
				pi.appendEntry("project-memory-load", { reason: "global-context-shaping", ...completion });
				lifecycle.markLoaded();
				syncTool(ctx);
				recordContextMetric(ctx, (name) => pi.getFlag(name), "project-memory:auto-load-complete", completion);
				const details = {
					ok: queryResult?.ok ?? true,
					focus,
					output: prompt,
					map: { ok: documentationMap.ok, command: documentationMap.command },
					...(queryResult ? { query: { ok: queryResult.ok, command: queryResult.command,
						...(queryResult.error !== undefined ? { error: queryResult.error } : {}) } } : {}),
				};
				return { content: [{ type: "text", text: prompt }], details, structuredContent: details };
			} catch {
				recordError("request_failed");
				return { isError: true, content: [{ type: "text", text: "Project memory load failed." }], details: {} };
			} finally {
				lifecycle.finishLoad();
			}
		},
		renderResult(result, { expanded, isPartial }, theme, renderContext) {
			if (isPartial) return new Text(theme.fg("warning", "Loading dotdotgod project memory..."), 0, 0);
			const details = result.details as { output?: string; mapUnavailable?: unknown } | undefined;
			if (details?.mapUnavailable) return new Text(theme.fg("error", `Error: ${MAP_UNAVAILABLE}`), 0, 0);
			if (renderContext.isError || ("isError" in result && result.isError) || typeof details?.output !== "string") {
				return new Text(theme.fg("error", "Error: Project memory load failed."), 0, 0);
			}
			const hint = "keyHint" in renderContext && typeof renderContext.keyHint === "function"
				? renderContext.keyHint("app.tools.expand", "to expand")
				: keyHint("app.tools.expand", "to expand");
			return new Text(formatProjectMemoryToolOutput(details.output, expanded, hint), 0, 0);
		},
	});

	function restoreBranchState(_: unknown, ctx: ExtensionContext): void {
		rawPrompt = undefined;
		lifecycle.restore(ctx.sessionManager.getBranch());
		syncTool(ctx);
	}

	pi.on("session_start", restoreBranchState);
	pi.on("session_tree", restoreBranchState);

	pi.on("input", (event, ctx) => {
		if (!isInitializedProject(ctx.cwd)) return;
		const marker = `${PROJECT_MEMORY_EXPLICIT_LOAD_MARKER}\n`;
		if (event.source === "extension" && event.text.startsWith(marker)) {
			lifecycle.markLoaded();
			syncTool(ctx);
			return { action: "transform", text: event.text.slice(marker.length), ...(event.images ? { images: event.images } : {}) };
		}
		// Preserve the user's text rather than sending expanded skills or templates to triage.
		if (!event.streamingBehavior) rawPrompt = event.text;
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const prompt = rawPrompt ?? event.prompt;
		rawPrompt = undefined;
		if (!syncTool(ctx) || !prompt?.trim()) return;
		// @ts-expect-error The shared decision entry point is JavaScript without declarations.
		const { evaluateLoadDecision, formatDecisionInjection } = await import("@dotdotgod/context/decision");
		const outcome = await evaluateLoadDecision({
			root: ctx.cwd,
			rawPrompt: prompt,
			state: lifecycle,
			hostComplete: (request: Parameters<typeof hostComplete>[1]) => hostComplete(ctx, request),
			signal: ctx.signal,
		});
		if (outcome.errorCode) recordError(outcome.errorCode);
		syncTool(ctx);
		const content = lifecycle.getLoadState().pending && outcome.kind === "advice"
			? "For this turn only, call project_memory_load exactly once before substantive work. Use a concise semantic focus or an empty string for baseline memory."
			: formatDecisionInjection(outcome, { toolName: PROJECT_MEMORY_LOAD_TOOL, maxBytes: 8192 });
		if (content) return { message: { customType: PROJECT_MEMORY_CONTEXT_TYPE, content, display: false } };
	});
}
