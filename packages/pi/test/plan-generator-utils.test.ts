import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createReadmeScaffold, discoverPlanMarkdownFiles, normalizePlanTaskPath, proposeSlugFromRequest, resolveCollisionFreeTaskPath } from "../extensions/plan-generator/plan-files.ts";
import { PLAN_GENERATOR_STAGES, createStageTemplate, ensureCurrentStageFile, ensureStageFile, getStageFileName, parseStageState, setRepairAttempts, updateStageStatus } from "../extensions/plan-generator/stage-state.ts";
import { parseLlmReviewJson } from "../extensions/plan-generator/review.ts";
import { buildStageReviewPrompt } from "../extensions/plan-generator/prompts.ts";
import { stableBlockerSetKey, toKebabCase } from "../extensions/plan-generator/utils.ts";

describe("plan-generator command helpers", () => {
	it("normalizes explicit task and README paths", () => {
		const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
		assert.deepEqual(normalizePlanTaskPath(cwd, "docs/plan/example-task")?.taskSlug, "example-task");
		assert.deepEqual(normalizePlanTaskPath(cwd, "docs/plan/example-task/README.md")?.taskSlug, "example-task");
		assert.equal(normalizePlanTaskPath(cwd, "packages/pi/index.ts"), undefined);
	});

	it("creates stable kebab slugs and README scaffolds", () => {
		assert.equal(toKebabCase("Add Plan Generator!"), "add-plan-generator");
		assert.equal(proposeSlugFromRequest("Add Plan Generator extension with durable state"), "add-plan-generator-extension-with-durable-state");
		assert.equal(
			proposeSlugFromRequest("플랜 제네레이터가 처음 플랜 설명을 받아서 파일이름을 생성하게하자"),
			"plan-generator-initial-plan-description-file-name-create",
		);
		assert.equal(proposeSlugFromRequest("!!!"), "new-plan");
		const scaffold = createReadmeScaffold("Task Title", "Initial request");
		assert.match(scaffold, /^# Task Title/m);
		assert.match(scaffold, /^Status: active/m);
		assert.match(scaffold, /^## Plan:/m);
	});

	it("creates collision-free task paths for new free-text requests", () => {
		const cwd = mkdtempSync(join(tmpdir(), "plan-generator-"));
		mkdirSync(join(cwd, "docs", "plan", "add-plan-generator"), { recursive: true });
		const task = resolveCollisionFreeTaskPath(cwd, "Add Plan Generator");
		assert.equal(task.taskSlug, "add-plan-generator-2");
		assert.equal(task.readmePath, join(cwd, "docs", "plan", "add-plan-generator-2", "README.md"));
	});
});

describe("plan-generator stage state", () => {
	it("uses documented UPPER_SNAKE stage filenames", () => {
		assert.equal(PLAN_GENERATOR_STAGES.length, 9);
		assert.equal(getStageFileName("01-intake"), "01_INTAKE.md");
		assert.equal(getStageFileName("09-subagent-workstreams"), "09_SUBAGENT_WORKSTREAMS.md");
	});

	it("parses templates and records repair attempts/status changes", () => {
		const state = parseStageState(createStageTemplate("03-discovery", "created", new Date("2026-05-25T00:00:00.000Z")));
		assert.equal(state.stage, "03-discovery");
		assert.equal(state.status, "created");
		assert.equal(state.repairAttempts, 0);
		assert.equal(state.stageLoops, 0);
		assert.equal(state.blockerSetKey, "none");
		assert.match(state.markdown, /^- Stage Loops: 0$/m);
		assert.match(state.markdown, /^- Blocker Set Key: none$/m);
		const blocked = updateStageStatus(setRepairAttempts(state, 5), "blocked", "needs repair", new Date("2026-05-25T00:01:00.000Z"));
		assert.equal(blocked.status, "blocked");
		assert.equal(blocked.repairAttempts, 5);
		assert.match(blocked.markdown, /Status: blocked/);
		assert.match(blocked.markdown, /- 2026-05-25T00:01:00.000Z: blocked — needs repair/);
	});

	it("creates only the current stage file", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-generator-"));
		const taskDir = join(root, "docs", "plan", "task");
		mkdirSync(taskDir, { recursive: true });
		const stage = ensureCurrentStageFile(taskDir, new Date("2026-05-25T00:00:00.000Z"));
		assert.equal(stage?.stage, "01-intake");
		assert.equal(ensureStageFile(taskDir, "01-intake").stage, "01-intake");
	});
});

describe("plan-generator plan discovery", () => {
	it("includes normal markdown and excludes .dotdotgod-plan recursively and symlinks", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-generator-"));
		const taskDir = join(root, "docs", "plan", "task");
		mkdirSync(join(taskDir, ".dotdotgod-plan", "nested"), { recursive: true });
		mkdirSync(join(taskDir, "support"), { recursive: true });
		writeFileSync(join(taskDir, "README.md"), "# Task\n");
		writeFileSync(join(taskDir, "SUPPORT.md"), "# Support\n");
		writeFileSync(join(taskDir, "support", "DETAILS.md"), "# Details\n");
		writeFileSync(join(taskDir, ".dotdotgod-plan", "01_INTAKE.md"), "# State\n");
		symlinkSync(join(taskDir, "SUPPORT.md"), join(taskDir, "LINK.md"));
		const files = discoverPlanMarkdownFiles(taskDir).map((file) => file.slice(taskDir.length + 1));
		assert.deepEqual(files.sort(), ["README.md", "SUPPORT.md", "support/DETAILS.md"].sort());
	});
});

