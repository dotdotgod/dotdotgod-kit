import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { askFirstRequest } from "./questions.ts";
import { PLAN_GENERATOR_HELP } from "./prompts.ts";
import { discoverPlanMarkdownFiles, ensureInitialReadme, normalizePlanTaskPath, resolveCollisionFreeTaskPath, type PlanGeneratorTaskPath } from "./plan-files.ts";
import { handleRecordedLlmReview, isUsableRecordedReview, recordBlockedStage, requestLlmStageReview, runStageValidation } from "./review.ts";
import { ensureCurrentStageFile, ensureStageFile, getNextStageId, setValidationResult, writeStageState } from "./stage-state.ts";

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, level);
}

function followUpOptions(ctx: ExtensionCommandContext): { deliverAs: "followUp" } | undefined {
	return ctx.isIdle() ? undefined : { deliverAs: "followUp" };
}

function titleFromSlug(slug: string): string {
	return slug.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function resolveNewTask(cwd: string, request: string): PlanGeneratorTaskPath {
	return resolveCollisionFreeTaskPath(cwd, request);
}

async function startNewGeneratorTask(pi: ExtensionAPI, ctx: ExtensionCommandContext, request: string): Promise<void> {
	const task = resolveNewTask(ctx.cwd, request);
	ensureInitialReadme(task, titleFromSlug(task.taskSlug), request);
	const stageState = ensureStageFile(task.taskDir, "01-intake");
	pi.appendEntry("plan-generator-start", { task: path.relative(ctx.cwd, task.taskDir), stage: stageState.stage });
	notify(ctx, `Started /plan-generator task docs/plan/${task.taskSlug}.`, "info");
	pi.sendUserMessage(`Continue authoring the durable plan at docs/plan/${task.taskSlug}/README.md using /plan-generator stage ${stageState.stage}. Ask exactly one unresolved question if needed.`, followUpOptions(ctx));
}

async function resumeGeneratorTask(pi: ExtensionAPI, ctx: ExtensionCommandContext, task: PlanGeneratorTaskPath): Promise<void> {
	let stageState = ensureCurrentStageFile(task.taskDir);
	if (!stageState) {
		const relativeReadme = path.relative(ctx.cwd, task.readmePath).split(path.sep).join("/");
		pi.sendUserMessage(`Plan-generator stages are complete for ${relativeReadme}. The durable plan is ready for execution review; Stage 09 completion does not start source/config execution.`, followUpOptions(ctx));
		notify(ctx, `Plan-generator stages complete for ${relativeReadme}.`, "info");
		return;
	}
	while (stageState) {
		const planFiles = discoverPlanMarkdownFiles(task.taskDir);
		const readmePath = path.relative(ctx.cwd, task.readmePath).split(path.sep).join("/");
		const validation = runStageValidation(ctx.cwd, readmePath, stageState.stage);
		pi.appendEntry("plan-generator-resume", { task: path.relative(ctx.cwd, task.taskDir), stage: stageState.stage, cliOk: validation.ok });
		const validationCommand = `dotdotgod plan validate ${readmePath} --stage ${stageState.stage} --json`;
		if (!validation.ok) {
			recordBlockedStage(pi, ctx, task.taskDir, stageState, validation.blockers, [], { command: validationCommand, cli: "failed" });
			notify(ctx, `Plan-generator resumed ${readmePath}; stage ${stageState.stage} is blocked by CLI validation.`, "warning");
			return;
		}
		stageState = setValidationResult(stageState, { cli: "passed", command: validationCommand, blockers: [] });
		writeStageState(task.taskDir, stageState);
		if (!isUsableRecordedReview(stageState)) {
			requestLlmStageReview(pi, task.taskDir, stageState, planFiles, validation.stdout || JSON.stringify({ ok: true }));
			notify(ctx, `Plan-generator resumed ${readmePath}; review follow-up queued.`, "info");
			return;
		}
		const reviewResult = await handleRecordedLlmReview(pi, ctx, task.taskDir, stageState);
		if (reviewResult.stopped || !reviewResult.completed) return;
		const nextStageId = getNextStageId(reviewResult.state.stage);
		if (!nextStageId) {
			pi.sendUserMessage(`Plan-generator Stage 09 is complete for ${readmePath}. The durable plan is ready for execution review; do not start source/config execution from this handoff.`, followUpOptions(ctx));
			notify(ctx, `Plan-generator Stage 09 complete for ${readmePath}.`, "info");
			return;
		}
		stageState = ensureStageFile(task.taskDir, nextStageId);
	}
}

async function runPlanGeneratorCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string): Promise<void> {
	const request = args.trim();
	if (request === "--help" || request === "-h") {
		notify(ctx, PLAN_GENERATOR_HELP, "info");
		return;
	}
	const explicitTask = request ? normalizePlanTaskPath(ctx.cwd, request) : undefined;
	if (explicitTask) {
		await resumeGeneratorTask(pi, ctx, explicitTask);
		return;
	}
	const initialRequest = request || await askFirstRequest(ctx);
	if (!initialRequest) {
		pi.sendUserMessage("What durable plan should /plan-generator create?", followUpOptions(ctx));
		return;
	}
	await startNewGeneratorTask(pi, ctx, initialRequest);
}

export default function planGeneratorExtension(pi: ExtensionAPI): void {
	pi.registerCommand("plan-generator", {
		description: "Create or resume durable dotdotgod staged plans",
		handler: async (args, ctx) => runPlanGeneratorCommand(pi, ctx, args),
	});
}

export { runPlanGeneratorCommand, startNewGeneratorTask, resumeGeneratorTask };
