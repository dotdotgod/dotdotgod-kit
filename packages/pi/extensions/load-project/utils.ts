/**
 * Pure utility functions for project memory loading.
 * Extracted for testability.
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

export const MEMORY_DIRECTORIES = ["docs/spec", "docs/test", "docs/arch", "docs/plan", "docs/archive"];

export interface ProjectMemorySnapshot {
	present: string[];
	missing: string[];
	directories: Array<{ path: string; exists: boolean; markdownFiles: string[] }>;
}

export interface LoadCommandInfo {
	name: string;
	sourceInfo?: { path?: string };
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

export function buildLoadPrompt(cwd: string, args: string, snapshot: ProjectMemorySnapshot): string {
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

	return `Load the dotdotgod project memory.${mode}
Current working directory: ${cwd}

Detected memory files:
${present}

Missing baseline files:
${missing}

Documentation directory summary:
${directorySummary}

Instructions:
1. Use only read-only tools such as read, ls, grep, and find to inspect the necessary project memory files.
2. Start with AGENTS.md, README.md, and docs/README.md to understand the project purpose and working rules.
3. Inspect docs/spec, docs/arch, and docs/test to summarize product, architecture, code conventions, infrastructure/runtime dependencies, and verification context.
4. Follow README.md indexes, including domain directories such as docs/<area>/<domain>/README.md and expanded convention directories such as docs/arch/conventions/README.md.
5. For docs/plan and docs/archive, list entries first and selectively read only the relevant README.md or markdown files. Treat docs/archive/plan as completed plans and docs/archive/report as temporary reports/investigations. Do not read every archive indiscriminately.
6. Summarize the result concisely in English.

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
