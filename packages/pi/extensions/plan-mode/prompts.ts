import { mcpTool } from "../shared/mcp.ts";
import type { SafeExecutionUxSummary } from "./execution-evidence.ts";
import { formatRemainingItemsSummary, formatSafeCheckRef } from "./presentation.ts";
import type { TodoItem } from "./todos.ts";

const DEFAULT_PLAN_MODE_TOOLS = [
	"read",
	"bash",
	mcpTool("project_impact"),
	mcpTool("impact_status"),
	"edit",
	"write",
	"grep",
	"find",
	"ls",
	"questionnaire",
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
];

export function parsePlanModeExtraTools(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const seen = new Set<string>();
	return value
		.split(",")
		.map((tool) => tool.trim())
		.filter((tool) => /^[A-Za-z0-9_:-]+$/.test(tool))
		.filter((tool) => {
			if (seen.has(tool)) return false;
			seen.add(tool);
			return true;
		});
}

export function resolvePlanModeTools(extraTools: unknown, availableTools?: readonly string[]): string[] {
	const available = availableTools ? new Set(availableTools) : undefined;
	const seen = new Set<string>();
	const requested = [...DEFAULT_PLAN_MODE_TOOLS, ...parsePlanModeExtraTools(extraTools)];
	return requested.filter((tool) => {
		if (seen.has(tool)) return false;
		if (available && !available.has(tool)) return false;
		seen.add(tool);
		return true;
	});
}


const PLAN_DECISION_GUIDANCE = `For saved plans, put user-owned open decisions under a ## Discussion Queue heading. Use rows like - [ ] Q1 scope blocks-execute-review: <question>, with indented - Why:, - Affects:, - Options: (nested - A: <choice> rows), - Recommended: A, - Verification impact:, and - Status: open fields. IDs must be unique. Required decisions use blocks-execute-review; deferring them does not authorize execution. The decision wizard collects options or custom answers and confirms them together before a single follow-up. Record confirmed answers with Status: answered and revise affected plan steps; preserve new or unresolved questions. Answer confirmation is not execution approval. Without interactive UI, surface unresolved questions in the final response and remain in planning.`;

function buildPlanModeFullContextPrompt(allowedTools = DEFAULT_PLAN_MODE_TOOLS, documentationRoot = "docs"): string {
	return `[PLAN MODE ACTIVE]
You are in Plan Mode. This is a planning-only exploration and design phase before code changes.

Restrictions:
- Allowed tools: ${allowedTools.join(", ")}
- edit/write are allowed only for Markdown planning documents within approved plan/report roots and routing indexes. Additional exact Markdown targets require explicit user approval; no UI means deny. Deny rules and instruction/config/source restrictions always win.
- Under ${documentationRoot}/, directories must use kebab-case and markdown file names must use UPPER_SNAKE_CASE.md, including README.md.
- Forbidden: source/code/config mutation, including Markdown implementation edits. This planning policy is not a filesystem sandbox.
- Bash and MCP execution use verified read-only commands or exact activated rules/session grants. Unknown simple commands require interactive once/session approval; destructive operations, arbitrary agent launches, and implementation commands remain forbidden.

Workflow:
1. Check for a matching active plan.
2. Reuse loaded memory and the documentation map, then use focused query and README indexes to select maintained docs and verify conclusions in them.
3. Inspect the source needed to confirm targets and constraints.
4. Run impact review on likely changed files and refine targets, risks, and verification.
5. For durable work, write and present ${documentationRoot}/plan/<task-slug>/README.md with scope, targets, and required completion gates. Promote small tasks that need mandatory verification commands to that saved plan for approval. Small tasks without mandatory commands may use a file-free checklist outside the Execute verification loop.
6. Resolve blocking decisions and stop until the user approves execution.

Saved plan structure:
- ## Plan: concrete executable numbered steps only.
- ## Verification: runnable commands in shell code fences or backticked single-command bullets, with expected observable outcomes. Use environment references like $API_TOKEN, no literal secrets.
- ## Re-plan If: concrete conditions that invalidate plan assumptions and require revising the plan rather than guessing.

${PLAN_DECISION_GUIDANCE}
Use questionnaire for clarification before a saved plan exists and web tools only for required external evidence.`;
}

