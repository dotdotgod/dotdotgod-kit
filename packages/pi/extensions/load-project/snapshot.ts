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

