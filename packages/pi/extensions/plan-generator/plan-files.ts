import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { isValidPlanSlug, normalizeRequestForSlug, toKebabCase } from "./utils.ts";

export interface PlanGeneratorTaskPath {
	taskSlug: string;
	taskDir: string;
	readmePath: string;
}

export function normalizePlanTaskPath(cwd: string, input: string): PlanGeneratorTaskPath | undefined {
	const normalized = input.replace(/\\/g, "/").replace(/\/$/, "");
	const match = normalized.match(/^docs\/plan\/([^/]+)(?:\/README\.md)?$/);
	if (!match) return undefined;
	const taskSlug = match[1];
	if (!taskSlug || !isValidPlanSlug(taskSlug)) return undefined;
	const taskDir = path.join(cwd, "docs", "plan", taskSlug);
	return { taskSlug, taskDir, readmePath: path.join(taskDir, "README.md") };
}

export function proposeSlugFromRequest(request: string): string {
	const slug = toKebabCase(normalizeRequestForSlug(request)).split("-").slice(0, 8).join("-");
	return slug || "new-plan";
}

export function resolveCollisionFreeTaskPath(cwd: string, request: string, proposedSlug = proposeSlugFromRequest(request)): PlanGeneratorTaskPath {
	const baseSlug = isValidPlanSlug(proposedSlug) ? proposedSlug : proposeSlugFromRequest(proposedSlug);
	const safeBaseSlug = baseSlug || "new-plan";
	let taskSlug = safeBaseSlug;
	let suffix = 2;
	while (existsSync(path.join(cwd, "docs", "plan", taskSlug))) {
		taskSlug = `${safeBaseSlug}-${suffix}`;
		suffix += 1;
	}
	const taskDir = path.join(cwd, "docs", "plan", taskSlug);
	return { taskSlug, taskDir, readmePath: path.join(taskDir, "README.md") };
}

export function createReadmeScaffold(title: string, requestSummary = ""): string {
	return `# ${title}

Status: active

## Request Summary

${requestSummary.trim()}

## Goal

## Plan:
`;
}

export function ensureInitialReadme(task: PlanGeneratorTaskPath, title: string, requestSummary = ""): void {
	if (existsSync(task.readmePath)) return;
	mkdirSync(task.taskDir, { recursive: true });
	writeFileSync(task.readmePath, createReadmeScaffold(title, requestSummary));
}

export function discoverPlanMarkdownFiles(taskDir: string): string[] {
	const results: string[] = [];
	function walk(directory: string): void {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			if (entry.name === ".dotdotgod-plan") continue;
			const entryPath = path.join(directory, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) {
				walk(entryPath);
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".md")) results.push(entryPath);
		}
	}
	if (!existsSync(taskDir) || !statSync(taskDir).isDirectory()) return [];
	walk(taskDir);
	return results.sort();
}