function buildPlanModeCompactContextPrompt(documentationRoot: string): string {
	return `[PLAN MODE ACTIVE]
Compact reminder: remain in planning-only mode until execution approval. Keep source, code, and config unchanged. edit/write require approved plan/report roots or explicit exact-target approval; instruction/config/source writes stay forbidden. Unknown simple read-only commands require interactive approval; moving/deleting files requires execution mode. Reuse loaded memory and the documentation map, route focused requests through query and README indexes, verify selected docs, and run impact review after likely targets are known. Save durable work and small tasks requiring mandatory verification in ${documentationRoot}/plan/<task-slug>/README.md; otherwise use a file-free checklist. Use ## Plan: for numbered executable steps, ## Verification for runnable commands and expected results ($VAR references, no literal secrets), and ## Re-plan If for invalidated assumptions. Keep user decisions in Discussion Queue; required deferred items still block execution. The wizard confirms answers together, not execution. Record confirmed answers and preserve new questions.`;
}

export function buildPlanModeContextPrompt(compact = false, allowedTools = DEFAULT_PLAN_MODE_TOOLS, documentationRoot = "docs"): string {
	return compact ? buildPlanModeCompactContextPrompt(documentationRoot) : buildPlanModeFullContextPrompt(allowedTools, documentationRoot);
}

export function buildPlanExecutionContextPrompt(
	summary: SafeExecutionUxSummary,
	todos: readonly TodoItem[],
	options: { planDirectory: string; archiveDirectory: string; impactReminder?: string | undefined },
): string {
	const remaining = todos.filter(todo => !todo.completed);
	const todoList = remaining.length > 0
		? remaining.map(todo => `${todo.step}. ${todo.text}`).join("\n")
		: "No remaining tracked Plan: steps. Finish the approved scope and verify the result.";
	const { planPath, requiredCheckCount } = summary;
	const verification = requiredCheckCount > 0
		? `${planPath ?? "The active plan"} defines ${requiredCheckCount} required ## Verification ${requiredCheckCount === 1 ? "check" : "checks"}. Run them after the latest code/config edit and confirm they all pass.`
		: "Source/config edits require a passing substantive verification check after the latest edit.";
	return `[EXECUTING PLAN - Full tool access enabled]

Active plan: ${planPath ?? "unknown"}

Remaining plan steps:
${todoList}

Execute each step in order. Include its [DONE:n] tag in the same response; final responses must include a tag for every step completed in that turn (e.g., [DONE:1] [DONE:2]). [DONE:n] tracks step progress only and does not prove verification passed.
${verification}
After modification or coding work, run dotdotgod validate for docs/project memory; it is not a substitute for code or feature tests. Prefer the local source CLI when available: node packages/cli/bin/dotdotgod.mjs validate . --include-local-memory --check-index. If pre-existing docs errors prevent a pass, report the failure and emit [BLOCKED: <reason>] or [REPLAN: <reason>] rather than claiming a pass or editing out-of-scope files.
On the first verification failure, diagnose and repair within the approved scope, then re-verify. Report the failing check in your visible response.
On the second consecutive failure of the same check, or if a ## Re-plan If condition holds, explain the observation and emit [REPLAN: <reason>] instead of guessing.
When user input, credentials, or out-of-scope approval is needed, explain what is needed and emit [BLOCKED: <reason>].
When implementation and verification are complete, move the task directory from ${options.planDirectory}/<task-slug>/ to ${options.archiveDirectory}/plan/<task-slug>/ as the final housekeeping step and include its [DONE:n] tag.${options.impactReminder ? `\n\n${options.impactReminder}` : ""}`;
}

