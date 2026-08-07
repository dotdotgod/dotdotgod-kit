/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

export type { TodoItem } from "./todos.ts";
export { extractTodoItems, markCompletedSteps } from "./todos.ts";

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

export type { PendingImpactItem } from "./impact.ts";
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
	getChangedPathsFromDotdotgodImpactCommand,
	isCommitLikeCommand,
	isBroadVerificationCommand,
	formatExpandableToolOutput,
	formatMultiImpactSummary,
} from "./impact.ts";

export type { PlanChoiceTriggerState, PlanCompactionFocus, PlanContextUsage, PlanningContextShapeTriggerState } from "./prompts.ts";
export {
	PLAN_COMPACTION_PERCENT_THRESHOLD,
	PLAN_MODE_COMPACTION_INSTRUCTIONS,
	parsePlanModeExtraTools,
	resolvePlanModeTools,
	buildPlanModeContextPrompt,
	shouldShapePlanningContextOnAgentStart,
	shouldPromptForPlanChoice,
	formatPlanCompactionFocus,
	buildPlanCompactionInstructions,
	getPlanCompactionReason,
} from "./prompts.ts";

export type { LatestPlanningRequestSelection, LatestPlanningRequestSelectionInput, PlanModeRequestKind } from "./context.ts";
export {
	detectPlanExecutionIntent,
	classifyPlanModeRequest,
	buildPlanModeRequestFraming,
	isPlanModeRuntimeRequest,
	selectLatestPlanningRequest,
} from "./context.ts";

export type { DiscussionQueueAction, DiscussionQueueItem, DiscussionQueueItemState, DiscussionQueueOption, DiscussionQueueResult, DiscussionQueueSummary, PlanExecutionDecision, PlanExecutionTargetInput, PlanExecutionTargetResolution, PlanModeUserMessageDeliveryOptions, PlanRefinementPromptOptions, PlanReviewAction, PlanReviewChoice, PlanReviewDisplayMarkdownOptions, PlanReviewFileReader, PlanReviewMarkdown, PlanReviewScrollState } from "./plans.ts";
export {
	PLAN_REVIEW_ACTIONS,
	planModeFollowUpDeliveryOptions,
	buildDiscussionQueueFollowUp,
	buildPlanExecutionDecision,
	buildPlanExecutionHandoff,
	buildPlanReviewDisplayMarkdown,
	buildPlanReviewMarkdown,
	buildPlanReviewTitle,
	buildPlanReviewRefinePrompt,
	extractDiscussionQueueItems,
	mapPlanReviewFallbackChoice,
	getNextPlanReviewActionIndex,
	getPlanReviewActionChoice,
	getPlanReviewScrollState,
	summarizeDiscussionQueue,
	getCurrentPlanReadmePath,
	extractPlanSlugMentions,
	resolveMentionedPlanPath,
	resolvePlanExecutionTarget,
	extractPathMentions,
	selectPlanImpactPaths,
	hasExplicitBracketReferences,
	hasLikelyFuzzyReferences,
} from "./plans.ts";
