/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

export type { TodoItem } from "./todos.ts";
export { cleanStepText, extractDoneSteps, extractTodoItems, markCompletedSteps } from "./todos.ts";

export {
	normalizePlanCommandRequest,
	tokenizeShellCommand,
	isPlanArchivePath,
	isProtectedPlanArchiveRoot,
	isSafePlanArchiveCommand,
	isSafeCommand,
	getDotdotgodCliArgs,
	isDotdotgodCliCommand,
	isAutoAllowedDotdotgodPlanModeCommand,
	shouldAllowPlanModeBashCommand,
} from './tools.ts';

export type { ImpactCheckRecord, PendingImpactItem } from "./impact.ts";
export {
	formatReferenceExpansionSummary,
	formatCompactImpactSummary,
	normalizeImpactPath,
	shouldTrackImpactPath,
	upsertPendingImpact,
	clearPendingImpactForPath,
	mergeImpactCheckPaths,
	pendingImpactSummary,
	getChangedPathFromDotdotgodImpactCommand,
	isCommitLikeCommand,
	isBroadVerificationCommand,
	formatExpandableToolOutput,
	formatMultiImpactSummary,
} from "./impact.ts";

export type { PlanChoiceTriggerState, PlanCompactionFocus, PlanContextUsage, PlanningContextShapeTriggerState } from "./prompts.ts";
export {
	DEFAULT_PLAN_MODE_TOOLS,
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_COMPACTION_TOKEN_FALLBACK,
	PLAN_COMPACTION_CONTEXT_RESERVE,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	parsePlanModeExtraTools,
	resolvePlanModeTools,
	buildPlanModeFullContextPrompt,
	PLAN_MODE_COMPACT_CONTEXT_PROMPT,
	buildPlanModeContextPrompt,
	shouldShapePlanningContextOnAgentStart,
	shouldPromptForPlanChoice,
	formatPlanCompactionFocus,
	buildPlanCompactionInstructions,
	buildPlanCompactionResumePrompt,
	getPlanCompactionReason,
} from "./prompts.ts";

export type { LatestPlanningRequestSelection, LatestPlanningRequestSelectionInput, PlanModeRequestKind, ProjectMemoryContextCoverage, ProjectMemoryLoadDecision, ProjectMemoryLoadDecisionInput } from "./context.ts";
export {
	REQUIRED_PROJECT_MEMORY_MARKERS,
	detectPlanExecutionIntent,
	classifyPlanModeRequest,
	buildPlanModeRequestFraming,
	collectProjectMemoryContextCoverage,
	isPlanModeRuntimeRequest,
	selectLatestPlanningRequest,
	shouldLoadProjectMemoryForPlanning,
} from "./context.ts";

export type { PlanExecutionDecision, PlanExecutionTargetInput, PlanExecutionTargetResolution, PlanReviewChoice, PlanReviewDisplayMarkdownOptions, PlanReviewFileReader, PlanReviewMarkdown, PlanReviewScrollState } from "./plans.ts";
export {
	buildPlanExecutionDecision,
	buildPlanExecutionHandoff,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanReviewTitle,
	mapPlanReviewFallbackChoice,
	getPlanReviewScrollState,
	getCurrentPlanReadmePath,
	extractPlanSlugMentions,
	resolveMentionedPlanPath,
	resolvePlanExecutionTarget,
	extractPathMentions,
	selectPlanImpactPaths,
	selectPlanImpactPath,
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
} from "./plans.ts";
