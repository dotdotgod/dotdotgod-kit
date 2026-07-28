/**
 * Project Memory Loader Extension
 *
 * Provides /load and /dd:load commands for loading dotdotgod docs.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { recordContextMetric } from "../context-metrics/utils.js";
import { buildLoadPrompt, collectSnapshot, documentationSummaryDirectories, estimateTextMetrics, hasOtherLoadCommand, runDotdotgodQuery } from "./utils.js";

async function runLoadCommand(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	args: string,
	commandName: "load" | "dd:load" | "dd:load:compact",
) {
	const mode = commandName === "dd:load:compact" ? "compact" : "full";
	const snapshot = collectSnapshot(ctx.cwd);
	const queryResult = args.trim() ? runDotdotgodQuery(ctx.cwd, args.trim()) : undefined;
	const conflict = hasOtherLoadCommand(pi.getCommands());

	if (ctx.hasUI && conflict) {
		ctx.ui.notify(
			"Another /load command was detected. dotdotgod provides /dd:load as the stable alias.",
			"info",
		);
	}

	const prompt = buildLoadPrompt(ctx.cwd, args, snapshot, queryResult, { mode });
	const promptMetrics = estimateTextMetrics(prompt);
	recordContextMetric(ctx, (name) => pi.getFlag(name), "load-project:before-send", {
		commandName,
		promptMetrics,
		directorySummaryPaths: documentationSummaryDirectories(snapshot).map((directory) => directory.path),
		query: queryResult ? { ok: queryResult.ok, command: queryResult.command, error: queryResult.error } : undefined,
	});
	const deliverAs = ctx.isIdle() ? undefined : "followUp";
	pi.sendUserMessage(prompt, deliverAs ? { deliverAs } : undefined);
	pi.appendEntry("project-memory-load", {
		commandName,
		entryCount: ctx.sessionManager.getEntries().length,
		promptMetrics,
		query: queryResult ? { ok: queryResult.ok, command: queryResult.command, error: queryResult.error } : undefined,
	});
	recordContextMetric(ctx, (name) => pi.getFlag(name), "load-project:after-send", { commandName, deliverAs: deliverAs ?? "immediate" });

	if (ctx.hasUI) {
		const queued = deliverAs === "followUp" ? " It will run as a follow-up after the current turn finishes." : "";
		ctx.ui.notify(`Started project memory loading with /${commandName}.${queued}`, "info");
	}
}

export default function loadProjectExtension(pi: ExtensionAPI): void {
	pi.registerFlag("dd-context-debug", {
		description: "Record dotdotgod context measurement debug events to a local JSONL file",
		type: "boolean",
		default: false,
	});
	pi.registerFlag("dd-context-debug-output", {
		description: "Path for dotdotgod context measurement debug JSONL output",
		type: "string",
		default: "",
	});

	pi.registerCommand("load", {
		description: "Load dotdotgod docs for the current project in full mode",
		handler: async (args, ctx) => runLoadCommand(pi, ctx, args, "load"),
	});

	pi.registerCommand("dd:load", {
		description: "Load dotdotgod docs for the current project in full mode (namespaced alias)",
		handler: async (args, ctx) => runLoadCommand(pi, ctx, args, "dd:load"),
	});

	pi.registerCommand("dd:load:compact", {
		description: "Load dotdotgod docs for the current project in compact mode",
		handler: async (args, ctx) => runLoadCommand(pi, ctx, args, "dd:load:compact"),
	});
}
