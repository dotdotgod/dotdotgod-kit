import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { buildDotdotgodCliCandidates } from "../extensions/shared/dotdotgod-cli.ts";
import { buildLoadPrompt, collectSnapshot, estimateTextMetrics, extractDocsPathMentions, formatLoadSnapshotSummary, hasOtherLoadCommand, listMarkdownFiles, listReadmeFiles } from "../extensions/load-project/utils.ts";

function fixture(): string {
	return mkdtempSync(join(tmpdir(), "dotdotgod-load-test-"));
}

function write(root: string, path: string, content = "# Test\n"): void {
	const fullPath = join(root, path);
	mkdirSync(join(fullPath, ".."), { recursive: true });
	writeFileSync(fullPath, content);
}

const RICH_SNAPSHOT_DATA = {
	cache: { ok: true, status: "fresh", indexedFiles: 3, staleFiles: 0, schemaOk: true, archiveBodiesIncluded: false },
	metadata: { cacheRefreshed: true, previousStatus: "stale", changedFiles: 1, fullRebuild: false, indexSizeBytes: 2048 },
	graph: { nodes: 10, edges: 8, byType: { file: 4, heading: 6 } },
	memoryPolicy: { sharedAreas: ["rules", "specs"], localAreas: ["plans"], freshAreas: ["rules"], staleAreas: ["archive"] },
	memoryAreas: { method: "config", total: 1, areas: [{ label: "Specs", role: "behavior-truth", files: ["docs/spec/README.md"] }] },
	communities: {
		method: "leiden",
		fallback: false,
		total: 1,
		omitted: 0,
		communities: [{
			label: "Pi Load",
			files: ["packages/pi/extensions/load-project/index.ts"],
			docs: ["docs/spec/LOAD_PROJECT.md"],
			commands: ["dd:load"],
			events: ["load-project:before-send"],
			tests: ["packages/pi/test/load-project-utils.test.ts"],
		}],
	},
	pinnedFiles: {
		paths: [
			{ path: "docs/arch/CODE_CONVENTIONS.md", status: "present", pinnedBy: ["pinnedBodies", "pinnedPaths"] },
			{ path: "docs/arch/MISSING_CONVENTIONS.md", status: "missing", pinnedBy: ["pinnedPaths"] },
		],
		omittedPaths: 0,
		bodies: [
			{ path: "docs/arch/CODE_CONVENTIONS.md", status: "present", truncated: false, chars: 24, content: "# Conventions\nUse tabs.\n" },
			{ path: "docs/arch/generated.png", status: "skipped", reason: "binary" },
		],
		omittedBodies: 1,
	},
	bounds: { fullGraphIncluded: false, archiveBodiesIncluded: false, archiveMapIncluded: true },
	commandGuidance: { source: "local-source", packageManager: "pnpm", install: null, validate: "node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory", loadSnapshot: "node packages/cli/bin/dotdotgod.mjs load-snapshot . --json", index: "node packages/cli/bin/dotdotgod.mjs index . --json", status: "node packages/cli/bin/dotdotgod.mjs status . --json", verify: "pnpm run verify" },
};

describe("dotdotgod CLI resolution", () => {
	it("prefers source checkout CLI, then bundled CLI, then global fallback", () => {
		const root = fixture();
		const packageRoot = fixture();
		write(root, "packages/cli/bin/dotdotgod.mjs", "#!/usr/bin/env node\n");
		write(packageRoot, "node_modules/@dotdotgod/cli/bin/dotdotgod.mjs", "#!/usr/bin/env node\n");

		const candidates = buildDotdotgodCliCandidates(root, ["status", ".", "--json"], { packageRoot });
		assert.equal(candidates[0]?.label, "local workspace CLI");
		assert.equal(candidates[1]?.label, "bundled @dotdotgod/cli");
		assert.equal(candidates[2]?.label, "dotdotgod");
	});

	it("uses bundled CLI before global fallback outside a source checkout", () => {
		const root = fixture();
		const packageRoot = fixture();
		write(packageRoot, "node_modules/@dotdotgod/cli/bin/dotdotgod.mjs", "#!/usr/bin/env node\n");

		const candidates = buildDotdotgodCliCandidates(root, ["load-snapshot", root, "--json"], { packageRoot });
		assert.equal(candidates[0]?.label, "bundled @dotdotgod/cli");
		assert.equal(candidates[1]?.label, "dotdotgod");
	});
});

