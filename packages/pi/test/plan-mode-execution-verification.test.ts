import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import {
	classifyEditTrackingPath, classifyGenericVerification, EMPTY_CONTRACT_HASH, extractExecutionSignals,
	extractObservedCommandOutcomes, extractPlanVerificationContract, matchVerificationCommand, normalizeRelativeCwd,
} from "../extensions/plan-mode/execution-evidence.ts";
import { describePendingPlanDecisions, promptForDecisionWizard } from "../extensions/plan-mode/controllers/decision-wizard.ts";
import { PlanArtifactController, validatePlanPath } from "../extensions/plan-mode/controllers/plan-artifact.ts";
import type * as ReviewGates from "../extensions/plan-mode/controllers/review-gates.ts";
import { configureDocumentationPaths } from "../extensions/plan-mode/runtime/paths.ts";
import { extractTodoItems } from "../extensions/plan-mode/todos.ts";
import { computeExecutionProgressFingerprint, evaluateExecutionSettleGate } from "../extensions/plan-mode/utils.ts";
import { ExecutionEvidenceController } from "../extensions/plan-mode/controllers/execution-evidence.ts";
import { ExecutionProgressController } from "../extensions/plan-mode/controllers/execution-progress.ts";
import { ModeLifecycleController } from "../extensions/plan-mode/controllers/mode-lifecycle.ts";

const hostRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const jiti = hostRequire("jiti").createJiti(import.meta.url);
const { loadReviewSnapshot } = await jiti.import("../extensions/plan-mode/controllers/review-gates.ts") as typeof ReviewGates;

const plan = "docs/plan/my-task/README.md";
const contract = (commands: string) => extractPlanVerificationContract(`## Verification\n\`\`\`bash\n${commands}\n\`\`\``);
function checks(commands: string) {
	const result = contract(commands);
	assert.equal(result.ok, true);
	return result.checks;
}
function workspace(t: TestContext) {
	const parent = mkdtempSync(join(tmpdir(), "plan-evidence-"));
	t.after(() => rmSync(parent, { recursive: true, force: true }));
	const cwd = join(parent, "workspace");
	mkdirSync(cwd);
	const write = (path: string, text = "") => {
		const file = join(cwd, path);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, text);
		return file;
	};
	const sentinel = "## Discussion Queue\n- [ ] Q1 scope blocks-execute-review: SECRET_OUTSIDE_Q\n  - Options:\n    - A: Yes\n    - B: No\n  - Status: open";
	const outside = write("../outside/README.md", sentinel);
	write("outside/README.md", sentinel);
	write("docs/outside/README.md", sentinel);
	write(plan);
	mkdirSync(join(cwd, "docs/plan/escape-file"));
	symlinkSync(outside, join(cwd, "docs/plan/escape-file/README.md"));
	symlinkSync(dirname(outside), join(cwd, "docs/plan/escape-dir"));
	return { cwd, outside, write };
}

test("A1 todo extraction ends at a heading and A2 ignores fenced headings and steps", () => {
	const tail = "2. Add regression test\n## Verification\n1. Run `pnpm test`\n## Re-plan If\n1. Schema changes";
	for (const fence of ["", "~~~md\n## Not a heading\n3. Not a real step\n~~~\n"]) {
		assert.deepEqual(extractTodoItems(`## Plan:\n1. Edit source file\n${fence}${tail}`).map(todo => [todo.step, todo.text]), [[1, "Edit source file"], [2, "Regression test"]]);
	}
});
test("A3 verification headings, shell fences, bullets and ignored examples", () => {
	for (const heading of ["## Verification", "### Verification:", "**Verification:**"]) {
		const result = extractPlanVerificationContract(`\`\`\`md\n## Verification\n- \`wrong\`\n\`\`\`\n${heading}\n~~~sh\n# ignored\n\npnpm test\ngit status --short\n~~~\n\`\`\`json\nignored JSON\n\`\`\`\n- \`pnpm lint\`\nExpected: pass\n## Other\n- \`wrong\``);
		assert.equal(result.ok, true);
		assert.deepEqual(result.checks.map(c => [c.key, c.units[0]?.executable, c.isSubstantive]), [["V1", "pnpm", true], ["V2", "git", false], ["V3", "pnpm", true]]);
	}
});
test("A4 deduplicates and hashes canonical units, including the empty contract", () => {
	const result = contract("pnpm test\npnpm 'test'\npnpm typecheck");
	assert.equal(result.ok, true);
	const expected = JSON.stringify(["test", "typecheck"].map(arg => [{ executable: "pnpm", args: [arg], effectiveCwdRel: ".", envAssignments: [] }]));
	assert.equal(result.contractHash, createHash("sha256").update(expected).digest("hex"));
	assert.equal(result.checks.length, 2);
	assert.equal(EMPTY_CONTRACT_HASH, createHash("sha256").update("[]").digest("hex"));
	assert.deepEqual(extractPlanVerificationContract("# No checks"), { ok: true, checks: [], contractHash: EMPTY_CONTRACT_HASH });
});
test("A5 preserves quoted whitespace and variable literals; A6 propagates contained cd", () => {
	assert.deepEqual(checks(`NODE_ENV=test API_KEY=$API_TOKEN pytest -k "two  spaces" 'a   b' \${VAR}`)[0]?.units, [{ executable: "pytest", args: ["-k", "two  spaces", "a   b", "${VAR}"], effectiveCwdRel: ".", envAssignments: [["API_KEY", "$API_TOKEN"], ["NODE_ENV", "test"]] }]);
	assert.deepEqual(checks("cd packages/pi && pnpm test && pnpm typecheck\ncd packages && cd pi && pnpm lint").flatMap(c => c.units.map(u => u.effectiveCwdRel)), ["packages/pi", "packages/pi", "packages/pi"]);
});
test("A7-A10 rejects malformed fences, shell syntax, invalid cd and excessive unique checks", () => {
	assert.deepEqual(extractPlanVerificationContract("## Verification\n```bash\npnpm test\n"), { ok: false, reason: "unterminated_fence" });
	for (const command of ["pnpm test | tee log", "pnpm test; echo ok", "pnpm test || true", "pnpm test > out", "pnpm test < in", "echo $(id)", "echo `id`", 'pnpm test "$(id)"', 'pnpm test "`id`"', "(pnpm test)", "{ pnpm test; }", "pnpm test # comment", "pnpm test !", 'pnpm test "unclosed', "pnpm test && ", "&& pnpm test", "pnpm test &", "$RUNNER test", "${BIN} test", "cd $TARGET && pnpm test", "cd", "cd -", "cd packages/pi", "pnpm test && cd packages/pi", "cd ../../etc && pnpm test"]) {
		assert.deepEqual(contract(command), { ok: false, reason: "malformed_command" }, command);
	}
	const many = Array.from({ length: 101 }, (_, i) => `pnpm test ${i}`);
	assert.equal(checks(many.slice(0, 100).join("\n")).length, 100);
	assert.deepEqual(contract(many.join("\n")), { ok: false, reason: "malformed_verification" });
});

