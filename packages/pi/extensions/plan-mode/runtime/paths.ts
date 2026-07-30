import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

export const PLAN_DIRECTORY = "docs/plan";
export const ARCHIVE_DIRECTORY = "docs/archive";
export const DEFAULT_PLAN_MODE_WRITABLE_PATHS = ["docs/plan/**", "docs/archive/**"] as const;

export function normalizeToolPath(path: string): string {
	return path.replace(/^@/, "");
}

function isKebabCaseDirectory(name: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isPlanMarkdownFile(name: string): boolean {
	return name === "README.md" || /^[A-Z0-9]+(?:_[A-Z0-9]+)*\.md$/.test(name);
}

function relativePathInside(cwd: string, path: string, directory: string): string | undefined {
	const targetPath = resolve(cwd, normalizeToolPath(path));
	const basePath = resolve(cwd, directory);
	const relativePath = relative(basePath, targetPath);
	const isInsideDirectory = relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
	return isInsideDirectory ? relativePath : undefined;
}

function isMarkdownPathInside(cwd: string, path: string, directory: string): boolean {
	const relativePath = relativePathInside(cwd, path, directory);
	if (!relativePath) return false;

	const segments = relativePath.split(/[\\/]+/);
	const fileName = segments[segments.length - 1];
	if (!fileName || !isPlanMarkdownFile(fileName)) return false;

	return segments.slice(0, -1).every(isKebabCaseDirectory);
}

function writableDirectory(pattern: string): string | undefined {
	const normalized = pattern.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
	if (!normalized.startsWith("docs/") || normalized.includes("..") || normalized.startsWith("docs/.")) return undefined;
	if (normalized.includes("*") && !normalized.endsWith("/**")) return undefined;
	return normalized.endsWith("/**") ? normalized.slice(0, -3) : normalized;
}

export function isManagedPlanMarkdownPath(cwd: string, path: string, writablePaths: readonly string[] = DEFAULT_PLAN_MODE_WRITABLE_PATHS): boolean {
	return writablePaths.some((pattern) => {
		const directory = writableDirectory(pattern);
		if (!directory) return false;
		if (pattern.replaceAll("\\", "/").replace(/\/+$/, "").endsWith("/**")) return isMarkdownPathInside(cwd, path, directory);
		const target = resolve(cwd, normalizeToolPath(path));
		if (target !== resolve(cwd, directory)) return false;
		const segments = directory.split("/");
		const fileName = segments.pop();
		return Boolean(fileName && isPlanMarkdownFile(fileName) && segments.slice(1).every(isKebabCaseDirectory));
	});
}

export function isActivePlanMarkdownPath(cwd: string, path: string): boolean {
	return isMarkdownPathInside(cwd, path, PLAN_DIRECTORY);
}

export function planPathExists(cwd: string, path: string): boolean {
	return existsSync(resolve(cwd, path));
}

export function getToolPath(input: unknown): string | undefined {
	if (!input || typeof input !== "object") return undefined;
	const path = (input as { path?: unknown }).path;
	return typeof path === "string" ? path : undefined;
}
