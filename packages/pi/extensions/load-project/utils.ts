/**
 * Pure utility functions for project memory loading.
 * Extracted for testability.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

export const MARKER_FILES = [
	"AGENTS.md",
	"CLAUDE.md",
	"CODEX.md",
	"README.md",
	"docs/README.md",
	"docs/spec/README.md",
	"docs/test/README.md",
	"docs/arch/README.md",
	"docs/plan/README.md",
	"docs/archive/README.md",
];

export const MEMORY_DIRECTORIES = ["docs/spec", "docs/test", "docs/arch", "docs/plan"];

export interface ProjectMemorySnapshot {
	present: string[];
	missing: string[];
	directories: Array<{ path: string; exists: boolean; markdownFiles: string[] }>;
}

export interface LoadCommandInfo {
	name: string;
	sourceInfo?: { path?: string };
}

export interface LoadSnapshotRunResult {
	ok: boolean;
	command?: string;
	data?: unknown;
	error?: string;
}

interface LoadSnapshotLike {
	cache?: {
		status?: string;
		ok?: boolean;
		indexedFiles?: number;
		currentFiles?: number;
		staleFiles?: number;
		archiveBodiesIncluded?: boolean;
		graph?: { nodes?: number; edges?: number };
	};
	metadata?: {
		cacheRefreshed?: boolean;
		previousStatus?: string;
		changedFiles?: number;
		fullRebuild?: boolean;
		indexedFiles?: number;
		indexSizeBytes?: number;
		archiveBodiesIncluded?: boolean;
	};
	graph?: {
		nodes?: number;
		edges?: number;
		byType?: Record<string, number>;
	};
	communities?: {
		communities?: Array<{
			id?: string;
			label?: string;
			files?: string[];
			docs?: string[];
			commands?: string[];
			events?: string[];
			tests?: string[];
			nodeCount?: number;
			edgeCount?: number;
			omitted?: number;
		}>;
		omitted?: number;
		total?: number;
		method?: string;
		fallback?: boolean;
	};
	bounds?: { fullGraphIncluded?: boolean };
}

export function estimateTextMetrics(text: string): { characters: number; words: number; approxTokens: number } {
	const trimmed = text.trim();
	return {
		characters: text.length,
		words: trimmed ? trimmed.split(/\s+/).length : 0,
		approxTokens: Math.ceil(text.length / 4),
	};
}

export function pathExists(cwd: string, path: string): boolean {
	return existsSync(join(cwd, path));
}

export function listMarkdownFiles(cwd: string, directory: string, limit = 20): string[] {
	const root = join(cwd, directory);
	if (!existsSync(root)) return [];

	const results: string[] = [];
	const walk = (current: string): void => {
		if (results.length >= limit) return;
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true, encoding: "utf8" });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (results.length >= limit) return;
			const absolute = join(current, entry.name);
			if (entry.isDirectory()) {
				walk(absolute);
			} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				results.push(relative(cwd, absolute));
			}
		}
	};

	walk(root);
	return results;
}

export function collectSnapshot(cwd: string): ProjectMemorySnapshot {
	const present = MARKER_FILES.filter((file) => pathExists(cwd, file));
	const missing = MARKER_FILES.filter((file) => !pathExists(cwd, file));
	const directories = MEMORY_DIRECTORIES.map((directory) => ({
		path: directory,
		exists: pathExists(cwd, directory),
		markdownFiles: listMarkdownFiles(cwd, directory),
	}));

	return { present, missing, directories };
}

export function hasOtherLoadCommand(commands: readonly LoadCommandInfo[]): boolean {
	return commands.some((command) => {
		if (command.name !== "load" && !/^load:\d+$/.test(command.name)) return false;
		const sourcePath = command.sourceInfo?.path ?? "";
		return !sourcePath.includes("extensions/load-project");
	});
}

function parseLoadSnapshotJson(stdout: string): unknown {
	const trimmed = stdout.trim();
	if (!trimmed) throw new Error("load-snapshot returned empty output");
	return JSON.parse(trimmed) as unknown;
}

export function runDotdotgodLoadSnapshot(cwd: string, timeoutMs = 10_000): LoadSnapshotRunResult {
	const localCli = join(cwd, "packages/cli/bin/dotdotgod.mjs");
	const candidates = existsSync(localCli)
		? [
			{ command: process.execPath, args: [localCli, "load-snapshot", cwd, "--json"], label: "local workspace CLI" },
			{ command: "dotdotgod", args: ["load-snapshot", cwd, "--json"], label: "dotdotgod" },
		]
		: [{ command: "dotdotgod", args: ["load-snapshot", cwd, "--json"], label: "dotdotgod" }];

	const errors: string[] = [];
	for (const candidate of candidates) {
		try {
			const stdout = execFileSync(candidate.command, candidate.args, {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
			});
			return { ok: true, command: candidate.label, data: parseLoadSnapshotJson(stdout) };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			errors.push(`${candidate.label}: ${message}`);
		}
	}

	return { ok: false, error: errors.join("; ") || "dotdotgod load-snapshot failed" };
}

function asLoadSnapshot(value: unknown): LoadSnapshotLike | undefined {
	return value && typeof value === "object" ? (value as LoadSnapshotLike) : undefined;
}

function formatCount(value: unknown): string {
	return typeof value === "number" ? value.toLocaleString() : "unknown";
}

function formatTopTypes(byType: Record<string, number> | undefined, limit = 6): string {
	if (!byType) return "unknown";
	const entries = Object.entries(byType)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, limit);
	return entries.length > 0 ? entries.map(([type, count]) => `${type}:${count}`).join(", ") : "none";
}

function truncateList(items: string[] | undefined, limit: number): string {
	if (!items || items.length === 0) return "none";
	const shown = items.slice(0, limit);
	const suffix = items.length > limit ? `, +${items.length - limit} more` : "";
	return `${shown.join(", ")}${suffix}`;
}

export function formatLoadSnapshotSummary(result: LoadSnapshotRunResult, communityLimit = 5): string {
	if (!result.ok) {
		return `Load snapshot: unavailable; using lightweight fallback snapshot. Reason: ${result.error ?? "unknown error"}`;
	}

	const snapshot = asLoadSnapshot(result.data);
	if (!snapshot) return "Load snapshot: unavailable; using lightweight fallback snapshot. Reason: invalid snapshot shape";

	const cache = snapshot.cache;
	const metadata = snapshot.metadata;
	const graph = snapshot.graph ?? cache?.graph;
	const communities = snapshot.communities;
	const lines = [
		"Load snapshot:",
		`- Source: ${result.command ?? "dotdotgod load-snapshot"}`,
		`- Cache: status=${cache?.status ?? "unknown"}, ok=${String(cache?.ok ?? "unknown")}, indexedFiles=${formatCount(cache?.indexedFiles)}, staleFiles=${formatCount(cache?.staleFiles)}, archiveBodiesIncluded=${String(cache?.archiveBodiesIncluded ?? metadata?.archiveBodiesIncluded ?? "unknown")}`,
		`- Refresh: cacheRefreshed=${String(metadata?.cacheRefreshed ?? false)}, previousStatus=${metadata?.previousStatus ?? "none"}, changedFiles=${formatCount(metadata?.changedFiles)}, fullRebuild=${String(metadata?.fullRebuild ?? false)}`,
		`- Graph: nodes=${formatCount(graph?.nodes)}, edges=${formatCount(graph?.edges)}, topTypes=${formatTopTypes(snapshot.graph?.byType)}`,
		`- Communities: method=${communities?.method ?? "unknown"}, fallback=${String(communities?.fallback ?? "unknown")}, shown=${formatCount(communities?.communities?.slice(0, communityLimit).length)}, total=${formatCount(communities?.total)}, omitted=${formatCount(communities?.omitted)}`,
		`- Bounds: fullGraphIncluded=${String(snapshot.bounds?.fullGraphIncluded ?? false)}`,
	];

	for (const community of communities?.communities?.slice(0, communityLimit) ?? []) {
		lines.push(
			`  - ${community.label ?? community.id ?? "community"}: files=${truncateList(community.files, 3)}; docs=${truncateList(community.docs, 3)}; commands=${truncateList(community.commands, 4)}; events=${truncateList(community.events, 4)}; tests=${truncateList(community.tests, 3)}; omitted=${formatCount(community.omitted)}`,
		);
	}

	return lines.join("\n");
}

export function buildLoadPrompt(
	cwd: string,
	args: string,
	snapshot: ProjectMemorySnapshot,
	loadSnapshot?: LoadSnapshotRunResult,
): string {
	const present = snapshot.present.length > 0 ? snapshot.present.map((file) => `- ${file}`).join("\n") : "- none";
	const missing = snapshot.missing.length > 0 ? snapshot.missing.map((file) => `- ${file}`).join("\n") : "- none";
	const directorySummary = snapshot.directories
		.map((directory) => {
			if (!directory.exists) return `- ${directory.path}: missing`;
			if (directory.markdownFiles.length === 0) return `- ${directory.path}: no markdown files`;
			return `- ${directory.path}:\n${directory.markdownFiles.map((file) => `  - ${file}`).join("\n")}`;
		})
		.join("\n");

	const mode = args.trim() ? `\nUser arguments: ${args.trim()}\n` : "";
	const loadSnapshotText = loadSnapshot ? `\n${formatLoadSnapshotSummary(loadSnapshot)}\n` : "";

	return `Load the dotdotgod project memory.${mode}
Current working directory: ${cwd}
${loadSnapshotText}
Detected memory files:
${present}

Missing baseline files:
${missing}

Documentation directory summary:
${directorySummary}

Instructions:
1. Use the Load snapshot section first when present. Treat it as the bounded project-memory map for cache status, graph size, related communities, and archive inclusion policy.
2. Use only read-only tools such as read, ls, grep, and find to inspect project memory files.
3. Start with AGENTS.md, README.md, and docs/README.md when they are not already clear from the loaded context.
4. Inspect docs/spec, docs/arch, and docs/test selectively based on the user request, the load snapshot communities, and README indexes. Do not re-scan every listed file unless the task needs a full refresh.
5. Follow README.md indexes, including domain directories such as docs/<area>/<domain>/README.md and expanded convention directories such as docs/arch/conventions/README.md.
6. For docs/plan, list entries first and selectively read only the relevant README.md or markdown files.
7. For docs/archive, do not scan it as part of the documentation directory summary. Use docs/archive/README.md as the history map, and use targeted archive paths only when the user request or current task makes completed plans/reports relevant.
8. Summarize the result concisely in English.

Response format:
- Project summary
- Key working rules
- Available commands and verification methods
- Documentation map
- Active plans
- Relevant archive notes
- Open TODO/TBD items or questions to clarify

Do not modify files. Only load and summarize project memory.`;
}