describe("load-project snapshot", () => {
	it("collects present and missing memory files with README indexes", () => {
		const root = fixture();
		write(root, "AGENTS.md");
		write(root, "docs/README.md");
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/domain/README.md");
		write(root, "docs/spec/domain/DETAILS.md");

		const snapshot = collectSnapshot(root);
		assert.ok(snapshot.present.includes("AGENTS.md"));
		assert.ok(snapshot.present.includes("docs/README.md"));
		assert.ok(snapshot.missing.includes("CLAUDE.md"));
		const spec = snapshot.directories.find((dir) => dir.path === "docs/spec");
		assert.equal(spec?.exists, true);
		assert.deepEqual(spec?.readmeFiles, ["docs/spec/README.md", "docs/spec/domain/README.md"]);
		assert.equal(snapshot.directories.some((dir) => dir.path === "docs/archive"), false);
		write(root, "docs/concept/README.md");
		assert.equal(collectSnapshot(root).directories.some((dir) => dir.path === "docs/concept"), true);
	});

	it("lists markdown files recursively with a limit", () => {
		const root = fixture();
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/domain/DETAILS.md");
		write(root, "docs/spec/domain/ignore.txt", "ignore");

		assert.deepEqual(listMarkdownFiles(root, "docs/spec", 1), ["docs/spec/README.md"]);
		assert.deepEqual(listMarkdownFiles(root, "docs/spec"), ["docs/spec/README.md", "docs/spec/domain/DETAILS.md"]);
	});

	it("lists only README files for the docs table of contents", () => {
		const root = fixture();
		write(root, "docs/spec/README.md");
		write(root, "docs/spec/DETAILS.md");
		write(root, "docs/spec/domain/README.md");

		assert.deepEqual(listReadmeFiles(root, "docs/spec"), ["docs/spec/README.md", "docs/spec/domain/README.md"]);
	});
});