test("B1 normalizes plan references and honors the configured root", t => {
	const { cwd, write } = workspace(t);
	for (const path of [plan, `@./${plan}`, plan.replaceAll("/", "\\")]) assert.equal(validatePlanPath(cwd, path), plan);
	configureDocumentationPaths("project-memory");
	t.after(() => configureDocumentationPaths());
	const custom = plan.replace("docs", "project-memory");
	write(custom);
	assert.equal(validatePlanPath(cwd, custom), custom);
});
test("B2-B3b rejects non-plan paths and reports fixed safe errors; snapshots contain compiled checks only", t => {
	const { cwd, outside, write } = workspace(t);
	const artifact = new PlanArtifactController();
	const reads = t.mock.method(fs, "readFileSync");
	syncBuiltinESMExports();
	t.after(() => { reads.mock.restore(); syncBuiltinESMExports(); });
	for (const candidate of ["../outside/README.md", "docs/plan/../../outside/README.md", "docs/plan/task/../../outside/README.md", "docs/plan/../../../outside/README.md", outside, "docs/plan/BadSlug/README.md", "docs/plan/a/b/README.md", "docs/plan/my-task/NOTES.md", `${plan}\n`, "docs/plan/escape-file/README.md", "docs/plan/escape-dir/README.md"]) {
		assert.equal(validatePlanPath(cwd, candidate), undefined, candidate);
		if (candidate !== "docs/plan/my-task/NOTES.md") assert.equal(artifact.loadExistingPlanPath(cwd, candidate), undefined, candidate);
		assert.equal(describePendingPlanDecisions(cwd, candidate), "Plan Mode remains active. Cannot read the saved plan; restore it before review.");
		assert.deepEqual(loadReviewSnapshot(cwd, candidate), { ok: false, reason: "invalid_path" });
	}
	assert.equal(reads.mock.callCount(), 0);
	const markdown = "## Plan:\n1. Edit source file\n## Verification\n- `pnpm test`";
	const saved = realpathSync(write(plan, markdown));
	const result = loadReviewSnapshot(cwd, plan);
	assert.equal(reads.mock.callCount(), 1);
	assert.equal(reads.mock.calls[0]?.arguments[0], saved);
	assert.equal(result.ok, true);
	assert.equal(result.planPath, plan);
	assert.equal(result.markdown, markdown);
	assert.equal(result.todos.length, 1);
	assert.equal(result.discussionQueue.blocksExecutionReview, false);
	assert.equal(result.verificationCount, 1);
	assert.equal(result.verificationContract.checks[0]?.units[0]?.executable, "pnpm");
	assert.equal(JSON.stringify(result).includes('"rawCommand"'), false);
	write(plan, "## Verification\n```sh\npnpm test | cat\n```");
	assert.deepEqual(loadReviewSnapshot(cwd, plan), { ok: false, reason: "malformed_verification" });
	assert.deepEqual(loadReviewSnapshot(cwd, "docs/plan/missing/README.md"), { ok: false, reason: "unreadable" });
	assert.equal(artifact.loadExistingPlanPath(cwd, "docs/plan/my-task/NOTES.md"), plan);
});
test("B4-B8 distinguishes source debt, stale-only docs, excluded targets and path escapes", t => {
	const { cwd, outside, write } = workspace(t);
	for (const path of ["src/app.ts", "packages/pi/index.ts", "SKILL.md", "packages/pi/skills/foo/SKILL.md", "AGENTS.md", "CLAUDE.md", "CODEX.md", "packages/shared/workflows/plan.md", ".agents/rules/x.md", "Makefile", "Dockerfile", "Dockerfile.prod", "Justfile", ".env.local", ".npmrc", ".eslintrc.cjs", "tsconfig.json"]) {
		assert.deepEqual(classifyEditTrackingPath(cwd, path), { tracked: true, invalidatesPlanChecks: true, normalizedPath: path, category: path.endsWith(".md") ? "runtime_prompt_or_skill" : "source_or_config" });
	}
	for (const path of ["docs/spec/PLAN_MODE.md", "docs/spec/schema.json", "docs/arch/CODE_CONVENTIONS.md", "README.md", "CHANGELOG.md", "notes/guide.mdx", "docs/notes.txt", "LICENSE", ".unknownrc", "src/.unknownrc"]) {
		assert.deepEqual(classifyEditTrackingPath(cwd, path), { tracked: false, invalidatesPlanChecks: true, normalizedPath: path, reason: "plain_docs_or_spec" });
	}
	for (const path of [plan, "docs/archive/plan/my-task/README.md", ".dotdotgod/manifest.json", ".git/HEAD", "node_modules/a/index.js", "dist/index.js", "build/app.js", "coverage/lcov.info"]) {
		assert.deepEqual(classifyEditTrackingPath(cwd, path), { tracked: false, invalidatesPlanChecks: false, reason: path.startsWith("docs/") ? "plan_or_archive" : "excluded_directory" });
	}
	write("src/placeholder");
	symlinkSync(outside, join(cwd, "src/escape.ts"));
	symlinkSync(join(cwd, plan), join(cwd, "src/plan-link.ts"));
	assert.deepEqual(classifyEditTrackingPath(cwd, "src/plan-link.ts"), { tracked: false, invalidatesPlanChecks: false, reason: "plan_or_archive" });
	for (const path of ["src/escape.ts", "../escape.ts", "src/a\0b.ts"]) {
		assert.deepEqual(classifyEditTrackingPath(cwd, path), { tracked: false, invalidatesPlanChecks: false, reason: "invalid_or_outside_cwd" });
		assert.equal(normalizeRelativeCwd(cwd, path), undefined);
	}
});
test("X2 wizard rejects a byte-identical swap outside the plan root", async t => {
	const { cwd, write } = workspace(t);
	const markdown = "## Discussion Queue\n- [ ] Q1 scope blocks-execute-review: Pick a target\n  - Options:\n    - A: First\n    - B: Second\n  - Status: open\n";
	const active = write(plan, markdown);
	const outside = write("outside/equal.md", markdown);
	const warnings: string[] = [];
	let reviewed = false;
	const result = await promptForDecisionWizard({ cwd, hasUI: true, ui: {
		custom: () => { reviewed = true; rmSync(active); symlinkSync(outside, active); return { action: "confirm", answers: [] }; },
		notify: (message: string) => warnings.push(message),
	} } as unknown as Parameters<typeof promptForDecisionWizard>[0], plan, () => true);
	assert.equal(reviewed, true);
	assert.deepEqual(result, { action: "cancel" });
	assert.match(warnings.join(), /Draft answers discarded/);
});

