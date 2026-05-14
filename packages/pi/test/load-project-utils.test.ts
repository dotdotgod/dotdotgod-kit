import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildLoadPrompt, collectSnapshot, estimateTextMetrics, hasOtherLoadCommand, listMarkdownFiles } from "../extensions/load-project/utils.ts";

function fixture(): string {
	return mkdtempSync(join(tmpdir(), "dotdotgod-load-test-"));
}

function write(root: string, path: string, content = "# Test\n"): void {
	const fullPath = join(root, path);
	mkdirSync(join(fullPath, ".."), { recursive: true });
	writeFileSync(fullPath, content);
}

describe("load-project snapshot", () => {
	it("collects present and missing memory files", () => {
		const root = fixture();
		write(root, "AGENTS.md");
		write(root, "docs/README.md");
		write(root, "docs/spec/README.md");

		const snapshot = collectSnapshot(root);
		assert.ok(snapshot.present.includes("AGENTS.md"));
		assert.ok(snapshot.present.includes("docs/README.md"));
		assert.ok(snapshot.missing.includes("CLAUDE.md"));
		assert.equal(snapshot.directories.find((dir) => dir.path === "docs/spec")?.exists, true);
		assert.equal(snapshot.directories.some((dir) => dir.path === "docs/archive"), false);
	});

	it("lists markdown files recursively with a limit", () => {
		const root = fixture();
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/domain/DETAILS.md");
		write(root, "docs/spec/domain/ignore.txt", "ignore");

		assert.deepEqual(listMarkdownFiles(root, "docs/spec", 1), ["docs/spec/README.md"]);
		assert.deepEqual(listMarkdownFiles(root, "docs/spec"), ["docs/spec/README.md", "docs/spec/domain/DETAILS.md"]);
	});
});

describe("load-project prompt", () => {
	it("includes args, summaries, and read-only instructions", () => {
		const prompt = buildLoadPrompt("/project", "focus auth", {
			present: ["AGENTS.md"],
			missing: ["CLAUDE.md"],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"] }],
		});

		assert.match(prompt, /User arguments: focus auth/);
		assert.match(prompt, /- AGENTS\.md/);
		assert.match(prompt, /- CLAUDE\.md/);
		assert.match(prompt, /docs\/spec\/README\.md/);
		assert.match(prompt, /do not scan it as part of the documentation directory summary/i);
		assert.match(prompt, /Do not modify files/);
	});
});

describe("load-project measurement helpers", () => {
	it("estimates text metrics", () => {
		assert.deepEqual(estimateTextMetrics("one two three"), { characters: 13, words: 3, approxTokens: 4 });
		assert.deepEqual(estimateTextMetrics(""), { characters: 0, words: 0, approxTokens: 0 });
	});
});

describe("load command conflict detection", () => {
	it("ignores this extension's load command", () => {
		assert.equal(hasOtherLoadCommand([{ name: "load", sourceInfo: { path: "/pkg/extensions/load-project/index.ts" } }]), false);
	});

	it("detects another load command", () => {
		assert.equal(hasOtherLoadCommand([{ name: "load:1", sourceInfo: { path: "/other/extension.ts" } }]), true);
	});
});
