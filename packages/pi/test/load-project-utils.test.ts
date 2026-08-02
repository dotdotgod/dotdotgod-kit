import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDotdotgodCliCandidates } from "../extensions/shared/dotdotgod-cli.ts";
import { buildLoadPrompt, collectSnapshot, estimateTextMetrics, extractDocsPathMentions, formatDocumentationTree, hasOtherLoadCommand, listMarkdownFiles, listReadmeFiles } from "../extensions/load-project/utils.ts";

function fixture(): string {
	return mkdtempSync(join(tmpdir(), "dotdotgod-load-test-"));
}

function write(root: string, path: string, content = "# Test\n"): void {
	const fullPath = join(root, path);
	mkdirSync(join(fullPath, ".."), { recursive: true });
	writeFileSync(fullPath, content);
}

describe("dotdotgod CLI resolution", () => {
	it("prefers source checkout CLI, then bundled CLI, then global fallback", () => {
		const root = fixture();
		const packageRoot = fixture();
		write(root, "packages/cli/bin/dotdotgod.mjs", "#!/usr/bin/env node\n");
		write(packageRoot, "node_modules/@dotdotgod/cli/bin/dotdotgod.mjs", "#!/usr/bin/env node\n");
		const candidates = buildDotdotgodCliCandidates(root, ["query", root, "focus", "--json"], { packageRoot });
		assert.deepEqual(candidates.map((candidate) => candidate.label), ["local workspace CLI", "bundled @dotdotgod/cli", "dotdotgod"]);
	});
});

describe("load-project discovery", () => {
	it("collects all shared Markdown and excludes local memory by default", () => {
		const root = fixture();
		write(root, "AGENTS.md");
		write(root, "docs/README.md");
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/domain/DETAILS.md");
		write(root, "docs/plan/task/README.md");
		write(root, "docs/archive/README.md");
		const snapshot = collectSnapshot(root);
		assert.ok(snapshot.present.includes("AGENTS.md"));
		assert.deepEqual(snapshot.exclude, ["docs/plan", "docs/archive"]);
		assert.deepEqual(snapshot.directories.map((directory) => directory.path), ["docs/spec"]);
		assert.deepEqual(snapshot.directories[0]?.markdownFiles, ["docs/spec/README.md", "docs/spec/domain/DETAILS.md"]);
	});

	it("honors configured documentation exclusions", () => {
		const root = fixture();
		write(root, "dotdotgod.config.json", JSON.stringify({ load: { documentationSummary: { exclude: ["docs/private"] } } }));
		write(root, "docs/spec/README.md");
		write(root, "docs/private/SECRET.md");
		const snapshot = collectSnapshot(root);
		assert.deepEqual(snapshot.directories.map((directory) => directory.path), ["docs/spec"]);
	});

	it("keeps optional list limits only for compatibility helpers", () => {
		const root = fixture();
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/domain/DETAILS.md");
		assert.deepEqual(listMarkdownFiles(root, "docs/spec", 1), ["docs/spec/README.md"]);
		assert.deepEqual(listReadmeFiles(root, "docs/spec"), ["docs/spec/README.md"]);
	});
});

describe("documentation tree", () => {
	const snapshot = {
		present: ["AGENTS.md"],
		missing: [],
		exclude: ["docs/plan", "docs/archive"],
		directories: [{
			path: "docs/spec",
			exists: true,
			markdownFiles: [
				"docs/README.md",
				"docs/spec/README.md",
				"docs/spec/plan-mode/README.md",
				"docs/spec/plan-mode/runtime/README.md",
				"docs/spec/plan-mode/runtime/api/README.md",
				"docs/spec/plan-mode/runtime/api/SECOND.md",
				"docs/spec/plan-mode/runtime/api/alpha/DETAIL.md",
				"docs/spec/plan-mode/runtime/api/zeta/nested/DETAIL.md",
			],
			readmeFiles: [],
		}],
	};

	it("shows every boundary file and names each summarized child directory", () => {
		const tree = formatDocumentationTree(snapshot, 5);
		assert.match(tree, /api\//);
		assert.match(tree, /README\.md/);
		assert.match(tree, /SECOND\.md/);
		assert.match(tree, /alpha\/\n\s+- … 0 directories, 1 Markdown file/);
		assert.match(tree, /zeta\/\n\s+- … 1 directory, 1 Markdown file/);
		assert.ok(tree.indexOf("alpha/") < tree.indexOf("zeta/"));
		assert.doesNotMatch(tree, /DETAIL\.md/);
	});

	it("uses depth three with query arguments and includes at most query results", () => {
		const prompt = buildLoadPrompt("/project", "Plan Mode tools", snapshot, {
			ok: true,
			data: { results: Array.from({ length: 35 }, (_, index) => ({ path: `docs/spec/${index}.md`, heading: "Tools", score: 0.9, text: "Policy" })) },
		}, { mode: "compact" });
		assert.match(prompt, /Documentation map \(directory depth 3\)/);
		assert.match(prompt, /30\. docs\/spec\/29\.md/);
		assert.doesNotMatch(prompt, /31\. docs\/spec\/30\.md/);
		assert.match(prompt, /User query: Plan Mode tools/);
		assert.match(prompt, /^Help: dotdotgod --help$/m);
		assert.doesNotMatch(prompt, /CLI status:/);
	});

	it("uses depth five without arguments and does not run a query", () => {
		const prompt = buildLoadPrompt("/project", "", snapshot, undefined, { mode: "full" });
		assert.match(prompt, /Documentation map \(directory depth 5\)/);
		assert.doesNotMatch(prompt, /Query results:/);
		assert.match(prompt, /Project narrative and purpose/);
		assert.match(prompt, /^Help: dotdotgod --help$/m);
		assert.doesNotMatch(prompt, /CLI status:/);
	});
});

describe("load-project helpers", () => {
	it("extracts docs paths and estimates text metrics", () => {
		assert.deepEqual(extractDocsPathMentions("review docs/spec/domain behavior."), ["docs/spec/domain"]);
		assert.deepEqual(estimateTextMetrics("one two"), { characters: 7, words: 2, approxTokens: 2 });
	});

	it("detects conflicting load commands", () => {
		assert.equal(hasOtherLoadCommand([{ name: "load", sourceInfo: { path: "/other/load.ts" } }]), true);
		assert.equal(hasOtherLoadCommand([{ name: "load", sourceInfo: { path: "/extensions/load-project/index.ts" } }]), false);
	});
});