const mcp = "mcp__dotdotgod_context__execute";
const pass = { ok: true, code: 0, timedOut: false, aborted: false, captureLimitExceeded: false };
const envelope = (results: unknown[], concurrency = 2) => ({ isError: false, structuredContent: { ok: false, results, concurrency } });
const receipt = (toolName: string, input: object, structuredContent?: unknown, isError = false, output = "") => ({ toolName, input, structuredContent, isError, content: [{ type: "text", text: output }], details: { ok: true, results: [pass] } });
const bash = (command: string, exitCode?: number) => receipt("bash", { command }, exitCode === undefined ? undefined : { exit_code: exitCode }, Boolean(exitCode));
const pairs = (rows: ReturnType<typeof extractObservedCommandOutcomes>) => rows.map(({ outcome, countsAsFailure }) => [outcome, countsAsFailure]);

test("C1-C3 bash normalizes supported exits, contradictions and exact terminal status lines", () => {
	const input = { command: "pnpm test" };
	const observe = (structured: unknown, error: boolean, output?: string) => pairs(extractObservedCommandOutcomes(process.cwd(), receipt("bash", input, structured, error, output)))[0];
	for (const payload of [undefined, { output: "ok" }, { exit_code: 0 }]) assert.deepEqual(observe(payload, false), ["passed", false]);
	assert.deepEqual(observe({ exit_code: 1 }, true), ["failed", true]);
	for (const value of [2, "0", 1.5, null, NaN]) assert.deepEqual(observe({ exit_code: value }, false), ["unconfirmed", false]);
	assert.deepEqual(observe({ exit_code: 0 }, true), ["unconfirmed", false]);
	for (const [text, outcome, strike] of [["out\nCommand aborted", "aborted", false], ["out\nCommand timed out after 30.5 seconds. Killed.", "timed_out", true], ["Command aborted\nreal failure line", "failed", true], ["some error", "failed", true]]) assert.deepEqual(observe(undefined, true, String(text)), [outcome, strike]);
});
test("C4-C7 MCP validates the outer batch separately from each receipt and ignores other tools", () => {
	const observe = (input: object, structured?: unknown, error = false) => extractObservedCommandOutcomes(process.cwd(), receipt(mcp, input, structured, error, JSON.stringify(envelope([pass]))));
	const commands = (length: number) => Array.from({ length }, () => ({ command: "pnpm test", outputMode: "discard" }));
	const bad = { ...pass, ok: false, code: null };
	const rows = observe({ commands: commands(5) }, envelope([pass, { ...bad, code: 1 }, { ...bad, timedOut: true }, { ...bad, aborted: true }, { ...bad, captureLimitExceeded: true }]));
	assert.deepEqual(pairs(rows), [["passed", false], ["failed", true], ["timed_out", true], ["aborted", false], ["capture_limit_exceeded", true]]);
	assert.deepEqual(rows.map(row => row.batchConcurrency), [2, 2, 2, 2, 2]);
	for (const payload of [undefined, envelope([pass]).structuredContent, { ...envelope([pass]), isError: true }, envelope([]), { structuredContent: { results: [pass] } }, envelope([pass], 0), envelope([pass], 9)]) assert.deepEqual(pairs(observe({ commands: commands(1) }, payload)), [["unconfirmed", false]]);
	assert.deepEqual(pairs(observe({ commands: commands(1) }, envelope([pass]), true)), [["unconfirmed", false]]);
	for (const count of [0, 101]) assert.deepEqual(observe({ commands: commands(count) }, envelope(commands(count))), []);
	for (const malformed of [{ ...pass, code: 1 }, { ...pass, timedOut: true }, { ...pass, aborted: true }, { ...pass, captureLimitExceeded: true }, { ...pass, ok: false }, null, { ok: false, error: "spawn ENOENT" }]) assert.deepEqual(pairs(observe({ commands: commands(2) }, envelope([pass, malformed]))), [["passed", false], ["unconfirmed", false]]);
	for (const tool of ["codemode", "mcp__dotdotgod_context__project_impact", "read", "grep"]) assert.deepEqual(extractObservedCommandOutcomes(process.cwd(), receipt(tool, { commands: commands(1) }, envelope([pass]))), []);
});
test("C8-C9 generic classification rejects spoofed verification and recognizes closed runner classes", () => {
	const [required] = checks("pnpm test");
	assert.ok(required);
	const cwd = process.cwd();
	const classify = (command: string) => {
		const [row] = extractObservedCommandOutcomes(cwd, bash(command));
		assert.ok(row);
		return { runner: classifyGenericVerification(row.units), ...matchVerificationCommand([required], row) };
	};
	for (const command of ["pnpm test || true", "pnpm test; echo ok", "pnpm test | cat", "pnpm test # comment", "npx pytest --help", "pnpm exec vitest --listTests", "npx /tmp/fake/pytest", "SKIP_TESTS=1 npx vitest run", "pytest --help", "vitest -v", "pytest --collect-only", "jest --listTests", "cargo test --no-run", "pnpm test --dry-run", "make -n test", "go test -list .", "pnpm help test", "cargo help test", 'node --eval "1" --test', 'node -e "console.log(\'--test\')"', "/tmp/fake/pytest", "./fake-vitest", "git status --short", "rg foo src/", "dotdotgod graph impact .", "dotdotgod init . --dry-run", "npx -c 'echo ok' vitest", "node script.mjs --test", "pytest --collect-only=true", "go 'test ./fake'", "node /tmp/fake/packages/cli/bin/dotdotgod.mjs validate ."]) {
		assert.equal(classify(command).runner, undefined, command);
		assert.equal(classify(command).satisfiesSubstantive, false, command);
		assert.deepEqual(classify(command).matchedPlanChecks, [], command);
	}
	for (const key of ["SKIP_TESTS", "PATH", "NODE_OPTIONS", "DYLD_INSERT_LIBRARIES", "PYTHONPATH", "BASH_ENV", "LD_PRELOAD"]) {
		assert.equal(classify(`${key}=1 pnpm test`).runner, undefined);
		const [row] = extractObservedCommandOutcomes(cwd, receipt(mcp, { commands: [{ command: "pnpm test", env: { [key]: "1" } }] }, envelope([pass])));
		assert.ok(row);
		assert.equal(classifyGenericVerification(row.units), undefined);
	}
	for (const [command, runner] of Object.entries({ "node --experimental-strip-types --test test/*.test.ts": "test", "node_modules/.bin/vitest run": "test", "npx vitest run": "test", "pnpm --filter @dotdotgod/pi run verify": "verify", "pnpm --filter @dotdotgod/pi test": "test", "tsc --noEmit": "typecheck", "eslint .": "lint", "cargo build": "build", "node packages/cli/bin/dotdotgod.mjs validate .": "validate", "dotdotgod validate .": "validate" })) assert.equal(classify(command).runner, runner, command);
	assert.deepEqual(pairs(extractObservedCommandOutcomes(cwd, bash("dotdotgod validate .", 1))), [["failed", true]]);
});
test("C10 exact cwd/env/direct argv matching and contiguous passed chains", t => {
	const { cwd, write } = workspace(t);
	write("packages/pi/marker");
	const required = checks("git status --short\ncd packages/pi && pnpm test\npnpm lint\npnpm typecheck && pnpm lint\nNODE_ENV=test pnpm test");
	const match = (event: ReturnType<typeof receipt>) => {
		const [row] = extractObservedCommandOutcomes(cwd, event);
		assert.ok(row);
		return matchVerificationCommand(required, row);
	};
	const matched = (event: ReturnType<typeof receipt>) => match(event).matchedPlanChecks.map(check => check.key);
	const batch = (spec: object, cwd?: string) => receipt(mcp, { commands: [spec], cwd }, envelope([pass]));
	assert.deepEqual(matched(bash("git status --short")), ["V1"]);
	assert.equal(match(bash("git status --short")).satisfiesSubstantive, false);
	assert.deepEqual(matched(bash("pnpm test")), []);
	assert.deepEqual(matched(batch({ executable: "pnpm", args: ["test"], cwd: "packages/pi" })), ["V2"]);
	assert.deepEqual(matched(batch({ executable: "pnpm", args: ["test"] }, "packages/pi")), ["V2"]);
	assert.deepEqual(matched(batch({ command: "NODE_ENV=test pnpm test", env: { NODE_ENV: "prod" } })), ["V5"]);
	assert.deepEqual(extractObservedCommandOutcomes(cwd, batch({ command: "pnpm", shell: false, env: { FOO: null } }))[0]?.units, [{ executable: "pnpm", args: [], effectiveCwdRel: ".", envAssignments: [["FOO", null]] }]);
	assert.deepEqual(matched(bash("pnpm typecheck && pnpm lint && echo done")), ["V3", "V4"]);
	assert.deepEqual(matched(bash("pnpm lint && pnpm typecheck")), ["V3"]);
	assert.deepEqual(matched(bash("pnpm typecheck && pnpm lint", 1)), ["V4"]);
	const ambiguous = match(bash("pnpm typecheck && pnpm lint && echo done", 1));
	assert.equal(ambiguous.ambiguousChainFailure, true);
	assert.equal(ambiguous.outcome, "unconfirmed");
	assert.equal(ambiguous.countsAsFailure, false);
	for (const event of [bash("NODE_ENV=prod pnpm test"), bash("NODE_ENV=test PATH=/tmp/other pnpm test"), batch({ command: "pnpm test", env: { NODE_ENV: null } }), batch({ command: "pnpm test && echo hi", shell: false }), batch({ executable: "echo", args: ["ok && pnpm test"] })]) assert.deepEqual(matched(event), []);
});

