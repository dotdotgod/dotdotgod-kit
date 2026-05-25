import { readFileSync } from "node:fs";
import * as path from "node:path";
import type { PlanGeneratorStageState } from "./stage-state.ts";

export const PLAN_GENERATOR_HELP = `Usage:
/plan-generator
/plan-generator <request>
/plan-generator docs/plan/<task>
/plan-generator docs/plan/<task>/README.md
/plan-generator --help`;

export function buildStageReviewPrompt(taskDir: string, stageState: PlanGeneratorStageState, planFiles: string[], cliResultJson: string): string {
	const files = planFiles.map((filePath) => {
		const rel = path.relative(taskDir, filePath).split(path.sep).join("/");
		return `## File: ${rel}\n\n${readFileSync(filePath, "utf8")}`;
	}).join("\n\n---\n\n");
	return `Review the current dotdotgod plan-generator stage.

Return exactly one fenced block with language \`json dotdotgod-plan-stage\`. Do not edit files directly in this response.

Review criteria:
- The stage state and normal plan files must be consistent.
- The plan must be specific, verifiable, and aligned with user responses.
- Put user-facing questions in questions.
- Put required normal-plan-file edits in requiredPlanUpdates.

Stage 09 subagent handoff quality gate:
- README Subagent Workstreams must index every *_AGENT_HANDOFF.md file.
- Minimum handoff set is coordinator plus implementation, validation/contract, and docs/verification unless README explains why fewer suffice.
- Every handoff must include these sections: Mission, Read First, Target Area, Required Behavior, Do Not, Verification, and numbered Plan:.
- Fail Stage 09 if target files are omitted or vague.
- Fail Stage 09 if verification is only generic run tests guidance instead of focused commands/evidence.
- Fail Stage 09 if do-not rules are missing.
- Fail Stage 09 if acceptance is vague, such as make it work, instead of observable required behavior.
- Fail Stage 09 if Plan: is bullet-only rather than numbered.
- Fail Stage 09 if a handoff depends on chat history instead of being executable from the document alone.
- Coordinator handoff must include phase order, assignment order, merge/review points, final verification, and archive criteria.
- Pass valid handoffs when they provide concrete target files, focused verification, do-not rules, observable behavior, numbered plans, and chat-independent context.

CLI validation result:

\`\`\`json
${cliResultJson}
\`\`\`

Stage state:

${stageState.markdown}

Discovered normal plan files:

${files || "(none)"}

Required output:

\`\`\`json dotdotgod-plan-stage
{
  "ok": false,
  "blockers": [],
  "questions": [],
  "feedback": [],
  "requiredPlanUpdates": []
}
\`\`\``;
}

export function buildRepairFollowUpPrompt(blockers: string[], requiredPlanUpdates: string[]): string {
	return `Repair the current plan-generator stage before it can advance.

Blockers:
${blockers.map((blocker) => `- ${blocker}`).join("\n") || "- none"}

Required normal plan file updates:
${requiredPlanUpdates.map((update) => `- ${update}`).join("\n") || "- none"}

Update normal plan markdown files only. Do not treat .dotdotgod-plan files as the executable plan.`;
}

export function buildRetryExhaustedPrompt(blockers: string[]): string {
	return `The plan-generator stage is still blocked after five repair attempts for the same blocker set.

Blockers:
${blockers.map((blocker) => `- ${blocker}`).join("\n") || "- none"}

Please provide direction before another repair attempt.`;
}

export function buildSingleQuestionFollowUp(question: string): string {
	return `Plan-generator needs one answer before continuing:\n\n${question}`;
}
