import type { ExecutionNoticeKind, PlanReviewFailureReason, SafeCheckRef, SafeExecutionUxSummary } from "./execution-evidence.ts";

export function formatSafeCheckRef(ref: SafeCheckRef): string {
	switch (ref.kind) {
		case "plan": return `Verification #${ref.index}`;
		case "generic": return `${ref.runner} check`;
		case "unconfirmed": return "unconfirmed check";
	}
}

export function formatPlanModeStatus(summary: SafeExecutionUxSummary): { text: string; color: "warning" | "accent" } | undefined {
	if (summary.mode === "off") return undefined;
	if (summary.mode === "planning" || summary.mode === "reviewing") return { text: "⏸ plan", color: "warning" };
	let text = summary.todoTotal > 0 ? `📋 ${summary.todoCompleted}/${summary.todoTotal}` : "📋 exec";
	if (summary.pauseState) return { text: `${text} · ${summary.pauseState === "blocked" ? "blocked" : "paused"}`, color: "warning" };
	if (summary.requiredCheckCount > 0) text += ` · V${summary.passedRequiredCheckCount}/${summary.requiredCheckCount}`;
	if (summary.needsSubstantiveVerification) text += " · verify";
	if (summary.continuationCount > 0) text += ` (${summary.continuationCount}/${summary.maxContinuations})`;
	return { text, color: "accent" };
}

export function formatRemainingItemsSummary(summary: SafeExecutionUxSummary): string | undefined {
	const { remainingTodoSteps, editRevision, needsSubstantiveVerification, missingRequiredCheckIndices, lastCheck } = summary;
	const clauses = [];
	if (remainingTodoSteps.length) clauses.push(`steps: ${remainingTodoSteps.map(n => `#${n}`).join(", ")}`);
	if (needsSubstantiveVerification) clauses.push(editRevision > 0 ? `unverified edits at r${editRevision}` : "unverified edit debt");
	if (missingRequiredCheckIndices.length) {
		const missing = missingRequiredCheckIndices.map(index => formatSafeCheckRef({ kind: "plan", index })).join(", ");
		clauses.push(`missing: ${missing}${editRevision > 0 ? ` at edit r${editRevision}` : ""}`);
	}
	if (lastCheck && lastCheck.outcome !== "passed") clauses.push(`last check: ${formatSafeCheckRef(lastCheck.ref)} (${lastCheck.outcome})`);
	return clauses.join("; ") || undefined;
}

const pauseGuidance = "Reply to continue, or run /dd:plan <reason> to revise the plan.";

export function formatExecutionNotice(kind: ExecutionNoticeKind, summary: SafeExecutionUxSummary): { message: string; level: "info" | "warning" } {
	const { planPath, todoCompleted, todoTotal, editRevision, lastCheck, continuationCount, maxContinuations } = summary;
	const progress = todoTotal > 0 ? `${todoCompleted}/${todoTotal} steps` : undefined;
	const reviewAction = planPath
		? `Run /dd:plan ${planPath} or revise ${planPath} to review and re-approve Execute.`
		: "Revise the active plan to review and re-approve Execute.";
	let message: string;
	switch (kind) {
		case "blocked":
			return { message: `Execution paused ([BLOCKED]): waiting for user input. See the last assistant message. ${pauseGuidance}`, level: "info" };
		case "no_progress":
		case "budget_exhausted": {
			const items = formatRemainingItemsSummary(summary);
			const remaining = items ? ` (${items})` : "";
			message = kind === "no_progress"
				? `Execution paused (no progress): remaining items unchanged${remaining}. ${pauseGuidance}`
				: `Execution paused (auto-continuation limit ${continuationCount}/${maxContinuations} reached)${items ? `: remaining items${remaining}` : ""}. ${pauseGuidance}`;
			break;
		}
		case "replan_consecutive_failures":
		case "replan_signal": {
			const ref = lastCheck ? formatSafeCheckRef(lastCheck.ref) : "A verification check";
			const revision = editRevision > 0 ? ` (edit r${editRevision})` : "";
			const reason = kind === "replan_consecutive_failures"
				? `Returned to Plan Mode: ${ref} failed twice consecutively${revision}.`
				: "Returned to Plan Mode ([REPLAN]): see the last assistant message for details.";
			message = `${reason}${progress ? ` Progress preserved (${progress}).` : ""} ${reviewAction}`;
			break;
		}
		case "legacy_executing_recovery":
			message = `Resumed legacy executing plan in Plan Mode: verification evidence is unavailable${progress ? ` (progress preserved: ${progress})` : ""}. ${reviewAction}`;
			break;
		case "corrupted_evidence_recovery":
			message = `Plan execution evidence could not be restored; returned to Plan Mode for safe re-review. ${reviewAction}`;
			break;
		case "branch_switch_executing":
			message = `Switched branch while executing${planPath ? ` ${planPath}` : ""}: prior passes may not reflect current disk files; re-verify before completing.`;
			break;
	}
	return { message, level: "warning" };
}

const unreadablePlan = "Plan review failed safely; execution was not started. Ensure the saved plan file is readable within the project plan root.";
const reviewFailures: Record<PlanReviewFailureReason, string> = {
	invalid_path: unreadablePlan,
	unreadable: unreadablePlan,
	malformed_verification: "Plan review failed safely; execution was not started. Fix the malformed Verification section in the saved plan and review again.",
	changed_during_review: "Plan changed during review. Execution approval discarded; review the updated plan.",
	unexpected_error: "Plan review failed safely; execution was not started. Review the saved plan and try again.",
};

export function formatPlanReviewFailureNotice(reason: PlanReviewFailureReason): { message: string; level: "warning" } {
	return { message: reviewFailures[reason], level: "warning" };
}