test("D1-D4 signals discard reasons, prioritize replan and ignore fenced/inline examples", () => {
	for (const [tag, kind] of [["[replan]", "replan"], ["[REPLAN: schema changed]", "replan"], ["[BLOCKED]", "blocked"], ["[blocked: need API key]", "blocked"], ["[BLOCKED: token] then [REPLAN: mismatch]", "replan"], ["Example `[REPLAN]`; now [BLOCKED: waiting]", "blocked"]] as const) assert.deepEqual(extractExecutionSignals(tag), { kind });
	assert.equal(extractExecutionSignals("Example `` `[REPLAN]` `` only."), undefined);
	assert.equal(extractExecutionSignals("Do not emit `[REPLAN]`.\n```md\n[BLOCKED: example]\n```\n~~~\n[REPLAN: example]\n~~~"), undefined);
});

const gateDefaults = {
	executing: true, outcome: "completed", hasObservedExecutionTurn: true, hasDispatchedExecutionHandoff: true,
	remainingTodoCount: 0, needsSubstantiveVerification: false, missingRequiredCheckIndices: [],
	eventContinue: false, pendingMessagesCount: 0, canContinue: true, runContinuationCount: 0, currentFingerprint: "new",
} as const;
const gate = (overrides: Partial<Parameters<typeof evaluateExecutionSettleGate>[0]> = {}) =>
	evaluateExecutionSettleGate({ ...gateDefaults, ...overrides });