describe("plan-generator stage 09 review prompt", () => {
	it("spells out executable handoff quality pass/fail rules", () => {
		const root = mkdtempSync(join(tmpdir(), "plan-generator-"));
		const taskDir = join(root, "docs", "plan", "task");
		mkdirSync(taskDir, { recursive: true });
		const readme = join(taskDir, "README.md");
		writeFileSync(readme, "# Task\n\n## Subagent Workstreams\n\n- IMPLEMENTATION_AGENT_HANDOFF.md\n");
		const state = parseStageState(createStageTemplate("09-subagent-workstreams"));
		const prompt = buildStageReviewPrompt(taskDir, state, [readme], "{\"ok\":true}");
		assert.match(prompt, /README Subagent Workstreams must index every \*_AGENT_HANDOFF\.md file/);
		assert.match(prompt, /Minimum handoff set is coordinator plus implementation, validation\/contract, and docs\/verification/);
		assert.match(prompt, /Mission, Read First, Target Area, Required Behavior, Do Not, Verification, and numbered Plan:/);
		assert.match(prompt, /Fail Stage 09 if target files are omitted or vague/);
		assert.match(prompt, /verification is only generic run tests/);
		assert.match(prompt, /do-not rules are missing/);
		assert.match(prompt, /make it work/);
		assert.match(prompt, /Plan: is bullet-only/);
		assert.match(prompt, /depends on chat history/);
		assert.match(prompt, /phase order, assignment order, merge\/review points, final verification, and archive criteria/);
		assert.match(prompt, /Pass valid handoffs when they provide concrete target files/);
	});
});

describe("plan-generator LLM review parsing", () => {
	it("accepts exactly one dotdotgod stage JSON block", () => {
		const parsed = parseLlmReviewJson('```json dotdotgod-plan-stage\n{"ok":true,"blockers":[],"questions":[],"feedback":[],"requiredPlanUpdates":[]}\n```');
		assert.equal(parsed.ok, true);
	});

	it("rejects malformed or contradictory review output", () => {
		assert.throws(() => parseLlmReviewJson("{}"), /exactly one/);
		assert.throws(() => parseLlmReviewJson('```json dotdotgod-plan-stage\n{"ok":true,"blockers":["x"],"questions":[],"feedback":[],"requiredPlanUpdates":[]}\n```'), /ok=true/);
		assert.equal(stableBlockerSetKey(["b", "a", "a"]), "a\nb");
	});
});
