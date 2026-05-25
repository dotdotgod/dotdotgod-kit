import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { formatIso } from "./utils.ts";

export type StageStatus = "created" | "blocked" | "completed";

export type PlanGeneratorStageId =
	| "01-intake"
	| "02-context-load"
	| "03-discovery"
	| "04-decomposition"
	| "05-decision-queue"
	| "06-approval"
	| "07-execution-slices"
	| "08-verify-replan-close"
	| "09-subagent-workstreams";

export interface PlanGeneratorStageDefinition {
	id: PlanGeneratorStageId;
	title: string;
	fileName: string;
}

export interface PlanGeneratorStageState {
	stage: PlanGeneratorStageId;
	status: StageStatus;
	updated: string;
	repairAttempts: number;
	stageLoops: number;
	blockerSetKey: string;
	markdown: string;
}

export const PLAN_GENERATOR_STAGES: PlanGeneratorStageDefinition[] = [
	{ id: "01-intake", title: "01 Intake", fileName: "01_INTAKE.md" },
	{ id: "02-context-load", title: "02 Context Load", fileName: "02_CONTEXT_LOAD.md" },
	{ id: "03-discovery", title: "03 Discovery", fileName: "03_DISCOVERY.md" },
	{ id: "04-decomposition", title: "04 Decomposition", fileName: "04_DECOMPOSITION.md" },
	{ id: "05-decision-queue", title: "05 Decision Queue", fileName: "05_DECISION_QUEUE.md" },
	{ id: "06-approval", title: "06 Approval", fileName: "06_APPROVAL.md" },
	{ id: "07-execution-slices", title: "07 Execution Slices", fileName: "07_EXECUTION_SLICES.md" },
	{ id: "08-verify-replan-close", title: "08 Verify Replan Close", fileName: "08_VERIFY_REPLAN_CLOSE.md" },
	{ id: "09-subagent-workstreams", title: "09 Subagent Workstreams", fileName: "09_SUBAGENT_WORKSTREAMS.md" },
];

export const PLAN_GENERATOR_STATE_DIR = ".dotdotgod-plan";

export function getStageDefinition(stageId: PlanGeneratorStageId): PlanGeneratorStageDefinition {
	const stage = PLAN_GENERATOR_STAGES.find((candidate) => candidate.id === stageId);
	if (!stage) throw new Error(`Unknown plan-generator stage: ${stageId}`);
	return stage;
}

export function getStageFileName(stageId: PlanGeneratorStageId): string {
	return getStageDefinition(stageId).fileName;
}

export function getStageFilePath(taskDir: string, stageId: PlanGeneratorStageId): string {
	return path.join(taskDir, PLAN_GENERATOR_STATE_DIR, getStageFileName(stageId));
}

export function getNextStageId(stageId: PlanGeneratorStageId): PlanGeneratorStageId | undefined {
	const index = PLAN_GENERATOR_STAGES.findIndex((stage) => stage.id === stageId);
	return index >= 0 ? PLAN_GENERATOR_STAGES[index + 1]?.id : undefined;
}

export function isFinalStage(stageId: PlanGeneratorStageId): boolean {
	return !getNextStageId(stageId);
}

export function createStageTemplate(stageId: PlanGeneratorStageId, status: StageStatus = "created", now = new Date()): string {
	const stage = getStageDefinition(stageId);
	const updated = formatIso(now);
	return `# ${stage.title}

Stage: ${stage.id}
Status: ${status}
Updated: ${updated}

## User Responses

## Agent Feedback

## Validation Result

- CLI: not-run
- Command: not-run
- Time: ${updated}
- Repair Attempts: 0
- Stage Loops: 0
- Blocker Set Key: none
- Blockers:

## LLM Review Result

\`\`\`json dotdotgod-plan-stage
{
  "ok": false,
  "blockers": [],
  "questions": [],
  "feedback": [],
  "requiredPlanUpdates": []
}
\`\`\`

## Next Questions

## Status History

- ${updated}: ${status} — stage initialized
`;
}

function replaceSection(markdown: string, heading: string, body: string): string {
	const pattern = new RegExp(`(^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\n)([\\s\\S]*?)(?=^## |\\s*$)`, "m");
	const normalizedBody = body.replace(/^\n+|\n+$/g, "");
	if (pattern.test(markdown)) return markdown.replace(pattern, `$1\n${normalizedBody}\n\n`);
	return `${markdown.replace(/\s*$/, "")}\n\n## ${heading}\n\n${normalizedBody}\n`;
}

function appendToSection(markdown: string, heading: string, entry: string): string {
	const pattern = new RegExp(`(^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\n)([\\s\\S]*?)(?=^## |\\s*$)`, "m");
	if (!pattern.test(markdown)) return `${markdown.replace(/\s*$/, "")}\n\n## ${heading}\n\n${entry}\n`;
	return markdown.replace(pattern, (_match, prefix: string, body: string) => `${prefix}${body.replace(/\s*$/, "")}\n${entry}\n\n`);
}

function parseCounter(markdown: string, label: string): number {
	const value = Number.parseInt(markdown.match(new RegExp(`^- ${label}:\\s*(\\d+)\\s*$`, "m"))?.[1] ?? "0", 10);
	return Number.isFinite(value) ? value : 0;
}