const failedCheck = { ref: { kind: "plan", index: 1 }, outcome: "failed", consecutiveFailures: 2 } as const;

test("E1 settle gate applies all eleven branches in priority order", () => {
	const replan = { kind: "replan" } as const;
	const blocked = { kind: "blocked" } as const;
	const exhausted = { runContinuationCount: 3, lastProgressFingerprint: "new" };
	assert.deepEqual(gate({ executing: false, outcome: "error", latestSignal: replan }), { action: "noop" });
	for (const outcome of ["aborted", "error"] as const) {
		assert.deepEqual(gate({ outcome, latestSignal: replan }), { action: "stop", reason: outcome });
		assert.deepEqual(gate({ outcome, hasObservedExecutionTurn: false }), { action: "stop", reason: outcome });
		assert.deepEqual(gate({ outcome, hasObservedExecutionTurn: false, hasDispatchedExecutionHandoff: false }), { action: "noop" });
	}
	assert.deepEqual(gate({ hasObservedExecutionTurn: false, latestSignal: replan }), { action: "noop" });
	assert.deepEqual(gate({ latestSignal: replan, lastCheck: failedCheck }), { action: "replan", trigger: "signal" });
	assert.deepEqual(gate({ latestSignal: blocked, lastCheck: failedCheck }), { action: "replan", trigger: "consecutive_failures" });
	assert.deepEqual(gate({ latestSignal: blocked }), { action: "stop", reason: "blocked" });
	assert.deepEqual(gate({ ...exhausted, eventContinue: true }), { action: "complete" });
	assert.deepEqual(gate({ ...exhausted, remainingTodoCount: 1, eventContinue: true }), { action: "defer_to_other_extension" });
	assert.deepEqual(gate({ ...exhausted, remainingTodoCount: 1 }), { action: "stop", reason: "no_progress" });
	assert.deepEqual(gate({ ...exhausted, remainingTodoCount: 1, currentFingerprint: "changed" }), { action: "stop", reason: "budget_exhausted" });
	assert.deepEqual(gate({
		remainingTodoCount: 1, needsSubstantiveVerification: true, missingRequiredCheckIndices: [1],
		lastCheck: { ...failedCheck, consecutiveFailures: 1 }, runContinuationCount: 2,
	}), { action: "continue", reasons: ["incomplete_todos", "unverified_edits", "missing_plan_verifications", "verification_failed"], nextAttempt: 3, progressFingerprint: "new" });
});

