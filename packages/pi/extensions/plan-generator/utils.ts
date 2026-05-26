import * as path from "node:path";

export function formatIso(now = new Date()): string {
	return now.toISOString();
}

const REQUEST_SLUG_REPLACEMENTS: Array<[RegExp, string]> = [
	[/플랜|계획/g, " plan "],
	[/제너레이터|제네레이터/g, " generator "],
	[/모드/g, " mode "],
	[/실행/g, " execution "],
	[/리뷰|검토/g, " review "],
	[/파일/g, " file "],
	[/이름|네임/g, " name "],
	[/설명/g, " description "],
	[/처음|첫/g, " initial "],
	[/생성|만들/g, " create "],
	[/작성/g, " author "],
	[/상태/g, " state "],
	[/단계|스테이지/g, " stage "],
];

export function normalizeRequestForSlug(input: string): string {
	return REQUEST_SLUG_REPLACEMENTS.reduce(
		(value, [pattern, replacement]) => value.replace(pattern, replacement),
		input,
	);
}

export function toKebabCase(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/['’]/g, "")
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-")
		.toLowerCase();
}

export function toUpperSnake(input: string): string {
	return toKebabCase(input).replace(/-/g, "_").toUpperCase();
}

export function escapeMarkdown(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

export function dedupeStrings(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function normalizeRelativePath(cwd: string, input: string): string {
	const absolute = path.isAbsolute(input) ? input : path.resolve(cwd, input);
	return path.relative(cwd, absolute).split(path.sep).join("/");
}

export function isValidPlanSlug(slug: string): boolean {
	return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function stableBlockerSetKey(blockers: string[]): string {
	return dedupeStrings(blockers).sort().join("\n");
}
