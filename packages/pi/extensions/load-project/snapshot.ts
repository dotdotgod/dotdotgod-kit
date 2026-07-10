/**
 * Snapshot and fallback discovery helpers for project memory loading.
 */

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

const MAX_DOCUMENTATION_DIRECTORIES = 20;
const SKIPPED_DIRECTORY_NAMES = new Set(["node_modules", "dist", "build", "coverage", ".git", ".dotdotgod"]);

export interface ProjectMemorySnapshot {
	present: string[];
	missing: string[];
	directories: Array<{ path: string; exists: boolean; markdownFiles: string[]; readmeFiles: string[] }>;
	omittedDirectories?: number;
}

export interface LoadCommandInfo {
	name: string;
	sourceInfo?: { path?: string };
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

function walkMarkdownFiles(cwd: string, directory: string, limit: number, matches: (fileName: string) => boolean): string[] {
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
			if (entry.isDirectory()) {
				if (!entry.name.startsWith(".") && !SKIPPED_DIRECTORY_NAMES.has(entry.name)) walk(absolute);
			} else if (entry.isFile() && matches(entry.name)) {
				results.push(relative(cwd, absolute));
			}
		}
	};

	walk(root);
	return results.sort().slice(0, limit);
}

export function listMarkdownFiles(cwd: string, directory: string, limit = 20): string[] {
	return walkMarkdownFiles(cwd, directory, limit, (fileName) => fileName.toLowerCase().endsWith(".md"));
}

export function listReadmeFiles(cwd: string, directory: string, limit = 20): string[] {
	return walkMarkdownFiles(cwd, directory, limit, (fileName) => fileName.toLowerCase() === "readme.md");
}

export function collectSnapshot(cwd: string): ProjectMemorySnapshot {
	const present = MARKER_FILES.filter((file) => pathExists(cwd, file));
	const missing = MARKER_FILES.filter((file) => !pathExists(cwd, file));
	let documentationDirectories: string[] = [];
	try {
		documentationDirectories = readdirSync(join(cwd, "docs"), { withFileTypes: true, encoding: "utf8" })
			.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIPPED_DIRECTORY_NAMES.has(entry.name))
			.map((entry) => `docs/${entry.name}`)
			.sort();
	} catch {
		documentationDirectories = [];
	}
	const selected = documentationDirectories.slice(0, MAX_DOCUMENTATION_DIRECTORIES);
	const directories = selected.map((directory) => ({
		path: directory,
		exists: true,
		markdownFiles: listMarkdownFiles(cwd, directory),
		readmeFiles: listReadmeFiles(cwd, directory),
	}));

	return { present, missing, directories, omittedDirectories: Math.max(0, documentationDirectories.length - selected.length) };
}

export function hasOtherLoadCommand(commands: readonly LoadCommandInfo[]): boolean {
	return commands.some((command) => {
		if (command.name !== "load" && !/^load:\d+$/.test(command.name)) return false;
		const sourcePath = command.sourceInfo?.path ?? "";
		return !sourcePath.includes("extensions/load-project");
	});
}