function ledger(t: TestContext, commands = "pnpm test", carryForwardDebt = false) {
	const { cwd, write } = workspace(t);
	write(plan, "## Verification\n" + ["```bash", commands, "```"].join("\n"));
	const { checks, contractHash } = (() => {
		const parsed = contract(commands);
		assert.equal(parsed.ok, true);
		return parsed;
	})();
	const controller = new ExecutionEvidenceController();
	if (carryForwardDebt) controller.beginRecovery(plan);
	controller.beginApprovedExecution({ planPath: plan, checks, contractHash, carryForwardDebt });
	let nextCall = 0;
	function start() {
		const id = String(++nextCall);
		controller.recordToolStart(id, 7);
		return id;
	}
	function finish(id: string, event: ReturnType<typeof receipt>) {
		const record = controller.consumeToolStart(id);
		assert.ok(record);
		controller.recordObservedCommands(cwd, event, record);
		assert.equal(controller.consumeToolStart(id), undefined);
	}
	function observe(event: ReturnType<typeof receipt>) { finish(start(), event); }
	const edit = (path: string) => controller.recordObservedEdit(cwd, path);
	const snap = () => {
		const snapshot = controller.snapshot();
		assert.ok(snapshot);
		return snapshot;
	};
	const restore = () => {
		const snapshot = snap();
		return controller.restore(JSON.parse(JSON.stringify(snapshot)), {
			cwd, mode: "executing", currentPlanPath: plan,
			entries: [{ type: "custom", customType: "plan-mode-execute", data: { attemptId: snapshot.attemptId, planPath: plan } }],
		});
	};
	const settled = () => gate({
		lastCheck: snap().lastCheck, missingRequiredCheckIndices: controller.missingRequiredCheckIndices,
		needsSubstantiveVerification: controller.needsSubstantiveVerification,
	});
	return { controller, cwd, write, edit, snap, start, finish, observe, restore, settled };
}

test("E2 edits stale explicit passes; generic pass after a doc edit clears earlier source debt", t => {
	const { controller: c, edit, snap, observe } = ledger(t);
	observe(bash("pnpm test"));
	assert.deepEqual(c.missingRequiredCheckIndices, []);
	edit("docs/spec/X.md");
	assert.equal(snap().editRevision, 1);
	assert.equal(snap().sourceEditRevision, undefined);
	assert.equal(c.needsSubstantiveVerification, false);
	assert.deepEqual(c.missingRequiredCheckIndices, [1]);
	edit("src/a.ts");
	assert.equal(snap().sourceEditRevision, 2);
	assert.equal(c.needsSubstantiveVerification, true);
	edit("docs/spec/Y.md");
	observe(bash("pnpm lint"));
	assert.equal(snap().substantivePassedRevision, 3);
	assert.equal(c.needsSubstantiveVerification, false);
	assert.deepEqual(c.missingRequiredCheckIndices, [1]);
	observe(bash("pnpm test"));
	assert.deepEqual(c.missingRequiredCheckIndices, []);
});

test("E3 fresh substantive pass permanently clears inherited debt at r0 and after mixed edits", t => {
	for (const mixed of [false, true]) {
		const { controller: c, edit, snap, observe } = ledger(t, "pnpm test", true);
		assert.equal(c.needsSubstantiveVerification, true);
		if (mixed) { edit("src/a.ts"); edit("docs/guide.md"); }
		observe(bash("pnpm lint"));
		assert.equal(snap().substantivePassedRevision, mixed ? 2 : 0);
		assert.equal(snap().unverifiedDebt, undefined);
		edit("docs/later.md");
		assert.equal(c.needsSubstantiveVerification, false);
	}
	const { controller: c, edit, write } = ledger(t);
	edit("src/a.ts");
	const otherPlan = "docs/plan/other-task/README.md";
	write(otherPlan);
	c.beginApprovedExecution({ planPath: otherPlan, checks: [], contractHash: EMPTY_CONTRACT_HASH, carryForwardDebt: true });
	assert.equal(c.needsSubstantiveVerification, false);
});

test("E4 rerun failure or unconfirmed revokes prior verification credit", t => {
	const { controller: c, edit, snap, observe } = ledger(t);
	edit("src/a.ts");
	for (const event of [bash("pnpm test", 1), receipt("bash", { command: "pnpm test" }, { exit_code: "0" })]) {
		observe(bash("pnpm test"));
		assert.equal(snap().passedRequiredRevisions.V1, 1);
		assert.equal(snap().substantivePassedRevision, 1);
		observe(event);
		assert.deepEqual(c.missingRequiredCheckIndices, [1]);
		assert.equal(snap().substantivePassedRevision, undefined);
	}
});

test("E5 unrelated grep failures do not poison verification", t => {
	const { snap, observe, settled } = ledger(t);
	observe(bash("pnpm test"));
	const before = snap();
	observe(bash('rg "missing" src/', 1));
	assert.deepEqual(snap(), before);
	assert.deepEqual(settled(), { action: "complete" });
});

test("E6 concurrent receipts preserve independent credit, let failure win and cap strikes per call", t => {
	const { observe, snap } = ledger(t, "pnpm test\npnpm lint");
	const commands = ["pnpm test", "pnpm test", "pnpm test", "pnpm lint"].map(command => ({ command }));
	const fail = { ...pass, ok: false, code: 1 };
	observe(receipt(mcp, { commands }, envelope([pass, fail, fail, pass], 4)));
	assert.deepEqual(snap().passedRequiredRevisions, { V2: 0 });
	assert.deepEqual(snap().lastCheck, { ...failedCheck, consecutiveFailures: 1 });
});

test("E7 overlapping passes need fresh revision and per-ref sequence; global failure stays unresolved", t => {
	const { edit, snap, start, finish, observe } = ledger(t, "pnpm test\npnpm lint");
	edit("src/a.ts");
	const same = start();
	observe(bash("pnpm test", 1));
	finish(same, bash("pnpm test"));
	assert.deepEqual(snap().passedRequiredRevisions, {});
	assert.equal(snap().lastCheck?.outcome, "failed");
	const distinct = start();
	observe(bash("pnpm test", 1));
	finish(distinct, bash("pnpm lint"));
	assert.deepEqual(snap().passedRequiredRevisions, { V2: 1 });
	assert.deepEqual(snap().lastCheck, failedCheck);
	const stale = start();
	edit("src/b.ts");
	finish(stale, bash("pnpm test"));
	assert.equal(snap().passedRequiredRevisions.V1, undefined);
});