export function parseStageState(markdown: string): PlanGeneratorStageState {
	const stage = markdown.match(/^Stage:\s*(\S+)\s*$/m)?.[1] as PlanGeneratorStageId | undefined;
	const status = markdown.match(/^Status:\s*(created|blocked|completed)\s*$/m)?.[1] as StageStatus | undefined;
	const updated = markdown.match(/^Updated:\s*(\S+)\s*$/m)?.[1];
	if (!stage || !PLAN_GENERATOR_STAGES.some((candidate) => candidate.id === stage)) {
		throw new Error("Stage state is missing a valid Stage field");
	}
	if (!status) throw new Error("Stage state is missing a valid Status field");
	if (!updated) throw new Error("Stage state is missing an Updated field");
	const repairAttempts = parseCounter(markdown, "Repair Attempts");
	const stageLoops = parseCounter(markdown, "Stage Loops");
	const blockerSetKey = markdown.match(/^- Blocker Set Key:\s*(.*?)\s*$/m)?.[1] || "none";
	return { stage, status, updated, repairAttempts, stageLoops, blockerSetKey, markdown };
}

export function readStageState(taskDir: string, stageId: PlanGeneratorStageId): PlanGeneratorStageState | undefined {
	const filePath = getStageFilePath(taskDir, stageId);
	if (!existsSync(filePath)) return undefined;
	return parseStageState(readFileSync(filePath, "utf8"));
}

export function writeStageState(taskDir: string, state: PlanGeneratorStageState): void {
	const filePath = getStageFilePath(taskDir, state.stage);
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, state.markdown);
}

export function ensureStageFile(taskDir: string, stageId: PlanGeneratorStageId, now = new Date()): PlanGeneratorStageState {
	const existing = readStageState(taskDir, stageId);
	if (existing) return existing;
	const markdown = createStageTemplate(stageId, "created", now);
	const state = parseStageState(markdown);
	writeStageState(taskDir, state);
	return state;
}

export function selectCurrentStage(taskDir: string): PlanGeneratorStageDefinition | undefined {
	for (const stage of PLAN_GENERATOR_STAGES) {
		const state = readStageState(taskDir, stage.id);
		if (!state || state.status !== "completed") return stage;
	}
	return undefined;
}

export function ensureCurrentStageFile(taskDir: string, now = new Date()): PlanGeneratorStageState | undefined {
	const stage = selectCurrentStage(taskDir);
	return stage ? ensureStageFile(taskDir, stage.id, now) : undefined;
}

export function updateStageStatus(state: PlanGeneratorStageState, status: StageStatus, reason: string, now = new Date()): PlanGeneratorStageState {
	const updated = formatIso(now);
	let markdown = state.markdown
		.replace(/^Status:\s*(created|blocked|completed)\s*$/m, `Status: ${status}`)
		.replace(/^Updated:\s*\S+\s*$/m, `Updated: ${updated}`);
	markdown = appendToSection(markdown, "Status History", `- ${updated}: ${status} — ${reason}`);
	return parseStageState(markdown);
}

export function setValidationCounters(state: PlanGeneratorStageState, values: { repairAttempts?: number; stageLoops?: number; blockerSetKey?: string }): PlanGeneratorStageState {
	let markdown = state.markdown;
	const replacements = [
		["Repair Attempts", values.repairAttempts],
		["Stage Loops", values.stageLoops],
		["Blocker Set Key", values.blockerSetKey],
	] as const;
	for (const [label, value] of replacements) {
		if (value === undefined) continue;
		const replacement = `- ${label}: ${value}`;
		const regex = new RegExp(`^- ${label}:.*$`, "m");
		markdown = regex.test(markdown) ? markdown.replace(regex, replacement) : markdown.replace(/(## Validation Result\s*\n)/, `$1\n${replacement}\n`);
	}
	return parseStageState(markdown);
}

export function setRepairAttempts(state: PlanGeneratorStageState, repairAttempts: number): PlanGeneratorStageState {
	return setValidationCounters(state, { repairAttempts });
}

export function setValidationResult(state: PlanGeneratorStageState, details: { cli: string; command: string; time?: string; blockers: string[]; repairAttempts?: number; stageLoops?: number; blockerSetKey?: string }): PlanGeneratorStageState {
	const body = [
		`- CLI: ${details.cli}`,
		`- Command: ${details.command}`,
		`- Time: ${details.time ?? state.updated}`,
		`- Repair Attempts: ${details.repairAttempts ?? state.repairAttempts}`,
		`- Stage Loops: ${details.stageLoops ?? state.stageLoops}`,
		`- Blocker Set Key: ${(details.blockerSetKey ?? state.blockerSetKey) || "none"}`,
		"- Blockers:",
		...(details.blockers.length > 0 ? details.blockers.map((blocker) => `  - ${blocker}`) : ["  - none"]),
	].join("\n");
	return parseStageState(replaceSection(state.markdown, "Validation Result", body));
}

export function setLlmReviewResult(state: PlanGeneratorStageState, reviewJson: string): PlanGeneratorStageState {
	return parseStageState(replaceSection(state.markdown, "LLM Review Result", `\`\`\`json dotdotgod-plan-stage\n${reviewJson.trim()}\n\`\`\``));
}

export function setNextQuestions(state: PlanGeneratorStageState, questions: string[]): PlanGeneratorStageState {
	return parseStageState(replaceSection(state.markdown, "Next Questions", questions.map((question, index) => `${index + 1}. ${question}`).join("\n")));
}

export function appendAgentFeedback(state: PlanGeneratorStageState, feedback: string[], now = new Date()): PlanGeneratorStageState {
	if (feedback.length === 0) return state;
	const updated = formatIso(now);
	return parseStageState(appendToSection(state.markdown, "Agent Feedback", feedback.map((item) => `- ${updated}: ${item}`).join("\n")));
}

export function appendUserResponse(state: PlanGeneratorStageState, question: string, response: string, now = new Date()): PlanGeneratorStageState {
	const updated = formatIso(now);
	return parseStageState(appendToSection(state.markdown, "User Responses", `- ${updated}: ${question}\n  - Response: ${response}`));
}
