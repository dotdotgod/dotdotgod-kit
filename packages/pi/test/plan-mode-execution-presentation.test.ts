import assert from "node:assert/strict";
import { it } from "node:test";
import { initTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { PlanReviewComponent } from "../extensions/plan-mode/components/plan-mode-components.ts";
import type { ExecutionNoticeKind, PlanReviewFailureReason, SafeExecutionUxSummary } from "../extensions/plan-mode/execution-evidence.ts";
import { buildPlanReviewDisplayMarkdown, buildPlanReviewFallbackPrompt, buildPlanReviewTitle, formatPlanReviewCounts, getPlanReviewVisibleBodyLines } from "../extensions/plan-mode/plans.ts";
import { formatExecutionNotice, formatPlanModeStatus, formatPlanReviewFailureNotice, formatRemainingItemsSummary, formatSafeCheckRef } from "../extensions/plan-mode/presentation.ts";
import { buildExecutionContinueMessage, buildPlanExecutionContextPrompt, buildPlanModeContextPrompt, buildPlanReplanHandoffBlock } from "../extensions/plan-mode/prompts.ts";

const planPath = "docs/plan/example-task/README.md";
const base: SafeExecutionUxSummary = {
	mode: "executing", todoCompleted: 0, todoTotal: 0, remainingTodoSteps: [], editRevision: 0,
	requiredCheckCount: 0, passedRequiredCheckCount: 0, missingRequiredCheckIndices: [],
	needsSubstantiveVerification: false, continuationCount: 0, maxContinuations: 3,
};
const todos = { todoCompleted: 1, todoTotal: 3, remainingTodoSteps: [2, 3] };
const checks = { requiredCheckCount: 2, passedRequiredCheckCount: 1, missingRequiredCheckIndices: [2] };
const debt = { needsSubstantiveVerification: true };
const lastCheck = { ref: { kind: "plan", index: 2 }, outcome: "failed", consecutiveFailures: 1 } as const;
const incomplete = { ...base, ...todos, ...checks, ...debt, editRevision: 3, lastCheck, planPath };

it("F1: footer uses one state grammar and pause takes priority", () => {
	assert.equal(formatPlanModeStatus({ ...base, mode: "off" }), undefined);
	for (const mode of ["planning", "reviewing"] as const) {
		assert.deepEqual(formatPlanModeStatus({ ...incomplete, mode }), { text: "⏸ plan", color: "warning" });
	}
	const cases: [Partial<SafeExecutionUxSummary>, string][] = [
		[{}, "📋 exec"], [todos, "📋 1/3"], [checks, "📋 exec · V1/2"],
		[{ ...todos, ...checks }, "📋 1/3 · V1/2"], [debt, "📋 exec · verify"],
		[{ ...todos, ...debt }, "📋 1/3 · verify"],
		[{ ...todos, ...debt, ...checks, requiredCheckCount: 1 }, "📋 1/3 · V1/1 · verify"],
		[{ ...todos, continuationCount: 1 }, "📋 1/3 (1/3)"],
		[{ ...checks, continuationCount: 1 }, "📋 exec · V1/2 (1/3)"],
		[{ ...debt, continuationCount: 1 }, "📋 exec · verify (1/3)"],
		[{ ...todos, ...debt, ...checks, requiredCheckCount: 1, continuationCount: 2 }, "📋 1/3 · V1/1 · verify (2/3)"],
	];
	for (const [override, text] of cases) {
		const status = formatPlanModeStatus({ ...base, editRevision: 3, ...override });
		assert.deepEqual(status, { text, color: "accent" });
		assert.ok(visibleWidth(text) <= 32);
	}
	for (const pauseState of ["blocked", "no_progress", "budget_exhausted", "aborted", "error"] as const) {
		for (const progress of [todos, base]) {
			const prefix = progress.todoTotal ? "📋 1/3" : "📋 exec";
			const text = `${prefix} · ${pauseState === "blocked" ? "blocked" : "paused"}`;
			assert.deepEqual(formatPlanModeStatus({ ...base, ...progress, ...checks, ...debt, continuationCount: 2, pauseState }), { text, color: "warning" });
		}
	}
});

it("F2: remaining items use ordered safe clauses and omit empty entries", () => {
	assert.equal(formatSafeCheckRef({ kind: "generic", runner: "test" }), "test check");
	assert.equal(formatSafeCheckRef({ kind: "unconfirmed" }), "unconfirmed check");
	assert.equal(formatRemainingItemsSummary({ ...incomplete, missingRequiredCheckIndices: [1, 2] }),
		"steps: #2, #3; unverified edits at r3; missing: Verification #1, Verification #2 at edit r3; last check: Verification #2 (failed)");
	assert.equal(formatRemainingItemsSummary({ ...base, ...debt }), "unverified edit debt");
	assert.equal(formatRemainingItemsSummary({ ...base, ...checks, lastCheck: { ...lastCheck, outcome: "passed" } }), "missing: Verification #2");
	assert.equal(formatRemainingItemsSummary(base), undefined);
});

it("F3: execution and review notices render safe, complete copy", () => {
	const cases: Record<ExecutionNoticeKind, RegExp> = {
		blocked: /\[BLOCKED\].*waiting for user input/, no_progress: /no progress.*remaining items unchanged/,
		budget_exhausted: /auto-continuation limit 3\/3 reached/, replan_signal: /Returned to Plan Mode \(\[REPLAN\]\)/,
		replan_consecutive_failures: /Verification #2 failed twice consecutively/,
		legacy_executing_recovery: /verification evidence is unavailable/, corrupted_evidence_recovery: /evidence could not be restored/,
		branch_switch_executing: /prior passes may not reflect current disk files/,
	};
	const pauseGuidance = "Reply to continue, or run /dd:plan <reason> to revise the plan.";
	const hostile = { error: new Error("SECRET_CANARY_TOKEN_XYZ"), rawCommand: "SECRET_CANARY_TOKEN_XYZ" };
	for (const [rawKind, expected] of Object.entries(cases)) {
		const kind = rawKind as ExecutionNoticeKind;
		for (const fixture of [incomplete, { ...incomplete, todoTotal: 0 }, { ...incomplete, editRevision: 0 }, { ...base, lastCheck }]) {
			const notice = formatExecutionNotice(kind, { ...fixture, ...hostile, continuationCount: 3 });
			assert.equal(notice.level, kind === "blocked" ? "info" : "warning");
			assert.match(notice.message, expected);
			assert.doesNotMatch(notice.message, /SECRET_CANARY|\(\)| {2}|\s$|switch to \/dd:plan/);
			if (!fixture.todoTotal) assert.doesNotMatch(notice.message, /progress preserved/i);
			if (!fixture.editRevision) assert.doesNotMatch(notice.message, /edit r0/);
			if (["blocked", "no_progress", "budget_exhausted"].includes(kind)) assert.ok(notice.message.endsWith(pauseGuidance));
		}
	}
	assert.equal(formatExecutionNotice("no_progress", base).message, `Execution paused (no progress): remaining items unchanged. ${pauseGuidance}`);
	assert.equal(formatExecutionNotice("budget_exhausted", { ...base, continuationCount: 3 }).message, `Execution paused (auto-continuation limit 3/3 reached). ${pauseGuidance}`);
	const reviewReasons: Record<PlanReviewFailureReason, RegExp> = {
		invalid_path: /readable within the project plan root/, unreadable: /readable within the project plan root/,
		malformed_verification: /malformed Verification section/, changed_during_review: /Execution approval discarded/,
		unexpected_error: /Review the saved plan and try again/,
	};
	for (const [reason, expected] of Object.entries(reviewReasons)) {
		const notice = formatPlanReviewFailureNotice(reason as PlanReviewFailureReason);
		assert.equal(notice.level, "warning");
		assert.match(notice.message, expected);
	}
});

it("F4: continuation distinguishes strike-eligible failures, inherited debt, and the final attempt", () => {
	const first = buildExecutionContinueMessage(incomplete, 1);
	assert.match(first, /\[PLAN EXECUTION CONTINUATION 1\/3\]/);
	assert.match(first, /Remaining Plan steps: #2, #3/);
	assert.match(first, /Verification #2 \(attempt 1\/2, outcome: failed\)/);
	assert.match(first, /same check fails again.*\[REPLAN: <reason>\]/);
	for (const check of [
		{ ...lastCheck, ref: { kind: "unconfirmed" }, outcome: "unconfirmed" },
		{ ...lastCheck, outcome: "aborted" }, { ...lastCheck, consecutiveFailures: 0 },
	] as const) {
		const message = buildExecutionContinueMessage({ ...base, lastCheck: check }, 2);
		assert.match(message, /did not confirm pass/);
		assert.doesNotMatch(message, /attempt \d\/2|same check fails again/);
	}
	assert.doesNotMatch(buildExecutionContinueMessage({ ...base, lastCheck: { ...lastCheck, outcome: "passed" } }, 1), /Last verification/);
	const final = buildExecutionContinueMessage({ ...base, ...debt }, 3);
	assert.match(final, /Final auto-continuation \(3\/3\):.*verified.*unfinished.*visible response/);
	assert.match(final, /Unverified edit debt carried forward/);
	assert.doesNotMatch(final, /edit r[01]|edits observed/i);
});

it("F5: planning, execution, and recovery prompts explain the verification contract", () => {
	const full = buildPlanModeContextPrompt(false, undefined, "project-memory");
	const compact = buildPlanModeContextPrompt(true, undefined, "project-memory");
	assert.ok(compact.length < full.length / 2);
	for (const prompt of [full, compact]) {
		assert.match(prompt, /project-memory\/plan\/<task-slug>\/README\.md/);
		assert.doesNotMatch(prompt, /docs\/plan\//);
		assert.match(prompt, /## Verification.*\$[A-Z_]+.*no literal secrets/i);
		assert.match(prompt, /## Re-plan If/);
		assert.match(prompt, /small tasks.*mandatory verification/i);
	}
	assert.equal(buildPlanReplanHandoffBlock({ ...base, mode: "planning" }), undefined);
	assert.equal(buildPlanReplanHandoffBlock(incomplete), undefined);
	const handoff = buildPlanReplanHandoffBlock({ ...incomplete, mode: "planning", replanTrigger: "consecutive_failures" });
	assert.match(handoff!, /\[RE-PLAN \/ RECOVERY CONTEXT\]/);
	assert.match(handoff!, /Verification #2 failed twice consecutively \(edit r3\)/);
	assert.match(handoff!, /1\/3 steps/);
	assert.match(handoff!, /fresh Execute approval/);
	assert.match(buildPlanReplanHandoffBlock({ ...base, mode: "planning", ...debt })!, /unverified edit debt/);
	assert.match(buildPlanReplanHandoffBlock({ ...base, mode: "planning", ...checks })!, /missing: Verification #2/);
	const options = { planDirectory: "pm/plan", archiveDirectory: "pm/archive", impactReminder: "Impact reminder" };
	const prompt = buildPlanExecutionContextPrompt({ ...base, ...checks, planPath }, [
		{ step: 1, text: "Already done", completed: true }, { step: 2, text: "Verify the result", completed: false },
	], options);
	assert.match(prompt, /2 required ## Verification checks/);
	assert.match(prompt, /\[DONE:n\].*progress only.*does not prove verification/i);
	assert.match(prompt, /dotdotgod validate.*docs\/project memory.*not.*code/i);
	assert.match(prompt, /first verification failure.*repair.*re-verify/i);
	assert.match(prompt, /second consecutive failure.*## Re-plan If.*\[REPLAN: <reason>\]/i);
	assert.match(prompt, /user input.*\[BLOCKED: <reason>\]/i);
	assert.match(prompt, /2\. Verify the result/);
	assert.doesNotMatch(prompt, /Already done/);
	assert.match(prompt, /pm\/plan\/<task-slug>\/.*pm\/archive\/plan\/<task-slug>\//);
	assert.ok(prompt.endsWith("Impact reminder"));
	assert.match(buildPlanExecutionContextPrompt(base, [], options), /passing substantive verification check after the latest edit/);
});

it("F6: review counts match across preview, RPC select, and clamped terminal widths", () => {
	initTheme("dark");
	const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
	const review = { source: "file", markdown: `## Verification\n\n${"wide ".repeat(40)}\n\n## Re-plan If` } as const;
	for (const [todoCount, verificationCount, counts] of [
		[1, 1, "1 step · 1 check"], [3, 2, "3 steps · 2 checks"], [0, 2, "0 steps · 2 checks"], [3, 0, "3 steps"],
	] as const) {
		assert.equal(formatPlanReviewCounts(todoCount, verificationCount), counts);
		assert.equal(buildPlanReviewTitle(planPath, todoCount, verificationCount), `Review plan before execution: ${planPath} (${counts})`);
		assert.equal(buildPlanReviewFallbackPrompt(planPath, todoCount, verificationCount), `Plan mode - choose next action after reviewing ${planPath} (${counts.replace(" · ", ", ")})`);
		const markdown = buildPlanReviewDisplayMarkdown({ planPath, todoCount, verificationCount, review });
		assert.ok(markdown.startsWith(`# Review plan before execution: ${planPath} (${counts})\n`));
		const component = new PlanReviewComponent(markdown, todoCount, theme, () => {}, verificationCount);
		for (const width of [80, 44]) {
			const lines = component.render(width);
			const safeWidth = Math.max(20, Math.min(width, process.stdout.columns || width) - 2);
			assert.equal(lines.length, getPlanReviewVisibleBodyLines(process.stdout.rows) + 7);
			assert.ok(lines.every((line) => visibleWidth(line) <= safeWidth));
			const heading = `── Plan Mode Review (${counts})`;
			if (safeWidth >= visibleWidth(heading) + 1) assert.ok(lines[0]?.startsWith(heading));
		}
	}
	assert.equal(buildPlanReviewTitle(planPath, 1), buildPlanReviewTitle(planPath, 1, 0));
});