test("E8 edits preserve strike continuity; generic identity is exact and RAM-only; stale or non-strike outcomes do not escalate", t => {
	const { edit, snap, start, finish, observe, restore, settled } = ledger(t);
	edit("src/a.ts");
	observe(bash("pnpm test", 1));
	edit("src/b.ts");
	observe(bash("pnpm test"));
	assert.equal(snap().lastCheck?.consecutiveFailures, 0);
	assert.deepEqual(settled(), { action: "complete" });
	observe(bash("pnpm test", 1));
	edit("src/c.ts");
	observe(bash("pnpm test", 1));
	assert.deepEqual(settled(), { action: "replan", trigger: "consecutive_failures" });
	for (const [file, strikes] of [["a", 1], ["b", 1], ["b", 2]] as const) {
		observe(bash("pytest tests/" + file + ".py", 1));
		assert.equal(snap().lastCheck?.consecutiveFailures, strikes);
	}
	assert.equal(restore(), true);
	observe(bash("pytest tests/b.py", 1));
	assert.equal(snap().lastCheck?.consecutiveFailures, 1);
	observe(bash("pnpm test", 1));
	assert.equal(restore(), true);
	observe(bash("pnpm test", 1));
	assert.equal(snap().lastCheck?.consecutiveFailures, 2);
	const earlier = start();
	const later = start();
	finish(later, bash("pnpm test", 1));
	finish(earlier, bash("pnpm test", 1));
	assert.equal(snap().lastCheck?.consecutiveFailures, 1);
	const stale = start();
	edit("src/d.ts");
	finish(stale, bash("pnpm test", 1));
	assert.equal(snap().lastCheck?.consecutiveFailures, 1);
	for (const event of [
		receipt("bash", { command: "pnpm test" }, { exit_code: "0" }),
		receipt("bash", { command: "pnpm test" }, undefined, true, "Command aborted"),
	]) {
		observe(event);
		assert.equal(snap().lastCheck?.consecutiveFailures, 0);
	}
});

test("E9 pending messages defer only when eligible; duplicate todo evidence does not count as progress", t => {
	const { observe, snap } = ledger(t);
	const progress = new ExecutionProgressController();
	progress.setTodos(extractTodoItems("Plan:\n1. First task\n2. Second task\n3. Third task"));
	const fp = () => computeExecutionProgressFingerprint(snap(), progress.todos);
	progress.markCompletedFromText("[DONE:1]");
	const last = fp();
	progress.markCompletedFromText("[DONE:1]");
	assert.equal(fp(), last);
	const decision = () => gate({ remainingTodoCount: 1, runContinuationCount: 1, lastProgressFingerprint: last, currentFingerprint: fp() });
	assert.deepEqual(decision(), { action: "stop", reason: "no_progress" });
	observe(bash("pnpm test"));
	assert.equal(decision().action, "continue");
	const withPass = fp();
	progress.markCompletedFromText("[DONE:2]");
	assert.notEqual(fp(), withPass);
	const incomplete = { remainingTodoCount: 1 };
	assert.deepEqual(gate({ ...incomplete, pendingMessagesCount: 1 }), { action: "defer_to_other_extension" });
	assert.equal(gate({ ...incomplete, eventContinue: true, pendingMessagesCount: 1, canContinue: false }).action, "continue");
});

