/** Filesystem discovery helpers for project memory loading. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
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

export const DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE = ["docs/plan", "docs/archive"];
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "build", "coverage", ".git", ".dotdotgod"]);

export interface ProjectMemorySnapshot {
	present: string[];
	missing: string[];
	directories: Array<{ path: string; exists: boolean; markdownFiles: string[]; readmeFiles: string[] }>;
	exclude?: string[];
}

export interface LoadCommandInfo {
	name: string;
	sourceInfo?: { path?: string };
}

export function estimateTextMetrics(text: string): { characters: number; words: number; approxTokens: number } {
	const trimmed = text.trim();
	return { characters: text.length, words: trimmed ? trimmed.split(/\s+/).length : 0, approxTokens: Math.ceil(text.length / 4) };
}

export function pathExists(cwd: string, path: string): boolean {
	return existsSync(join(cwd, path));
}

function configuredExclusions(cwd: string): string[] {
	try {
		const parsed = JSON.parse(readFileSync(join(cwd, "dotdotgod.config.json"), "utf8")) as { load?: { documentationSummary?: { exclude?: unknown } } };
		const values = parsed.load?.documentationSummary?.exclude;
		if (Array.isArray(values) && values.every((value) => typeof value === "string")) return values;
	} catch {
		// Use the built-in safe local-memory exclusions.
	}
	return DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE;
}

function isExcluded(path: string, patterns: string[]): boolean {
	return patterns.some((pattern) => {
		const value = pattern.replace(/^\.\//, "").replace(/\/$/, "");
		if (value.startsWith("**/")) return path.endsWith(value.slice(3));
		const normalized = value.replace(/\/\*\*$/, "");
		return path === normalized || path.startsWith(`${normalized}/`);
	});
}

function walkMarkdownFiles(cwd: string, directory: string, matches: (fileName: string) => boolean, exclude: string[] = []): string[] {
	const root = join(cwd, directory);
	if (!existsSync(root)) return [];
	const results: string[] = [];
	const walk = (current: string): void => {
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true, encoding: "utf8" });
		} catch {
			return;
		}
		entries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of entries) {
			const absolute = join(current, entry.name);
			const path = relative(cwd, absolute).replaceAll("\\", "/");
			if (entry.name.startsWith(".") || isExcluded(path, exclude)) continue;
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) walk(absolute);
			} else if (entry.isFile() && matches(entry.name)) results.push(path);
		}
	};
	walk(root);
	return results.sort();
}

export function listMarkdownFiles(cwd: string, directory: string, limit?: number): string[] {
	const files = walkMarkdownFiles(cwd, directory, (name) => name.toLowerCase().endsWith(".md"));
	return limit === undefined ? files : files.slice(0, limit);
}

export function listReadmeFiles(cwd: string, directory: string, limit?: number): string[] {
	const files = walkMarkdownFiles(cwd, directory, (name) => name.toLowerCase() === "readme.md");
	return limit === undefined ? files : files.slice(0, limit);
}

export function collectSnapshot(cwd: string): ProjectMemorySnapshot {
	const present = MARKER_FILES.filter((file) => pathExists(cwd, file));
	const missing = MARKER_FILES.filter((file) => !pathExists(cwd, file));
	const exclude = configuredExclusions(cwd);
	let documentationDirectories: string[] = [];
	try {
		documentationDirectories = readdirSync(join(cwd, "docs"), { withFileTypes: true, encoding: "utf8" })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_DIRECTORY_NAMES.has(entry.name))
			.map((entry) => `docs/${entry.name}`)
			.filter((path) => !isExcluded(path, exclude))
			.sort();
	} catch {
		documentationDirectories = [];
	}
	const directories = documentationDirectories.map((directory) => ({
		path: directory,
		exists: true,
		markdownFiles: walkMarkdownFiles(cwd, directory, (name) => name.toLowerCase().endsWith(".md"), exclude),
		readmeFiles: walkMarkdownFiles(cwd, directory, (name) => name.toLowerCase() === "readme.md", exclude),
	}));
	return { present, missing, directories, exclude };
}

export function hasOtherLoadCommand(commands: readonly LoadCommandInfo[]): boolean {
	return commands.some((command) => {
		if (command.name !== "load" && !/^load:\d+$/.test(command.name)) return false;
		return !(command.sourceInfo?.path ?? "").includes("extensions/load-project");
	});
}