describe("load-project prompt", () => {
	it("keeps full mode for free-form arguments including compact keywords", () => {
		const prompt = buildLoadPrompt("/project", "compact focus auth", {
			present: ["AGENTS.md"],
			missing: ["CLAUDE.md"],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] }],
		});

		assert.match(prompt, /full mode/);
		assert.match(prompt, /User arguments: compact focus auth/);
		assert.match(prompt, /Project summary/);
		assert.doesNotMatch(prompt, /Compact project-memory status/);
	});

	it("selects compact mode only through the explicit mode option", () => {
		const prompt = buildLoadPrompt("/project", "focus auth", {
			present: ["AGENTS.md"],
			missing: ["CLAUDE.md"],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] }],
		}, undefined, { mode: "compact" });

		assert.match(prompt, /compact mode/);
		assert.match(prompt, /User arguments: focus auth/);
		assert.match(prompt, /- AGENTS\.md/);
		assert.match(prompt, /- CLAUDE\.md/);
		assert.match(prompt, /docs\/spec\/README\.md/);
		assert.match(prompt, /Compact project-memory status/);
		assert.match(prompt, /do not scan it as part of the documentation directory summary/i);
		assert.match(prompt, /Do not modify files/);
	});

	it("keeps trust, routing, and archive signals in compact snapshot summaries", () => {
		const prompt = buildLoadPrompt("/project", "", {
			present: ["docs/archive/README.md"],
			missing: [],
			directories: [
				{ path: "docs/archive", exists: true, markdownFiles: ["docs/archive/README.md", "docs/archive/plan/old-task/README.md"], readmeFiles: ["docs/archive/README.md"] },
			],
		}, {
			ok: true,
			command: "local workspace CLI",
			data: RICH_SNAPSHOT_DATA,
		}, { mode: "compact" });

		assert.match(prompt, /Load snapshot:/);
		assert.match(prompt, /schemaOk=true/);
		assert.match(prompt, /cacheRefreshed=true/);
		assert.match(prompt, /fullRebuild=false/);
		assert.match(prompt, /fullGraphIncluded=false/);
		assert.match(prompt, /archiveBodiesIncluded=false/);
		assert.match(prompt, /archiveMapIncluded=true/);
		assert.match(prompt, /Memory policy: shared=rules, specs; local=plans; fresh=rules; stale=archive/);
		assert.match(prompt, /Pinned files: docs\/arch\/CODE_CONVENTIONS\.md, docs\/arch\/MISSING_CONVENTIONS\.md \(missing\)/);
		assert.doesNotMatch(prompt, /Pinned file contents/);
		assert.doesNotMatch(prompt, /Use tabs\./);
		assert.match(prompt, /Communities: total=1, omitted=0, top=Pi Load/);
		assert.match(prompt, /files=packages\/pi\/extensions\/load-project\/index\.ts/);
		assert.match(prompt, /docs=docs\/spec\/LOAD_PROJECT\.md/);
		assert.match(prompt, /commands=dd:load/);
		assert.match(prompt, /tests=packages\/pi\/test\/load-project-utils\.test\.ts/);
		assert.doesNotMatch(prompt, /events=load-project:before-send/);
		assert.doesNotMatch(prompt, /source=local-source/);
		assert.doesNotMatch(prompt, /node packages\/cli\/bin\/dotdotgod\.mjs validate \. --include-local-memory/);
		assert.doesNotMatch(prompt, /Verify: pnpm run verify/);
		assert.doesNotMatch(prompt, /topTypes=/);
		assert.match(prompt, /Use the Load snapshot section first/);
		assert.match(prompt, /Do not re-scan every listed file/);
		assert.doesNotMatch(prompt, /docs\/archive: README table of contents/);
		assert.doesNotMatch(prompt, /docs\/archive\/plan\/old-task\/README\.md/);
	});

	it("uses full mode by default and includes verbose load-snapshot details", () => {
		const prompt = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] }],
		}, {
			ok: true,
			command: "local workspace CLI",
			data: RICH_SNAPSHOT_DATA,
		});

		assert.match(prompt, /full mode/);
		assert.match(prompt, /source=local-source/);
		assert.match(prompt, /commands=dd:load/);
		assert.match(prompt, /events=load-project:before-send/);
		assert.match(prompt, /topTypes=heading:6, file:4/);
		assert.match(prompt, /role=behavior-truth/);
		assert.match(prompt, /Pinned files: docs\/arch\/CODE_CONVENTIONS\.md, docs\/arch\/MISSING_CONVENTIONS\.md \(missing\)/);
		assert.match(prompt, /Pinned file contents: 2 shown, 1 omitted/);
		assert.match(prompt, /--- docs\/arch\/CODE_CONVENTIONS\.md \(24 chars\) ---/);
		assert.match(prompt, /Use tabs\./);
		assert.match(prompt, /--- docs\/arch\/generated\.png \(skipped: binary\) ---/);
		assert.match(prompt, /--- end pinned file contents ---/);
		assert.match(prompt, /Project summary/);
	});

	it("shows a README table of contents instead of full file listings", () => {
		const prompt = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{
				path: "docs/spec",
				exists: true,
				markdownFiles: ["docs/spec/README.md", "docs/spec/A.md", "docs/spec/B.md", "docs/spec/domain/README.md", "docs/spec/domain/DETAILS.md"],
				readmeFiles: ["docs/spec/README.md", "docs/spec/domain/README.md"],
			}],
		}, undefined, { mode: "compact" });

		assert.match(prompt, /docs\/spec: README table of contents/);
		assert.match(prompt, /- docs\/spec\/README\.md/);
		assert.match(prompt, /- docs\/spec\/domain\/README\.md/);
		assert.doesNotMatch(prompt, /docs\/spec\/A\.md/);
		assert.doesNotMatch(prompt, /docs\/spec\/domain\/DETAILS\.md/);
		assert.match(prompt, /book-like table of contents/);
	});

	it("narrows compact plan README output without omitted-index lines when configured for inclusion", () => {
		const prompt = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{
				path: "docs/plan",
				exists: true,
				markdownFiles: ["docs/plan/README.md", "docs/plan/a/README.md", "docs/plan/b/README.md"],
				readmeFiles: ["docs/plan/README.md", "docs/plan/a/README.md", "docs/plan/b/README.md"],
			}],
		}, { ok: true, data: { memoryConfig: { load: { documentationSummary: { exclude: [] } } } } }, { mode: "compact" });

		assert.match(prompt, /docs\/plan: README table of contents/);
		assert.match(prompt, /- docs\/plan\/README\.md/);
		assert.doesNotMatch(prompt, /docs\/plan\/a\/README\.md/);
		assert.doesNotMatch(prompt, /docs\/plan\/b\/README\.md/);
		assert.doesNotMatch(prompt, /more README indexes omitted/);
	});

	it("excludes plan and archive summaries by default and can include them independently from local memory", () => {
		const snapshot = {
			present: ["docs/plan/README.md", "docs/archive/README.md"],
			missing: [],
			directories: [
				{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/README.md"], readmeFiles: ["docs/spec/README.md"] },
				{ path: "docs/plan", exists: true, markdownFiles: ["docs/plan/README.md"], readmeFiles: ["docs/plan/README.md"] },
				{ path: "docs/archive", exists: true, markdownFiles: ["docs/archive/README.md"], readmeFiles: ["docs/archive/README.md"] },
			],
		};
		const defaultPrompt = buildLoadPrompt("/project", "", snapshot);
		assert.match(defaultPrompt, /docs\/spec: README table of contents/);
		assert.doesNotMatch(defaultPrompt, /docs\/plan: README table of contents/);
		assert.doesNotMatch(defaultPrompt, /docs\/archive: README table of contents/);

		const configuredPrompt = buildLoadPrompt("/project", "", snapshot, {
			ok: true,
			data: { memoryConfig: { load: { documentationSummary: { exclude: [] } } } },
		});
		assert.match(configuredPrompt, /docs\/plan: README table of contents/);
		assert.match(configuredPrompt, /docs\/archive: README table of contents/);
	});

	it("expands a targeted docs subtree when the request identifies it", () => {
		const prompt = buildLoadPrompt("/project", "review docs/spec/domain behavior", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{
				path: "docs/spec",
				exists: true,
				markdownFiles: ["docs/spec/README.md", "docs/spec/A.md", "docs/spec/domain/README.md", "docs/spec/domain/DETAILS.md"],
				readmeFiles: ["docs/spec/README.md", "docs/spec/domain/README.md"],
			}],
		}, undefined, { mode: "compact" });

		assert.deepEqual(extractDocsPathMentions("review docs/spec/domain behavior."), ["docs/spec/domain"]);
		assert.match(prompt, /docs\/spec: targeted subtree listing for docs\/spec\/domain/);
		assert.match(prompt, /- docs\/spec\/domain\/DETAILS\.md/);
		assert.doesNotMatch(prompt, /- docs\/spec\/A\.md/);
	});

	it("bounds fallback directory listings without README indexes or a CLI snapshot", () => {
		const prompt = buildLoadPrompt("/project", "", {
			present: ["AGENTS.md"],
			missing: [],
			directories: [{ path: "docs/spec", exists: true, markdownFiles: ["docs/spec/A.md", "docs/spec/B.md", "docs/spec/C.md", "docs/spec/D.md", "docs/spec/E.md", "docs/spec/F.md"], readmeFiles: [] }],
		}, undefined, { mode: "compact" });

		assert.match(prompt, /bounded fallback listing/);
		assert.match(prompt, /1 more discovered files omitted/);
		assert.doesNotMatch(prompt, /docs\/spec\/F\.md/);
	});

	it("formats load-snapshot fallback failures", () => {
		const summary = formatLoadSnapshotSummary({ ok: false, error: "missing binary" });
		assert.match(summary, /unavailable/);
		assert.match(summary, /bounded fallback snapshot/);
		assert.match(summary, /missing binary/);
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