export function buildExecutionContinueMessage(summary: SafeExecutionUxSummary, nextAttempt: number): string {
	const { maxContinuations, remainingTodoSteps, editRevision, needsSubstantiveVerification, missingRequiredCheckIndices, planPath, lastCheck } = summary;
	const lines = [`[PLAN EXECUTION CONTINUATION ${nextAttempt}/${maxContinuations}]`];
	if (remainingTodoSteps.length) lines.push(`Remaining Plan steps: ${remainingTodoSteps.map(n => `#${n}`).join(", ")}.`);
	if (needsSubstantiveVerification) {
		lines.push(editRevision > 0
			? `Source/config edits remain unverified (edit r${editRevision}). Run a substantive verification check.`
			: "Unverified edit debt carried forward from prior execution/recovery without a passing substantive verification check yet.");
	}
	if (missingRequiredCheckIndices.length) {
		const missing = missingRequiredCheckIndices.map(index => formatSafeCheckRef({ kind: "plan", index })).join(", ");
		lines.push(`Missing Verification checks in ${planPath ?? "the active plan"}${editRevision > 0 ? ` for edit r${editRevision}` : ""}: ${missing}.`);
	}
	if (lastCheck && lastCheck.outcome !== "passed") {
		const ref = formatSafeCheckRef(lastCheck.ref);
		if (lastCheck.ref.kind !== "unconfirmed" && lastCheck.outcome !== "aborted" && lastCheck.consecutiveFailures > 0) {
			lines.push(`Last verification failed: ${ref} (attempt ${lastCheck.consecutiveFailures}/2, outcome: ${lastCheck.outcome}). Diagnose and fix within the approved scope, then re-run ${ref}. If the same check fails again or cannot pass, report the failing check and remaining work in your visible response and emit [REPLAN: <reason>].`);
		} else {
			lines.push(`Last verification did not confirm pass: ${ref} (outcome: ${lastCheck.outcome}). Re-run a concrete verification check within the approved scope.`);
		}
	}
	lines.push("Emit [REPLAN: <reason>] if plan assumptions no longer hold; emit [BLOCKED: <reason>] if user input or out-of-scope approval is required.");
	if (nextAttempt === maxContinuations) {
		lines.push(`Final auto-continuation (${nextAttempt}/${maxContinuations}): if execution still cannot complete, state what is verified, what remains unfinished, and what user action is needed in your visible response.`);
	}
	return lines.join("\n");
}

export function buildPlanReplanHandoffBlock(summary: SafeExecutionUxSummary): string | undefined {
	const { mode, planPath, todoCompleted, todoTotal, editRevision, replanTrigger, lastCheck, needsSubstantiveVerification, missingRequiredCheckIndices } = summary;
	if (mode !== "planning") return undefined;
	const hasFailedCheck = lastCheck && lastCheck.outcome !== "passed";
	if (!replanTrigger && !hasFailedCheck && !needsSubstantiveVerification && !missingRequiredCheckIndices.length && !todoCompleted) return undefined;
	const lines = ["[RE-PLAN / RECOVERY CONTEXT]"];
	if (planPath) lines.push(`Active plan: ${planPath}`);
	if (replanTrigger === "consecutive_failures") {
		const ref = lastCheck ? formatSafeCheckRef(lastCheck.ref) : "A verification check";
		lines.push(`${ref} failed twice consecutively${editRevision > 0 ? ` (edit r${editRevision})` : ""}.`);
	} else if (replanTrigger === "signal") {
		lines.push("Execution requested re-planning ([REPLAN]).");
	} else {
		lines.push("Execution progress or outstanding verification was carried forward.");
	}
	if (todoTotal > 0) lines.push(`Progress preserved: ${todoCompleted}/${todoTotal} steps.`);
	const remaining = formatRemainingItemsSummary(summary);
	if (remaining) lines.push(`Remaining: ${remaining}.`);
	lines.push("Revise the plan and obtain fresh Execute approval through plan review before mutating code.");
	return lines.join("\n");
}

export interface PlanningContextShapeTriggerState {
	mode: "off" | "planning" | "reviewing" | "executing";
	planningContextShapePending: boolean;
}

export function shouldShapePlanningContextOnAgentStart(state: PlanningContextShapeTriggerState): boolean {
	return state.mode === "planning" && state.planningContextShapePending;
}

export interface PlanChoiceTriggerState {
	mode: "off" | "planning" | "reviewing" | "executing";
	hasUI: boolean;
	pendingPlanChoicePath?: string | undefined;
	suppressPlanChoice?: boolean | undefined;
}

export function shouldPromptForPlanChoice(state: PlanChoiceTriggerState): boolean {
	return state.mode === "planning" && state.hasUI && !state.suppressPlanChoice && Boolean(state.pendingPlanChoicePath);
}