test("E10 capped evidence, strict restore with disk freshness reset, closed projections and lifecycle revocation", t => {
	const { controller: c, cwd, edit, observe, snap, restore, start } = ledger(t, "SECRET_ENV=SECRET_VALUE pnpm test");
	for (let i = 0; i < 51; i++) edit("src/file-" + i + ".ts");
	edit("src/file-0.ts");
	assert.equal(snap().editRevision, 52);
	assert.equal(snap().editedPaths.length, 50);
	assert.equal(snap().editedPathsTruncated, true);
	observe(receipt("bash", { command: "SECRET_ENV=SECRET_VALUE pnpm test" }, undefined, false, "SECRET_OUT"));
	assert.equal(c.hasDispatchedExecutionHandoff, false);
	assert.equal(c.hasObservedExecutionTurn, false);
	const firstRun = c.activeRunId;
	assert.ok(firstRun > 0);
	c.markHandoffDispatched();
	assert.equal(c.hasDispatchedExecutionHandoff, true);
	c.beginRun();
	assert.ok(c.activeRunId > firstRun);
	assert.equal(c.hasDispatchedExecutionHandoff, true);
	c.markObservedExecutionTurn();
	c.recordExecutionSignal({ kind: "blocked" });
	c.runContinuationCount = 2;
	const id = start();
	const ended = start();
	c.cleanupToolCall(ended);
	assert.equal(c.consumeToolStart(ended), undefined);
	const before = snap();
	assert.doesNotMatch(JSON.stringify([before, c.projectUxSummary("executing", plan, [])]), /SECRET_|rawCommand/);
	assert.equal(restore(), true);
	const { substantivePassedRevision, lastCheck, ...retained } = before;
	assert.equal(substantivePassedRevision, 52);
	assert.equal(lastCheck?.outcome, "passed");
	assert.deepEqual(snap(), { ...retained, passedRequiredRevisions: {} });
	assert.equal(c.latestSignal, undefined);
	assert.equal(c.runContinuationCount, 0);
	assert.equal(c.consumeToolStart(id), undefined);
	assert.equal(c.hasDispatchedExecutionHandoff, true);
	for (const mutation of [
		{ contractHash: "short" }, { contractHash: "z".repeat(64) }, { requiredCheckCount: 101 }, { requiredCheckCount: -1 },
		{ passedRequiredRevisions: { V99: 0 } }, { passedRequiredRevisions: { V1: 999 } },
		{ lastCheck: { ref: { kind: "unconfirmed" }, outcome: "failed", consecutiveFailures: 2 } },
		{ editedPaths: ["../escape.ts"] }, { editedPaths: [...before.editedPaths, "src/extra.ts"] }, { attemptId: "recovery" },
	]) assert.equal(c.restore({ ...before, ...mutation }, {
		cwd, mode: "executing", currentPlanPath: plan,
		entries: [{ type: "custom", customType: "plan-mode-execute", data: { attemptId: before.attemptId, planPath: plan } }],
	}), false);
	assert.equal(c.snapshot(), undefined);
	assert.equal(c.restore({ ...before, rawCommand: "SECRET_OUT" }, { cwd, mode: "planning", currentPlanPath: plan }), true);
	assert.deepEqual(snap(), before);
	assert.doesNotMatch(JSON.stringify([snap(), c.projectUxSummary("planning", plan, [])]), /SECRET_|rawCommand/);
	const lifecycle = new ModeLifecycleController();
	lifecycle.enablePlanning(["read"]);
	const generation = lifecycle.beginReview();
	assert.ok(generation);
	assert.equal(lifecycle.startExecution(generation), true);
	const executingGeneration = lifecycle.currentGeneration;
	lifecycle.escalateToPlanning(["read"]);
	assert.equal(lifecycle.restrictsMutation, true);
	assert.deepEqual(lifecycle.activeTools, ["read"]);
	assert.ok(lifecycle.currentGeneration > executingGeneration);
	c.beginRecovery(plan);
	const recovery = snap();
	assert.equal(recovery.attemptId, "recovery");
	assert.equal(recovery.editRevision, 0);
	assert.equal(recovery.contractHash, EMPTY_CONTRACT_HASH);
	assert.equal(recovery.lastCheck, undefined);
	assert.equal(c.restore(recovery, { cwd, mode: "planning", currentPlanPath: plan }), true);
	assert.equal(c.needsSubstantiveVerification, true);
	assert.equal(c.restore(recovery, { cwd, mode: "executing", currentPlanPath: plan }), false);

	const archive = "docs/archive/plan/my-task/README.md";
	const scoped = ledger(t);
	scoped.write("packages/pi/fixture");
	const markdown = ["## Verification", "```sh", "cd packages/pi && pnpm test", "```"].join("\n");
	const compiled = extractPlanVerificationContract(markdown, scoped.cwd);
	assert.equal(compiled.ok, true);
	const attemptId = scoped.controller.beginApprovedExecution({ planPath: plan, checks: compiled.checks, contractHash: compiled.contractHash });
	const snapshot = scoped.snap();
	const options = {
		cwd: scoped.cwd, mode: "executing", currentPlanPath: plan,
		entries: [{ type: "custom", customType: "plan-mode-execute", data: { attemptId, planPath: plan } }],
	} as const;
	assert.equal(scoped.controller.restore(snapshot, { ...options, entries: [] }), false);
	assert.equal(scoped.controller.restore(snapshot, { ...options, currentPlanPath: undefined }), false);
	assert.equal(scoped.controller.restore(snapshot, options), false);
	rmSync(join(scoped.cwd, plan));
	scoped.write(archive, markdown);
	assert.equal(scoped.controller.restore(snapshot, options), true);
	scoped.observe(bash("cd packages/pi && pnpm test"));
	assert.deepEqual(scoped.controller.missingRequiredCheckIndices, []);
	rmSync(join(scoped.cwd, archive));
	symlinkSync(scoped.write("wrong/README.md", markdown), join(scoped.cwd, archive));
	assert.equal(scoped.controller.restore(snapshot, options), false);
});

test("E11 replay requires the latest matching execute marker and excludes aborted/error turns", () => {
	const progress = new ExecutionProgressController();
	const msg = (step: number, stopReason = "stop") => ({ type: "message", message: { role: "assistant", stopReason, content: [{ type: "text", text: "[DONE:" + step + "]" }] } });
	const marker = (attemptId: string) => ({ type: "custom", customType: "plan-mode-execute", data: { attemptId } });
	const replay = (entries: unknown[], attempt?: string) => {
		progress.setTodos(extractTodoItems("Plan:\n1. First task\n2. Second task\n3. Third task"));
		progress.replayCompletedFromSessionEntries(entries, attempt);
		return progress.todos.filter(todo => todo.completed).map(todo => todo.step);
	};
	assert.deepEqual(replay([msg(1)]), []);
	assert.deepEqual(replay([marker("old"), msg(1), marker("active"), msg(2)], "active"), [2]);
	assert.deepEqual(replay([marker("old"), msg(1), marker("active"), msg(2)]), [2]);
	assert.deepEqual(replay([marker("old"), msg(1), marker("active"), msg(2)], "old"), [1]);
	assert.deepEqual(replay([marker("old"), msg(1)], "missing"), []);
	assert.deepEqual(replay([marker("active"), msg(1), marker("active"), msg(1, "aborted"), msg(2, "error"), msg(3)], "active"), [3]);
});

