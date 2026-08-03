import type { ProjectMemorySnapshot } from "./snapshot.ts";
import { DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE } from "./snapshot.ts";

export { DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE };
export type LoadPromptMode = "full" | "compact";
export interface LoadPromptOptions { mode?: LoadPromptMode }
export interface QueryResultItem { path: string; heading?: string; score?: number; text?: string }
export interface QueryRunResult { ok: boolean; command?: string; error?: string; data?: { results?: QueryResultItem[] } }

interface TreeNode { directories: Map<string, TreeNode>; files: string[] }

function treeNode(): TreeNode {
	return { directories: new Map(), files: [] };
}

function documentationPaths(snapshot: ProjectMemorySnapshot): string[] {
	return [...new Set([
		...snapshot.present.filter((path) => path.startsWith("docs/") && path.toLowerCase().endsWith(".md") && !(snapshot.exclude ?? DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE).some((excluded) => path === excluded || path.startsWith(`${excluded}/`))),
		...snapshot.directories.flatMap((directory) => directory.markdownFiles),
	])].sort();
}

function buildTree(paths: string[]): TreeNode {
	const root = treeNode();
	for (const path of paths) {
		const parts = path.split("/");
		let node = root;
		for (const part of parts.slice(0, -1)) {
			if (!node.directories.has(part)) node.directories.set(part, treeNode());
			node = node.directories.get(part)!;
		}
		node.files.push(parts.at(-1)!);
	}
	return root;
}

function descendantCounts(node: TreeNode): { directories: number; files: number } {
	let directories = 0;
	let files = node.files.length;
	for (const child of node.directories.values()) {
		directories += 1;
		const nested = descendantCounts(child);
		directories += nested.directories;
		files += nested.files;
	}
	return { directories, files };
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatDocumentationTree(snapshot: ProjectMemorySnapshot, maxDepth: number): string {
	const tree = buildTree(documentationPaths(snapshot));
	const docs = tree.directories.get("docs");
	if (!docs) return "- docs/: missing";
	const lines = ["docs/"];
	const render = (node: TreeNode, depth: number, indent: string): void => {
		for (const file of node.files.sort()) lines.push(`${indent}- ${file}`);
		if (depth >= maxDepth && node.directories.size > 0) {
			for (const [name, child] of [...node.directories.entries()].sort(([left], [right]) => left.localeCompare(right))) {
				const counts = descendantCounts(child);
				lines.push(`${indent}- ${name}/`);
				lines.push(`${indent}  - … ${plural(counts.directories, "directory", "directories")}, ${plural(counts.files, "Markdown file")}`);
			}
			return;
		}
		for (const [name, child] of [...node.directories.entries()].sort(([left], [right]) => left.localeCompare(right))) {
			lines.push(`${indent}- ${name}/`);
			render(child, depth + 1, `${indent}  `);
		}
	};
	render(docs, 1, "  ");
	return lines.join("\n");
}

export function documentationSummaryDirectories(snapshot: ProjectMemorySnapshot): ProjectMemorySnapshot["directories"] {
	return snapshot.directories;
}

export function extractDocsPathMentions(text: string): string[] {
	return [...new Set((text.match(/docs\/[A-Za-z0-9_\-./]+/g) ?? []).map((value) => value.replace(/[.,;:!?]+$/, "")))];
}

function formatQueryResults(result: QueryRunResult | undefined): string {
	if (!result) return "Query results:\n- unavailable; continue with the documentation map and targeted README reads";
	if (!result.ok) return `Query results:\n- unavailable: ${result.error ?? "unknown error"}`;
	const items = result.data?.results?.slice(0, 30) ?? [];
	if (items.length === 0) return "Query results:\n- no matching documentation chunks";
	return `Query results:\n${items.map((item, index) => {
		const score = typeof item.score === "number" ? ` (${item.score.toFixed(3)})` : "";
		const excerpt = item.text?.replace(/\s+/g, " ").trim().slice(0, 180);
		return `${index + 1}. ${item.path}${item.heading ? ` — ${item.heading}` : ""}${score}${excerpt ? `\n   ${excerpt}${(item.text?.length ?? 0) > 180 ? "…" : ""}` : ""}`;
	}).join("\n")}`;
}

export function buildLoadPrompt(
	cwd: string,
	args: string,
	snapshot: ProjectMemorySnapshot,
	queryResult?: QueryRunResult,
	options: LoadPromptOptions = {},
): string {
	const full = options.mode !== "compact";
	const focus = args.trim();
	const depth = focus ? 3 : 5;
	const present = snapshot.present.length > 0 ? snapshot.present.map((file) => `- ${file}`).join("\n") : "- none";
	const missing = snapshot.missing.length > 0 ? snapshot.missing.map((file) => `- ${file}`).join("\n") : "- none";
	const query = focus ? `\n${formatQueryResults(queryResult)}\n` : "";
	const responseShape = full
		? "- Project narrative and purpose\n- Key working rules\n- Relevant documentation and verification routes\n- Relevant active plans or archive history only when needed"
		: "- Compact project-memory status\n- Relevant documentation routes\n- Relevant active plan hints only when needed\n- Short bounded next reads";
	return `Load the dotdotgod project memory in ${full ? "full" : "compact"} mode.
Current working directory: ${cwd}
Help: dotdotgod --help
${focus ? `User query: ${focus}\n` : ""}${query}
Detected baseline memory:
${present}

Missing baseline files:
${missing}

Documentation map (directory depth ${depth}):
${formatDocumentationTree(snapshot, depth)}

Excluded local memory:
${(snapshot.exclude ?? DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE).length > 0 ? (snapshot.exclude ?? DEFAULT_DOCUMENTATION_SUMMARY_EXCLUDE).map((path) => `- ${path}/**`).join("\n") : "- none"}

Instructions:
1. Preserve existing user changes and do not modify project files.
2. Use the documentation tree as the shared project table of contents.
3. Read AGENTS.md, the current agent entrypoint, README.md, and docs/README.md only when their content is not already clear.
4. Read document bodies selectively from the query results, README routing, and current request.
5. Inspect docs/plan or docs/archive only when current work or necessary history makes local memory directly relevant.
6. Report narrative project context rather than cache, graph, or index statistics.

Response format:
${responseShape}`;
}
