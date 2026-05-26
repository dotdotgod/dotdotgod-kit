import { spawnSync } from "node:child_process";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { fallbackAskOneQuestion } from "./questions.ts";
import { buildRepairFollowUpPrompt, buildRetryExhaustedPrompt, buildStageReviewPrompt } from "./prompts.ts";
import type { PlanGeneratorStageState } from "./stage-state.ts";
import { appendAgentFeedback, setLlmReviewResult, setNextQuestions, setValidationCounters, setValidationResult, updateStageStatus, writeStageState } from "./stage-state.ts";
import { formatIso, stableBlockerSetKey } from "./utils.ts";

export interface LlmReviewResult {
	ok: boolean;
	blockers: string[];
	questions: string[];
	feedback: string[];
	requiredPlanUpdates: string[];
}

export interface StageValidationResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	blockers: string[];
}

const reviewBlockPattern = /```json dotdotgod-plan-stage\s*([\s\S]*?)```/g;
const MAX_STAGE_LOOPS = 5;
const MAX_REPAIR_ATTEMPTS = 5;

function followUpOptions(ctx: ExtensionCommandContext): { deliverAs: "followUp" } | undefined {
	return ctx.isIdle() ? undefined : { deliverAs: "followUp" };
}

export function parseLlmReviewJson(text: string): LlmReviewResult {
	const matches = [...text.matchAll(reviewBlockPattern)];
	if (matches.length !== 1) throw new Error("Expected exactly one json dotdotgod-plan-stage block");
	let parsed: unknown;
	const match = matches[0];
	if (!match?.[1]) throw new Error("Expected exactly one json dotdotgod-plan-stage block");
	try {
		parsed = JSON.parse(match[1]);
	} catch (error) {
		throw new Error(`Malformed LLM review JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!parsed || typeof parsed !== "object") throw new Error("LLM review must be an object");
	const result = parsed as Partial<LlmReviewResult>;
	if (typeof result.ok !== "boolean") throw new Error("LLM review missing ok boolean");
	for (const key of ["blockers", "questions", "feedback", "requiredPlanUpdates"] as const) {
		if (!Array.isArray(result[key]) || !result[key]?.every((value) => typeof value === "string")) {
			throw new Error(`LLM review missing ${key} string array`);
		}
	}
	const review = result as LlmReviewResult;
	if (review.ok && (review.blockers.length > 0 || review.questions.length > 0 || review.requiredPlanUpdates.length > 0)) {
		throw new Error("LLM review ok=true cannot include blockers, questions, or requiredPlanUpdates");
	}
	return review;
}

export function isUsableRecordedReview(state: PlanGeneratorStageState): boolean {
	try {
		const review = parseLlmReviewJson(state.markdown);
		return review.ok || review.blockers.length > 0 || review.questions.length > 0 || review.feedback.length > 0 || review.requiredPlanUpdates.length > 0;
	} catch {
		return true;
	}
}

export function runStageValidation(cwd: string, readmePath: string, stageId: string): StageValidationResult {
	const args = ["packages/cli/bin/dotdotgod.mjs", "plan", "validate", readmePath, "--stage", stageId, "--json"];
	const result = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
	const stdout = result.stdout ?? "";
	const stderr = result.stderr ?? "";
	if (result.status === 0) return { ok: true, stdout, stderr, blockers: [] };
	return { ok: false, stdout, stderr, blockers: [stdout.trim() || stderr.trim() || `dotdotgod plan validate failed with status ${result.status}`] };
}

export function requestLlmStageReview(pi: ExtensionAPI, taskDir: string, stageState: PlanGeneratorStageState, planFiles: string[], cliResultJson: string): void {
	pi.sendUserMessage(buildStageReviewPrompt(taskDir, stageState, planFiles, cliResultJson), { deliverAs: "followUp" });
}

function applyLoopCounters(stageState: PlanGeneratorStageState, blockers: string[], repairStyle: boolean): { repairAttempts: number; stageLoops: number; blockerSetKey: string; exhausted: boolean } {
	const key = stableBlockerSetKey(blockers);
	const sameBlockerSet = key === stageState.blockerSetKey;
	const stageLoops = stageState.stageLoops + 1;
	const repairAttempts = repairStyle ? (sameBlockerSet ? stageState.repairAttempts + 1 : 1) : stageState.repairAttempts;
	return { repairAttempts, stageLoops, blockerSetKey: key || "none", exhausted: stageLoops >= MAX_STAGE_LOOPS || repairAttempts >= MAX_REPAIR_ATTEMPTS };
}

export function recordBlockedStage(pi: ExtensionAPI, ctx: ExtensionCommandContext, taskDir: string, stageState: PlanGeneratorStageState, blockers: string[], requiredPlanUpdates: string[] = [], options: { repairStyle?: boolean; command?: string; cli?: string } = {}): PlanGeneratorStageState {
	const repairStyle = options.repairStyle ?? true;
	const counterBlockers = blockers.length > 0 ? blockers : ["stage blocked"];
	const counters = applyLoopCounters(stageState, counterBlockers, repairStyle);
	let next = setValidationCounters(stageState, counters);
	next = setValidationResult(next, {
		cli: options.cli ?? "failed",
		command: options.command ?? "not-recorded",
		time: formatIso(),
		blockers: counterBlockers,
		repairAttempts: counters.repairAttempts,
		stageLoops: counters.stageLoops,
		blockerSetKey: counters.blockerSetKey,
	});
	next = updateStageStatus(next, "blocked", counterBlockers.join("; "));
	writeStageState(taskDir, next);
	const prompt = counters.exhausted ? buildRetryExhaustedPrompt(counterBlockers) : buildRepairFollowUpPrompt(counterBlockers, requiredPlanUpdates);
	pi.sendUserMessage(prompt, followUpOptions(ctx));
	return next;
}

export async function handleRecordedLlmReview(pi: ExtensionAPI, ctx: ExtensionCommandContext, taskDir: string, stageState: PlanGeneratorStageState): Promise<{ state: PlanGeneratorStageState; completed: boolean; stopped: boolean }> {
	let review: LlmReviewResult;
	try {
		review = parseLlmReviewJson(stageState.markdown);
	} catch (error) {
		const blocker = `malformed-review: ${error instanceof Error ? error.message : String(error)}`;
		return { state: recordBlockedStage(pi, ctx, taskDir, stageState, [blocker], [], { repairStyle: true, cli: "passed" }), completed: false, stopped: true };
	}
	let next = setLlmReviewResult(stageState, JSON.stringify(review, null, 2));
	next = appendAgentFeedback(next, review.feedback);
	if (review.questions.length > 0) {
		next = setNextQuestions(next, review.questions);
		const counters = applyLoopCounters(next, review.questions.map((question) => `question: ${question}`), false);
		next = setValidationCounters(next, counters);
		next = updateStageStatus(next, "blocked", "user question required");
		writeStageState(taskDir, next);
		await fallbackAskOneQuestion(pi, ctx, review.questions[0]!);
		return { state: next, completed: false, stopped: true };
	}
	const blockers = [...review.blockers, ...review.requiredPlanUpdates.map((update) => `requiredPlanUpdate: ${update}`)];
	if (blockers.length > 0) {
		return { state: recordBlockedStage(pi, ctx, taskDir, next, blockers, review.requiredPlanUpdates, { repairStyle: true, cli: "passed" }), completed: false, stopped: true };
	}
	if (review.ok) {
		next = setValidationCounters(next, { repairAttempts: 0, stageLoops: 0, blockerSetKey: "none" });
		next = setNextQuestions(next, []);
		next = updateStageStatus(next, "completed", "LLM review passed");
		writeStageState(taskDir, next);
		return { state: next, completed: true, stopped: false };
	}
	return { state: next, completed: false, stopped: false };
}

export function blockerSetKey(blockers: string[]): string {
	return stableBlockerSetKey(blockers);
}

export function relativePlanReadme(cwd: string, taskDir: string): string {
	return path.relative(cwd, path.join(taskDir, "README.md")).split(path.sep).join("/");
}
