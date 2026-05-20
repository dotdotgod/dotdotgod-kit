export function getCurrentPlanReadmePath(path: string): string | undefined {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	const match = normalized.match(/^docs\/plan\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)$/);
	if (!match?.[1]) return undefined;
	return `docs/plan/${match[1]}/README.md`;
}

export function extractPlanSlugMentions(text: string): string[] {
	const slugs: string[] = [];
	const seen = new Set<string>();
	const add = (slug: string | undefined) => {
		if (!slug || seen.has(slug)) return;
		seen.add(slug);
		slugs.push(slug);
	};

	for (const match of text.matchAll(/docs\/plan\/([a-z0-9]+(?:-[a-z0-9]+)*)\/(?:README\.md|[A-Z0-9]+(?:_[A-Z0-9]+)*\.md)/g)) {
		add(match[1]);
	}
	for (const match of text.matchAll(/(?:^|[\s`"'(:])([a-z0-9]+(?:-[a-z0-9]+)+)(?=$|[\s`"'),.;:])/g)) {
		add(match[1]);
	}
	return slugs;
}

export function resolveMentionedPlanPath(
	cwd: string,
	text: string | undefined,
	currentPlanPath: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
): string | undefined {
	const candidates = [
		...extractPathMentions(text ?? "").map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
		...extractPlanSlugMentions(text ?? "").map((slug) => `docs/plan/${slug}/README.md`),
		...(currentPlanPath ? [currentPlanPath] : []),
		...touchedPaths.map((path) => getCurrentPlanReadmePath(path)).filter((path): path is string => Boolean(path)),
	];
	const seen = new Set<string>();
	return candidates.find((path) => {
		if (seen.has(path)) return false;
		seen.add(path);
		return pathExists(cwd, path);
	});
}

export function extractPathMentions(text: string): string[] {
	const paths: string[] = [];
	const seen = new Set<string>();
	const re = /(?:^|[\s`"'(:])(@?\.?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)(?=$|[\s`"'),.;:])/g;
	let match;
	while ((match = re.exec(text)) !== null) {
		const raw = match[1];
		if (!raw) continue;
		const normalized = raw.replace(/^@/, "").replace(/^\.\//, "").replace(/\/+/g, "/");
		if (normalized.includes("..") || normalized.endsWith("/")) continue;
		if (!/[.][A-Za-z0-9]+$/.test(normalized)) continue;
		if (!seen.has(normalized)) {
			seen.add(normalized);
			paths.push(normalized);
		}
	}
	return paths;
}

function isLikelyImpactTarget(path: string): boolean {
	const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
	if (!normalized || normalized.startsWith(".") || normalized.includes("..")) return false;
	if (normalized.startsWith("docs/plan/") || normalized.startsWith("docs/archive/")) return false;
	if (normalized.startsWith(".dotdotgod/") || normalized.startsWith("node_modules/") || normalized.startsWith("dist/") || normalized.startsWith("build/") || normalized.startsWith("coverage/")) return false;
	return /[.][A-Za-z0-9]+$/.test(normalized);
}

export function selectPlanImpactPaths(
	cwd: string,
	latestRequest: string | undefined,
	currentPlanPath: string | undefined,
	currentPlanContent: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
	limit = 3,
): string[] {
	const candidates = [
		...extractPathMentions(latestRequest ?? ""),
		...extractPathMentions(currentPlanContent ?? ""),
		...(currentPlanPath ? [currentPlanPath] : []),
		...touchedPaths,
	];
	const selected: string[] = [];
	const seen = new Set<string>();
	for (const path of candidates) {
		const normalized = path.replace(/^@/, "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
		if (seen.has(normalized) || !isLikelyImpactTarget(normalized) || !pathExists(cwd, normalized)) continue;
		seen.add(normalized);
		selected.push(normalized);
		if (selected.length >= limit) break;
	}
	return selected;
}

export function selectPlanImpactPath(
	cwd: string,
	latestRequest: string | undefined,
	currentPlanPath: string | undefined,
	touchedPaths: readonly string[],
	pathExists: (cwd: string, path: string) => boolean,
): string | undefined {
	return selectPlanImpactPaths(cwd, latestRequest, currentPlanPath, undefined, touchedPaths, pathExists, 1)[0];
}

export function hasExplicitBracketReferences(text: string | undefined): boolean {
	return /\[\[[^\]\n]+\]\]/.test(text ?? "");
}

export function hasLikelyFuzzyReferences(text: string | undefined): boolean {
	const value = text ?? "";
	if (hasExplicitBracketReferences(value)) return true;
	if (/(?:^|\s)(?:[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+(?:#[A-Za-z0-9 _-]+)?|[A-Z0-9]{3,})(?=$|\s|[.,:;!?])/.test(value)) return true;
	if (/(?:^|\s)(?:\.?\/?(?:docs|packages|src|test|spec|arch|plan|archive)\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?:\.md)?(?:#[A-Za-z0-9 _-]+)?(?=$|\s|[.,:;!?])/.test(value)) return true;
	if (/[`"'][^`"'\n]{4,80}[`"']/.test(value)) return true;
	return false;
}

